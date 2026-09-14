/**
 * Real Shubh Traders 2-page bill — upload + multipage merge + parse test.
 */
const fs = require('fs');
const path = require('path');

const BASE = process.env.API_URL || 'http://127.0.0.1:4000/api/v1';
const DIR = path.join(__dirname, '../apps/web/public/samples/bills/real');

function mergePageText(existing, pageText, pageNo) {
  const chunk = String(pageText || '').trim();
  if (!chunk) return existing;
  const marker = `\n\n----- PAGE ${pageNo} -----\n\n`;
  let base = String(existing || '').trim();
  if (!base) return `----- PAGE ${pageNo} -----\n\n${chunk}`;
  if (pageNo === 2 && !base.includes('----- PAGE ')) {
    base = `----- PAGE 1 -----\n\n${base}`;
  }
  return `${base}${marker}${chunk}`;
}

function assert(cond, msg, fails) {
  if (!cond) fails.push(msg);
}

async function parsePurchase(auth, text) {
  const res = await fetch(BASE + '/scan/parse-purchase', {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text }),
  });
  return { ok: res.ok, status: res.status, body: await res.json() };
}

async function uploadFile(auth, filePath, extractedText) {
  const form = new FormData();
  const buf = fs.readFileSync(filePath);
  const name = path.basename(filePath);
  const type = name.endsWith('.png') ? 'image/png' : 'text/plain';
  form.append('file', new Blob([buf], { type }), name);
  if (extractedText) form.append('extractedText', extractedText);
  const res = await fetch(BASE + '/scan/upload', { method: 'POST', headers: auth, body: form });
  return { ok: res.ok, status: res.status, body: await res.json() };
}

