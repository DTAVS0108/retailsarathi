/**
 * Comprehensive offline validation — no API/DB required.
 * Uses ScanService + optional enrichExtractedParties (suppliers only — no tenant forcing).
 */
const fs = require('fs');
const path = require('path');
const { ScanService } = require('../apps/api/dist/scan/scan.service');
const { enrichExtractedParties } = require('../apps/api/dist/scan/invoice-parse-utils');

const root = path.join(__dirname, '..');
const svc = new ScanService(
  { product: { findMany: async () => [] }, supplierProductAlias: { findMany: async () => [] } },
  {},
  {},
);

const SUPPLIER_CTX = {
  knownSuppliers: [
    { id: 's1', name: 'SHUBH TRADERS', gstin: '09AHDPA3364M1ZA', address: 'NEAR SARGAM THEATER, CHANDPUR' },
    { id: 's2', name: 'GOEL ENTERPRISES', gstin: '09ARDPG9739J1ZA', address: 'Bijnor' },
    { id: 's3', name: 'M/s Raunaq Batteries', gstin: '09ABKPH0005M1ZS' },
    { id: 's4', name: 'Vakeel Battery Parts', gstin: '09AFQPA3676K1ZY' },
  ],
};

function mergePageText(existing, pageText, pageNo) {
  const chunk = String(pageText || '').trim();
  if (!chunk) return existing;
  const marker = `\n\n----- PAGE ${pageNo} -----\n\n`;
  let base = String(existing || '').trim();
  if (!base) return `----- PAGE ${pageNo} -----\n\n${chunk}`;
  if (pageNo === 2 && !base.includes('----- PAGE ')) base = `----- PAGE 1 -----\n\n${base}`;
  return `${base}${marker}${chunk}`;
}

function parse(text, ctx) {
  const cleaned = svc.normalizeOcrText(text);
  let data = svc.extractInvoiceData(cleaned);
  const lines = svc.extractPurchaseLines(cleaned);
  if (ctx) {
    data = enrichExtractedParties(data, cleaned, ctx, {
      extractGstins: (s) => svc.extractGstins(s),
      normalizeGstinCandidate: (raw) => svc.normalizeGstinCandidate(raw),
    });
  }
  return { header: data, lines, cleaned };
}

function runCase(name, filePath, expect, ctx) {
  const fails = [];
  const assert = (c, m) => { if (!c) fails.push(m); };
  const text = fs.readFileSync(filePath, 'utf8');
  const { header, lines } = parse(text, ctx);

  if (expect.supplier) assert(expect.supplier.test(String(header.supplierName || '')), `supplier: "${header.supplierName}"`);
  if (expect.invoiceNumber) assert(expect.invoiceNumber.test(String(header.invoiceNumber || '')), `invoice: "${header.invoiceNumber}"`);
  if (expect.gstin) assert(expect.gstin.test(String(header.gstin || '')), `gstin: "${header.gstin}"`);
  if (expect.customer) assert(expect.customer.test(String(header.customerName || '')), `customer: "${header.customerName}"`);
  if (expect.minLines != null) assert(lines.length >= expect.minLines, `lines ${lines.length} < ${expect.minLines}`);
  if (expect.maxLines != null) assert(lines.length <= expect.maxLines, `lines ${lines.length} > ${expect.maxLines}`);
  if (expect.exactLines != null) assert(lines.length === expect.exactLines, `lines ${lines.length} != ${expect.exactLines}`);
  if (expect.totalAmount != null) assert(Math.abs(Number(header.totalAmount) - expect.totalAmount) < 1, `total ${header.totalAmount}`);
  if (expect.taxableValue != null) assert(Math.abs(Number(header.taxableValue) - expect.taxableValue) < 1, `taxable ${header.taxableValue}`);
  if (expect.cgst != null) assert(Math.abs(Number(header.cgstAmount) - expect.cgst) < 1, `cgst ${header.cgstAmount}`);
  if (expect.ewayBillNo) assert(expect.ewayBillNo.test(String(header.ewayBillNo || '')), `eway: "${header.ewayBillNo}"`);
  if (expect.vehicleNo) assert(expect.vehicleNo.test(String(header.vehicleNo || '')), `vehicle: "${header.vehicleNo}"`);
  if (expect.extractionQuality) assert(header.extractionQuality === expect.extractionQuality || expect.extractionQuality.test?.(header.extractionQuality), `quality: ${header.extractionQuality}`);
  if (expect.names) {
    for (const re of expect.names) {
      assert(lines.some((l) => re.test(l.name || '')), `missing line ${re}`);
    }
  }
  if (expect.noNames) {
    for (const re of expect.noNames) {
      assert(!lines.some((l) => re.test(l.name || '')), `should not have line ${re}`);
    }
  }
  if (expect.address) assert(expect.address.test(String(header.supplierAddress || '')), `address: "${header.supplierAddress}"`);

  return {
    name,
    ok: fails.length === 0,
    fails,
    summary: {
      supplier: header.supplierName,
      invoice: header.invoiceNumber,
      gstin: header.gstin,
      customer: header.customerName,
      total: header.totalAmount,
      lines: lines.length,
      lineNames: lines.slice(0, 8).map((l) => l.name),
    },
  };
}

