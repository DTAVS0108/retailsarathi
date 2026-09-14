/**
 * Multi-page bill workflow test.
 * Simulates: upload page 1 → Add another page (page 2) → merge markers → re-parse full bill.
 */
const fs = require('fs');
const path = require('path');

const BASE = process.env.API_URL || 'http://127.0.0.1:4000/api/v1';
const BILLS = path.join(__dirname, '../apps/web/public/samples/bills');

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
  const body = await res.json();
  return { ok: res.ok, status: res.status, body };
}

async function uploadWithText(auth, filename, text) {
  const form = new FormData();
  form.append('file', new Blob([text], { type: 'text/plain' }), filename);
  form.append('extractedText', text);
  const res = await fetch(BASE + '/scan/upload', { method: 'POST', headers: auth, body: form });
  const body = await res.json();
  return { ok: res.ok, status: res.status, body };
}

function lineNames(parse) {
  return (parse.lines || []).map((l) => `${l.name} x${l.quantity}@${l.unitPrice}`);
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

  const p1Path = path.join(BILLS, '08-multipage-p1.txt');
  const p2Path = path.join(BILLS, '08-multipage-p2.txt');
  if (!fs.existsSync(p1Path) || !fs.existsSync(p2Path)) {
    console.error('Missing multipage samples under apps/web/public/samples/bills/');
    process.exit(1);
  }
  const page1 = fs.readFileSync(p1Path, 'utf8');
  const page2 = fs.readFileSync(p2Path, 'utf8');

  const fails = [];
  const steps = [];

  // Step 1: page 1 alone
  const s1 = await parsePurchase(auth, page1);
  const p1Lines = s1.body.lines || [];
  assert(s1.ok, `page1 parse HTTP ${s1.status}`, fails);
  assert(p1Lines.length >= 3, `page1 expected >=3 lines, got ${p1Lines.length}`, fails);
  assert(
    p1Lines.some((l) => /Exide/i.test(l.name || '')),
    'page1 missing Exide',
    fails,
  );
  assert(
    !p1Lines.some((l) => /Amaron|Sukam|Battery Water/i.test(l.name || '')),
    'page1 should NOT include page2 items',
    fails,
  );
  steps.push({
    step: '1.parse-page1-only',
    ok: fails.length === 0,
    invoice: s1.body.invoiceNumber,
    supplier: s1.body.supplierName,
    lines: lineNames(s1.body),
  });

  // Step 2: page 2 alone (continued page — fewer header fields OK)
  const s2 = await parsePurchase(auth, page2);
  const p2Lines = s2.body.lines || [];
  const failsBefore2 = fails.length;
  assert(s2.ok, `page2 parse HTTP ${s2.status}`, fails);
  assert(p2Lines.length >= 3, `page2 expected >=3 lines, got ${p2Lines.length}`, fails);
  assert(
    p2Lines.some((l) => /Amaron/i.test(l.name || '')),
    'page2 missing Amaron',
    fails,
  );
  assert(
    !p2Lines.some((l) => /Exide|Luminous|Microtek/i.test(l.name || '')),
    'page2 should NOT include page1 items',
    fails,
  );
  steps.push({
    step: '2.parse-page2-only',
    ok: fails.length === failsBefore2,
    lines: lineNames(s2.body),
  });

  // Step 3: merge like Stock-in "Add another page"
  const merged = mergePageText(page1, page2, 2);
  assert(merged.includes('----- PAGE 1 -----'), 'merged missing PAGE 1 marker', fails);
  assert(merged.includes('----- PAGE 2 -----'), 'merged missing PAGE 2 marker', fails);
  assert(
    merged.indexOf('----- PAGE 1 -----') < merged.indexOf('----- PAGE 2 -----'),
    'PAGE markers out of order',
    fails,
  );
  steps.push({
    step: '3.merge-markers',
    ok: true,
    chars: merged.length,
    hasPage1: merged.includes('----- PAGE 1 -----'),
    hasPage2: merged.includes('----- PAGE 2 -----'),
  });

  // Step 4: re-parse full bill — must include ALL items from both pages
  const sFull = await parsePurchase(auth, merged);
  const all = sFull.body.lines || [];
  const failsBefore4 = fails.length;
  assert(sFull.ok, `merged parse HTTP ${sFull.status}`, fails);
  assert(all.length >= 6, `merged expected >=6 lines, got ${all.length}`, fails);
  for (const re of [/Exide/i, /Luminous/i, /Microtek/i, /Amaron/i, /Sukam/i, /Battery Water|Water/i]) {
    assert(all.some((l) => re.test(l.name || '')), `merged missing ${re}`, fails);
  }
  assert(
    /MP-7781/i.test(String(sFull.body.invoiceNumber || '')),
    `merged invoiceNumber expected MP-7781, got "${sFull.body.invoiceNumber}"`,
    fails,
  );
  assert(
    /MultiPage/i.test(String(sFull.body.supplierName || '')),
    `merged supplier expected MultiPage, got "${sFull.body.supplierName}"`,
    fails,
  );
  steps.push({
    step: '4.parse-merged-full-bill',
    ok: fails.length === failsBefore4,
    invoice: sFull.body.invoiceNumber,
    supplier: sFull.body.supplierName,
    gstin: sFull.body.gstin,
    lineCount: all.length,
    lines: lineNames(sFull.body),
  });

  // Step 5: upload page1, then upload merged text (append simulation)
  const up1 = await uploadWithText(auth, '08-multipage-p1.txt', page1);
  const up1n = up1.body.purchasePreview?.lines?.length ?? 0;
  const failsBefore5 = fails.length;
  assert(up1.ok, `upload page1 HTTP ${up1.status}: ${up1.body.message || ''}`, fails);
  assert(up1n >= 3, `upload page1 expected >=3 preview lines, got ${up1n}`, fails);

  const upMerged = await uploadWithText(auth, '08-multipage-merged.txt', merged);
  const upMn = upMerged.body.purchasePreview?.lines?.length ?? 0;
  assert(upMerged.ok, `upload merged HTTP ${upMerged.status}: ${upMerged.body.message || ''}`, fails);
  assert(upMn >= 6, `upload merged expected >=6 preview lines, got ${upMn}`, fails);
  steps.push({
    step: '5.upload-page1-then-merged',
    ok: fails.length === failsBefore5,
    page1UploadLines: up1n,
    mergedUploadLines: upMn,
  });

  // Step 6: regression — page1-only must NOT equal full bill line count
  assert(
    p1Lines.length < all.length,
    `page1-only (${p1Lines.length}) should be fewer lines than merged (${all.length})`,
    fails,
  );
  steps.push({
    step: '6.page1-not-full-bill',
    ok: p1Lines.length < all.length,
    page1Lines: p1Lines.length,
    mergedLines: all.length,
  });

  const passed = fails.length === 0;
  const report = {
    passed: passed ? 1 : 0,
    failed: passed ? 0 : 1,
    fails,
    steps,
    mergedPreview: merged.slice(0, 400),
  };
  const outPath = path.join(__dirname, 'fixtures/bills/last-multipage-report.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log('\n=== MULTI-PAGE BILL WORKFLOW TEST ===\n');
  for (const s of steps) {
    console.log(s.ok === false ? 'FAIL' : 'PASS', s.step);
    if (s.lines) console.log('     ', s.lines.join(' || '));
    if (s.lineCount != null) console.log('      lineCount=', s.lineCount, 'invoice=', s.invoice, 'supplier=', s.supplier);
    if (s.page1UploadLines != null) {
      console.log('      upload page1 lines=', s.page1UploadLines, 'merged lines=', s.mergedUploadLines);
    }
  }
  if (fails.length) {
    console.log('\nFAILURES:');
    for (const f of fails) console.log(' -', f);
  }
  console.log('\nSUMMARY', { passed: passed ? 'PASS' : 'FAIL', failCount: fails.length, report: outPath });
  process.exit(passed ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
