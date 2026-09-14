/**
 * Multi-format stock-in / scan-bill extraction test suite.
 * Hits live API: parse-purchase + upload for every fixture.
 */
const fs = require('fs');
const path = require('path');

const BASE = process.env.API_URL || 'http://127.0.0.1:4000/api/v1';
const SAMPLES = path.join(__dirname, '../apps/web/public/samples');

const EXPECT = {
  'demo-supplier-invoice.txt': {
    minLines: 5,
    invoiceNumber: /PH\/2026-27\/0142/i,
    supplier: /PowerHub/i,
    gstin: /07AAACP1234A1Z5/,
    names: [/Exide/i, /Luminous/i, /V-Guard|VGuard/i, /Cable/i, /Eastman/i],
  },
  'bills/01-slno-mobile-gst.txt': {
    minLines: 4,
    invoiceNumber: /SMD\/2026-27\/0881/i,
    supplier: /Shree Mobile|Mobile Distributors/i,
    gstin: /24AABCS1429B1ZK/,
    names: [/Samsung/i, /Boat/i, /Mi|SonicCharge/i, /Spigen|Case/i],
  },
  'bills/02-pipe-battery.txt': {
    minLines: 4,
    invoiceNumber: /PCT-INV-4521/i,
    supplier: /PowerCell/i,
    gstin: /27AABCT1332L1ZV/,
    names: [/Exide/i, /Luminous/i, /V-Guard|VGuard/i, /Amaron/i],
  },
  'bills/04-ocr-noisy.txt': {
    minLines: 3,
    maxLines: 3,
    invoiceNumber: /TG\/24-25\/903/i,
    supplier: /TechGuru/i,
    gstin: /09AABCT1332L1ZV/,
    names: [/Samsung|LED TV|Crystal/i, /JBL/i, /Havells|Fan/i],
  },
  'bills/03-csv-simple.csv': {
    minLines: 3,
    maxLines: 3,
    names: [/Exide/i, /Luminous/i, /V-Guard|VGuard|Stabilizer/i],
    rates: [11800, 5800, 2100],
  },
  'bills/05-tab-units.txt': {
    minLines: 3,
    invoiceNumber: /CC\/778/i,
    supplier: /City Care/i,
    names: [/Cable|Terminal/i, /SF Sonic|Sonic/i, /Microtek/i],
  },
  'bills/06-discount-column.txt': {
    minLines: 4,
    invoiceNumber: /DH\/2026\/331/i,
    supplier: /Digital Hub/i,
    names: [/iPhone|Apple/i, /OnePlus/i, /Realme|Buds/i, /Portronics|Cable/i],
  },
};

function summarize(parse) {
  return {
    supplierName: parse.supplierName,
    invoiceNumber: parse.invoiceNumber,
    invoiceDate: parse.invoiceDate,
    gstin: parse.gstin,
    linesTotal: parse.linesTotal ?? parse.lines?.length,
    linesMatched: parse.linesMatched,
    lines: (parse.lines || []).map((l) => ({
      name: l.name,
      qty: l.quantity,
      rate: l.unitPrice,
      hsn: l.hsnCode,
      status: l.status,
    })),
  };
}

function check(file, parse, expect) {
  const fails = [];
  const lines = parse.lines || [];
  if ((expect.minLines || 1) > lines.length) {
    fails.push(`expected >=${expect.minLines} lines, got ${lines.length}`);
  }
  if (expect.maxLines != null && lines.length > expect.maxLines) {
    fails.push(`expected <=${expect.maxLines} lines, got ${lines.length}`);
  }
  if (expect.rates) {
    for (const rate of expect.rates) {
      if (!lines.some((l) => Number(l.unitPrice) === rate)) {
        fails.push(`missing rate ${rate}`);
      }
    }
  }
  if (expect.invoiceNumber && !expect.invoiceNumber.test(String(parse.invoiceNumber || ''))) {
    fails.push(`invoiceNumber mismatch: got "${parse.invoiceNumber}"`);
  }
  if (expect.supplier && !expect.supplier.test(String(parse.supplierName || ''))) {
    fails.push(`supplier mismatch: got "${parse.supplierName}"`);
  }
  if (expect.gstin && !expect.gstin.test(String(parse.gstin || ''))) {
    fails.push(`gstin mismatch: got "${parse.gstin}"`);
  }
  if (expect.names) {
    for (const re of expect.names) {
      if (!lines.some((l) => re.test(l.name || ''))) {
        fails.push(`missing line matching ${re}`);
      }
    }
  }
  // Sanity: qty/rate positive when present
  for (const l of lines) {
    if (!(l.quantity > 0)) fails.push(`bad qty for ${l.name}`);
    if (l.unitPrice != null && !(l.unitPrice > 0)) fails.push(`bad rate for ${l.name}`);
  }
  return fails;
}