function summarize(parse) {
  return (parse.lines || []).map(
    (l) => `${l.name} | hsn=${l.hsnCode || '-'} | qty=${l.quantity} | rate=${l.unitPrice}`,
  );
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

  const page1 = fs.readFileSync(path.join(DIR, 'shubh-traders-358-p1.txt'), 'utf8');
  const page2 = fs.readFileSync(path.join(DIR, 'shubh-traders-358-p2.txt'), 'utf8');
  const img1 = path.join(DIR, 'shubh-traders-358-p1.png');
  const img2 = path.join(DIR, 'shubh-traders-358-p2.png');

  const fails = [];
  const steps = [];

  // 1) Page 1 parse — expect 6 Luminous lines
  const s1 = await parsePurchase(auth, page1);
  const p1 = s1.body.lines || [];
  assert(s1.ok, `page1 HTTP ${s1.status}`, fails);
  assert(p1.length >= 6, `page1 expected >=6 product lines, got ${p1.length}`, fails);
  assert(/358/.test(String(s1.body.invoiceNumber || '')), `invoice No 358, got ${s1.body.invoiceNumber}`, fails);
  assert(/SHUBH/i.test(String(s1.body.supplierName || '')), `supplier SHUBH, got ${s1.body.supplierName}`, fails);
  assert(/09AHDPA3364M1ZA/i.test(String(s1.body.gstin || '')), `seller GSTIN, got ${s1.body.gstin}`, fails);
  for (const re of [
    /LUM 12V150AH|ILTJ18060|150AH/i,
    /EVO-D 700/i,
    /EVO-D 800/i,
    /EVO-D 900/i,
    /EVO-D 1050/i,
    /EVO-D 1650/i,
  ]) {
    assert(p1.some((l) => re.test(l.name || '')), `page1 missing ${re}`, fails);
  }
  assert(!p1.some((l) => /OUTPUT|CGST|SGST|Taxable/i.test(l.name || '')), 'page1 should not treat tax rows as products', fails);
  // qty sanity for battery
  const bat = p1.find((l) => /150AH|ILTJ/i.test(l.name || ''));
  if (bat) {
    assert(Number(bat.quantity) === 5, `battery qty expected 5, got ${bat.quantity}`, fails);
    assert(Math.abs(Number(bat.unitPrice) - 10762.71) < 1, `battery rate expected ~10762.71, got ${bat.unitPrice}`, fails);
  }
  steps.push({ step: '1.parse-page1', ok: true, lines: summarize(s1.body), header: {
    supplier: s1.body.supplierName, invoice: s1.body.invoiceNumber, gstin: s1.body.gstin,
  }});

  // 2) Page 2 alone — tax/totals only, ideally 0 product lines
  const s2 = await parsePurchase(auth, page2);
  const p2 = s2.body.lines || [];
  const fakeProducts = p2.filter((l) => !/OUTPUT|CGST|SGST|Total|Taxable|HSN/i.test(l.name || ''));
  // Allow empty; fail if HSN summary becomes fake products with weird qty
  assert(s2.ok, `page2 HTTP ${s2.status}`, fails);
  assert(
    p2.length === 0 || !p2.some((l) => /85072000|85044010/.test(String(l.name || ''))),
    `page2 should not invent products from HSN summary (got ${summarize(s2.body).join('; ')})`,
    fails,
  );
  steps.push({ step: '2.parse-page2-tax-only', ok: true, lineCount: p2.length, lines: summarize(s2.body) });

  // 3) Merge + full parse
  const merged = mergePageText(page1, page2, 2);
  assert(merged.includes('----- PAGE 1 -----') && merged.includes('----- PAGE 2 -----'), 'missing page markers', fails);
  const sM = await parsePurchase(auth, merged);
  const all = sM.body.lines || [];
  assert(sM.ok, `merged HTTP ${sM.status}`, fails);
  assert(all.length >= 6, `merged expected >=6 lines, got ${all.length}`, fails);
  assert(all.length <= 8, `merged too many lines (tax noise?): ${all.length} — ${summarize(sM.body).join(' || ')}`, fails);
  assert(/358/.test(String(sM.body.invoiceNumber || '')), `merged invoice 358, got ${sM.body.invoiceNumber}`, fails);
  for (const re of [/EVO-D 700/i, /EVO-D 1650/i, /150AH|ILTJ/i]) {
    assert(all.some((l) => re.test(l.name || '')), `merged missing ${re}`, fails);
  }
  steps.push({
    step: '3.parse-merged',
    ok: true,
    lineCount: all.length,
    lines: summarize(sM.body),
    invoice: sM.body.invoiceNumber,
    supplier: sM.body.supplierName,
  });

  // 4) Upload page1 image + OCR text (browser OCR path)
  const up1 = await uploadFile(auth, img1, page1);
  const up1n = up1.body.purchasePreview?.lines?.length ?? 0;
  assert(up1.ok, `upload p1 image HTTP ${up1.status} ${up1.body.message || ''}`, fails);
  assert(up1n >= 6, `upload p1 preview expected >=6, got ${up1n}`, fails);
  steps.push({
    step: '4.upload-p1-image+ocr-text',
    ok: true,
    lines: up1n,
    needsOcr: up1.body.needsOcr,
    uploadId: up1.body.upload?.id,
  });

  // 5) Upload page2 image + merged text (Add another page)
  const up2 = await uploadFile(auth, img2, merged);
  const up2n = up2.body.purchasePreview?.lines?.length ?? 0;
  assert(up2.ok, `upload p2/merged HTTP ${up2.status} ${up2.body.message || ''}`, fails);
  assert(up2n >= 6, `upload merged preview expected >=6, got ${up2n}`, fails);
  assert(up2n <= 8, `upload merged too many lines: ${up2n}`, fails);
  steps.push({
    step: '5.upload-p2-image+merged-text',
    ok: true,
    lines: up2n,
    preview: (up2.body.purchasePreview?.lines || []).map(
      (l) => `${l.name} x${l.quantity}@${l.unitPrice}`,
    ),
  });

  // 6) Upload raw image without OCR text — expect needsOcr (server cannot OCR)
  const raw = await uploadFile(auth, img1, null);
  steps.push({
    step: '6.upload-image-without-ocr',
    ok: true,
    needsOcr: raw.body.needsOcr,
    message: raw.body.message,
    lines: raw.body.purchasePreview?.lines?.length ?? 0,
  });

  const passed = fails.length === 0;
  // fix step ok flags based on fails timing is hard — recompute simply
  const report = { passed: passed ? 1 : 0, failed: passed ? 0 : 1, fails, steps };
  const out = path.join(__dirname, 'fixtures/bills/last-shubh-multipage-report.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify(report, null, 2));

  console.log('\n=== SHUBH TRADERS REAL 2-PAGE BILL TEST ===\n');
  for (const s of steps) {
    console.log('•', s.step);
    if (s.header) console.log('   header:', s.header);
    if (s.lines && Array.isArray(s.lines)) s.lines.forEach((l) => console.log('   ', l));
    if (typeof s.lines === 'number') console.log('   previewLines=', s.lines, 'needsOcr=', s.needsOcr);
    if (s.preview) s.preview.forEach((l) => console.log('   ', l));
    if (s.message) console.log('   message:', s.message);
  }
  if (fails.length) {
    console.log('\nFAILURES:');
    fails.forEach((f) => console.log(' -', f));
  }
  console.log('\nSUMMARY', passed ? 'PASS' : 'FAIL', { failCount: fails.length, report: out });
  process.exit(passed ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