const CASES = [
  // Golden sample-data (7 real supplier formats)
  ['golden-01-battery-trading', 'apps/web/public/samples/bills/sample-data/01-battery-trading.txt', {
    supplier: /Battery Trading/i, invoiceNumber: /^18$/, minLines: 3, totalAmount: 5545.2,
  }, null],
  ['golden-02-agarwal-cine', 'apps/web/public/samples/bills/sample-data/02-agarwal-cine.txt', {
    supplier: /Agarwal/i, invoiceNumber: /ACWPL\/1626/, minLines: 3, totalAmount: 40993,
    customer: /Maddock/i,
  }, null],
  ['golden-03-techguru', 'apps/web/public/samples/bills/sample-data/03-techguru-plus.txt', {
    supplier: /TechGuru/i, invoiceNumber: /3567\/2017-18/, minLines: 2, totalAmount: 67024,
  }, null],
  ['golden-04-raunaq', 'apps/web/public/samples/bills/sample-data/04-raunaq-batteries.txt', {
    supplier: /Raunaq/i, invoiceNumber: /RB\/2026-27\/359/, minLines: 3, totalAmount: 39960,
  }, null],
  ['golden-05-vakeel', 'apps/web/public/samples/bills/sample-data/05-vakeel-battery.txt', {
    supplier: /Vakeel/i, invoiceNumber: /25-26\/374/, minLines: 2, totalAmount: 198450,
  }, null],
  ['golden-06-goel', 'apps/web/public/samples/bills/sample-data/06-goel-enterprises.txt', {
    supplier: /GOEL/i, invoiceNumber: /^67$/, minLines: 2, totalAmount: 182250, vehicleNo: /UK19CA1381/,
  }, null],
  ['golden-07-shubh-merged', 'apps/web/public/samples/bills/sample-data/07-shubh-traders-merged.txt', {
    supplier: /SHUBH/i, invoiceNumber: /^358$/, minLines: 6, totalAmount: 123000,
    taxableValue: 104237.28, cgst: 9381.36, ewayBillNo: /441730045950/, vehicleNo: /UP23AT5449/,
  }, SUPPLIER_CTX],

  // Additional format samples
  ['format-slno-mobile', 'apps/web/public/samples/bills/01-slno-mobile-gst.txt', {
    supplier: /Mobile|Shree/i, minLines: 4, names: [/Samsung/i, /Boat/i],
  }, null],
  ['format-pipe-battery', 'apps/web/public/samples/bills/02-pipe-battery.txt', {
    supplier: /PowerCell/i, minLines: 4, names: [/Exide/i, /Luminous/i],
  }, null],
  ['format-ocr-noisy', 'apps/web/public/samples/bills/04-ocr-noisy.txt', {
    supplier: /TechGuru/i, minLines: 3, maxLines: 3,
  }, null],
  ['format-tab-units', 'apps/web/public/samples/bills/05-tab-units.txt', {
    supplier: /City Care/i, invoiceNumber: /CC\/778/, minLines: 3,
    names: [/Cable|Terminal/i, /Sonic|SF/i, /Microtek/i],
  }, null],
  ['format-discount-col', 'apps/web/public/samples/bills/06-discount-column.txt', {
    supplier: /Digital Hub/i, invoiceNumber: /DH\/2026\/331/, minLines: 4,
    names: [/iPhone|Apple/i, /OnePlus/i, /Realme|Buds/i, /Portronics|Cable/i],
  }, null],
  ['format-csv-simple', 'apps/web/public/samples/bills/03-csv-simple.csv', {
    minLines: 3, maxLines: 3,
    names: [/Exide/i, /Luminous/i, /V-Guard|Stabilizer/i],
    rates: [11800, 5800, 2100],
  }, null],

  // Multi-page: generic 08-multipage
  ['multipage-p1-only', 'apps/web/public/samples/bills/08-multipage-p1.txt', {
    supplier: /MultiPage/i, invoiceNumber: /MP-7781/, minLines: 3,
    names: [/Exide/i], noNames: [/Amaron|Sukam/i],
  }, null],
  ['multipage-p2-only', 'apps/web/public/samples/bills/08-multipage-p2.txt', {
    minLines: 3, names: [/Amaron/i], noNames: [/Exide|Luminous|Microtek/i],
  }, null],

  // Shubh real multi-page
  ['shubh-p1-only', 'apps/web/public/samples/bills/real/shubh-traders-358-p1.txt', {
    supplier: /SHUBH/i, invoiceNumber: /358/, minLines: 6,
    names: [/150AH|ILTJ/i, /EVO-D 700/i, /EVO-D 1650/i],
  }, SUPPLIER_CTX],
  ['shubh-p2-only-clean', 'apps/web/public/samples/bills/real/shubh-traders-358-p2.txt', {
    supplier: /SHUBH/i, invoiceNumber: /358/, exactLines: 0,
    totalAmount: 123000, taxableValue: 104237.28, cgst: 9381.36,
    ewayBillNo: /441730045950/, vehicleNo: /UP23AT5449/, customer: /Tyagi/i,
  }, SUPPLIER_CTX],
  ['shubh-p1+p2-merged', null, {
    supplier: /SHUBH/i, invoiceNumber: /358/, minLines: 6, maxLines: 8,
    totalAmount: 123000, names: [/EVO-D 700/i, /150AH|ILTJ/i],
  }, SUPPLIER_CTX],

  // Camera OCR repros (need DB context)
  ['ocr-shubh-p2-camera', 'scripts/_shubh-p2-new-ocr.txt', {
    supplier: /SHUBH/i, invoiceNumber: /358/, exactLines: 0,
    gstin: /09AHDPA3364M1ZA/, totalAmount: 123000, taxableValue: 104237.28,
    customer: /Tyagi/i, ewayBillNo: /441730045950/, vehicleNo: /UP23AT5449/,
    address: /SARGAM|CHANDPUR/i,
  }, SUPPLIER_CTX],
  ['ocr-shubh-user', 'scripts/_shubh-user-ocr.txt', {
    supplier: /SHUBH/i, invoiceNumber: /358/, totalAmount: 123000, customer: /Tyagi/i,
  }, SUPPLIER_CTX],
  ['ocr-goel-user', 'scripts/_goel-user-ocr.txt', {
    supplier: /GOEL/i, minLines: 2, totalAmount: 182250,
  }, SUPPLIER_CTX],
  ['ocr-goel-best', 'scripts/_goel-ocr-best.txt', {
    supplier: /GOEL/i, invoiceNumber: /^5$|^67$/, minLines: 2,
  }, SUPPLIER_CTX],
  ['ocr-vakeel-user', 'scripts/_vakeel-user-ocr.txt', {
    supplier: /Vakeel/i, invoiceNumber: /25-26\/374/, gstin: /09AFQPA3676K1ZY/,
    customer: /TYAGI/i, minLines: 2, totalAmount: 198450,
    taxableValue: 168177.99, cgst: 15136.02, sgst: 15136.02,
  }, SUPPLIER_CTX],
  ['ocr-shubh-p1-camera', 'apps/web/public/samples/bills/sample-data-ocr/IMG20260719220921.jpg.txt', {
    supplier: /SHUBH/i, minLines: 0,
  }, SUPPLIER_CTX],
  ['ocr-shubh-p1+p2-merged', null, {
    supplier: /SHUBH/i, invoiceNumber: /^358$/, totalAmount: 123000,
  }, SUPPLIER_CTX],

  // OCR from sample-data-ocr folder
  ['ocr-sample-jpg1', 'apps/web/public/samples/bills/sample-data-ocr/IMG20260719220921.jpg.txt', {
    supplier: /SHUBH/i, gstin: /09AHDPA3364M1ZA/, minLines: 0,
  }, SUPPLIER_CTX],
  ['ocr-sample-jpg2', 'apps/web/public/samples/bills/sample-data-ocr/IMG20260719220931.jpg.txt', {
    minLines: 0,
  }, SUPPLIER_CTX],
];