async function main() {
  const login = await fetch(BASE + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'owner@demo.retailsarathi.in',
      password: 'Demo@123',
    }),
  }).then((r) => r.json());
  if (!login.accessToken) {
    console.error('LOGIN FAIL', login);
    process.exit(1);
  }
  const auth = { Authorization: 'Bearer ' + login.accessToken };

  const results = [];
  let passed = 0;
  let failed = 0;

  for (const [rel, expect] of Object.entries(EXPECT)) {
    const filePath = path.join(SAMPLES, rel);
    if (!fs.existsSync(filePath)) {
      console.log('SKIP missing', rel);
      failed++;
      continue;
    }
    const text = fs.readFileSync(filePath, 'utf8');
    const parseRes = await fetch(BASE + '/scan/parse-purchase', {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const parse = await parseRes.json();
    const fails = parseRes.ok ? check(rel, parse, expect) : [`HTTP ${parseRes.status}: ${JSON.stringify(parse).slice(0, 200)}`];

    // Also exercise /scan/upload with extractedText (image/PDF path)
    const form = new FormData();
    const blob = new Blob([text], { type: 'text/plain' });
    form.append('file', blob, path.basename(rel).replace(/\.\w+$/, '') + '.txt');
    form.append('extractedText', text);
    const upRes = await fetch(BASE + '/scan/upload', { method: 'POST', headers: auth, body: form });
    const up = await upRes.json();
    const upLines = up.purchasePreview?.lines?.length ?? 0;

    const ok = fails.length === 0;
    if (ok) passed++;
    else failed++;

    const row = {
      file: rel,
      ok,
      fails,
      parse: summarize(parse),
      uploadLines: upLines,
      uploadOk: upRes.ok,
    };
    results.push(row);

    console.log('\n==', rel, ok ? 'PASS' : 'FAIL');
    if (fails.length) console.log('  fails:', fails.join(' | '));
    console.log(
      '  header:',
      parse.supplierName,
      '|',
      parse.invoiceNumber,
      '|',
      parse.gstin,
      '| date',
      parse.invoiceDate,
    );
    console.log(
      '  lines:',
      (parse.lines || []).map((l) => `${l.name?.slice(0, 36)} x${l.quantity}@${l.unitPrice}`).join(' || '),
    );
    console.log('  upload purchase lines:', upLines, upRes.ok ? 'ok' : up.message || upRes.status);
  }

  // Confirm stock-in smoke (first demo lines, trackSerial false)
  const demo = results.find((r) => r.file === 'demo-supplier-invoice.txt');
  if (demo?.ok) {
    const parse = await fetch(BASE + '/scan/parse-purchase', {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: fs.readFileSync(path.join(SAMPLES, 'demo-supplier-invoice.txt'), 'utf8'),
      }),
    }).then((r) => r.json());
    const lines = (parse.lines || []).slice(0, 2).map((l) => ({
      name: l.name,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      salePrice: l.salePrice || (l.unitPrice ? l.unitPrice * 1.15 : undefined),
      hsnCode: l.hsnCode,
      gstRate: l.gstRate,
      brand: l.brand,
      category: l.category,
      productId: l.productId,
      createIfMissing: true,
      trackSerial: false,
      commitStock: true,
    }));
    const conf = await fetch(BASE + '/scan/confirm-stock-in', {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        supplierName: parse.supplierName,
        invoiceNumber: 'TEST-EXTRACT-' + Date.now(),
        invoiceDate: parse.invoiceDate,
        gstin: parse.gstin,
        lines,
      }),
    });
    const confBody = await conf.json();
    console.log('\n== confirm-stock-in', conf.status, confBody.message || `products=${confBody.products?.length ?? confBody.created ?? 'ok'}`);
    if (!conf.ok) failed++;
    else passed++;
  }

  const outPath = path.join(__dirname, 'fixtures/bills/last-extract-report.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ passed, failed, results }, null, 2));
  console.log('\nSUMMARY', { passed, failed, report: outPath });
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