function main() {
  const results = [];
  let passed = 0;
  let failed = 0;

  console.log('\n=== COMPREHENSIVE OFFLINE VALIDATION ===\n');

  for (const [name, relPath, expect, ctx] of CASES) {
    let filePath = relPath ? path.join(root, relPath) : null;
    if (name === 'shubh-p1+p2-merged' || name === 'ocr-shubh-p1+p2-merged') {
      const p1Path =
        name === 'shubh-p1+p2-merged'
          ? path.join(root, 'apps/web/public/samples/bills/real/shubh-traders-358-p1.txt')
          : path.join(root, 'apps/web/public/samples/bills/sample-data-ocr/IMG20260719220921.jpg.txt');
      const p2Path =
        name === 'shubh-p1+p2-merged'
          ? path.join(root, 'apps/web/public/samples/bills/real/shubh-traders-358-p2.txt')
          : path.join(root, 'apps/web/public/samples/bills/sample-data-ocr/IMG20260719220931.jpg.txt');
      const p1 = fs.readFileSync(p1Path, 'utf8');
      const p2 = fs.readFileSync(p2Path, 'utf8');
      const merged = mergePageText(p1, p2, 2);
      const fails = [];
      const assert = (c, m) => { if (!c) fails.push(m); };
      const { header, lines } = parse(merged, ctx);
      if (expect.supplier) assert(expect.supplier.test(String(header.supplierName || '')), `supplier: "${header.supplierName}"`);
      if (expect.invoiceNumber) assert(expect.invoiceNumber.test(String(header.invoiceNumber || '')), `invoice: "${header.invoiceNumber}"`);
      if (expect.minLines != null) assert(lines.length >= expect.minLines, `lines ${lines.length} < ${expect.minLines}`);
      if (expect.maxLines != null) assert(lines.length <= expect.maxLines, `lines ${lines.length} > ${expect.maxLines}`);
      if (expect.totalAmount != null) assert(Math.abs(Number(header.totalAmount) - expect.totalAmount) < 1, `total ${header.totalAmount}`);
      if (expect.names) for (const re of expect.names) assert(lines.some((l) => re.test(l.name || '')), `missing ${re}`);
      const row = { name, ok: fails.length === 0, fails, summary: { supplier: header.supplierName, invoice: header.invoiceNumber, lines: lines.length } };
      results.push(row);
      console.log(row.ok ? 'PASS' : 'FAIL', name, row.ok ? '' : '— ' + fails.join('; '));
      if (row.ok) passed++; else failed++;
      continue;
    }

    if (!filePath || !fs.existsSync(filePath)) {
      console.log('SKIP', name, '(missing file)');
      continue;
    }

    const row = runCase(name, filePath, expect, ctx);
    results.push(row);
    console.log(row.ok ? 'PASS' : 'FAIL', name, row.ok ? JSON.stringify(row.summary) : '— ' + row.fails.join('; '));
    if (row.ok) passed++; else failed++;
  }

  // Multipage merged 08
  const mp1 = fs.readFileSync(path.join(root, 'apps/web/public/samples/bills/08-multipage-p1.txt'), 'utf8');
  const mp2 = fs.readFileSync(path.join(root, 'apps/web/public/samples/bills/08-multipage-p2.txt'), 'utf8');
  const mpMerged = mergePageText(mp1, mp2, 2);
  {
    const { header, lines } = parse(mpMerged, null);
    const fails = [];
    if (!/MultiPage/i.test(String(header.supplierName || ''))) fails.push(`supplier ${header.supplierName}`);
    if (!/MP-7781/.test(String(header.invoiceNumber || ''))) fails.push(`invoice ${header.invoiceNumber}`);
    if (lines.length < 6) fails.push(`lines ${lines.length}`);
    for (const re of [/Exide/i, /Amaron/i, /Sukam/i]) {
      if (!lines.some((l) => re.test(l.name || ''))) fails.push(`missing ${re}`);
    }
    const row = { name: 'multipage-merged-full', ok: fails.length === 0, fails, summary: { lines: lines.length, invoice: header.invoiceNumber } };
    results.push(row);
    console.log(row.ok ? 'PASS' : 'FAIL', row.name, row.ok ? JSON.stringify(row.summary) : '— ' + fails.join('; '));
    if (row.ok) passed++; else failed++;
  }

  const outPath = path.join(__dirname, 'fixtures/bills/last-comprehensive-offline-report.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify({ passed, failed, results }, null, 2));

  console.log(`\n=== SUMMARY: ${passed}/${passed + failed} passed ===`);
  console.log('Report:', outPath);
  if (failed > 0) {
    console.log('\nFailed cases:');
    results.filter((r) => !r.ok).forEach((r) => console.log(' -', r.name, ':', r.fails.join('; ')));
  }
  process.exit(failed > 0 ? 1 : 0);
}

main();
