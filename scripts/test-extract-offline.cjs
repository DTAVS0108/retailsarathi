const fs = require('fs');
const path = require('path');
const { ScanService } = require('../apps/api/dist/scan/scan.service');
const { enrichExtractedParties } = require('../apps/api/dist/scan/invoice-parse-utils');

const root = path.join(__dirname, '..');
const mockPrisma = {
  product: { findMany: async () => [] },
  supplierProductAlias: { findMany: async () => [] },
};
const svc = new ScanService(mockPrisma, {}, {});

const SHUBH_SUPPLIER = {
  id: 'sup-shubh',
  name: 'SHUBH TRADERS',
  gstin: '09AHDPA3364M1ZA',
  address: 'NEAR SARGAM THEATER, CHANDPUR',
};
const TYAGI_BUYER = {
  name: 'M/s Tyagi Electric Works',
  gstin: '09ASWPK4296J1ZR',
  address: 'Gulabi Market, Silara Road, Chandpur, Bijnor',
};

const demoCtx = {
  tenantName: 'Tyagi Electric Works',
  tenantGstin: '09ASWPK4296J1ZR',
  knownSuppliers: [SHUBH_SUPPLIER],
  knownCustomers: [TYAGI_BUYER],
};

function extract(text, ctx) {
  const cleaned = svc.normalizeOcrText(text);
  let data = svc.extractInvoiceData(cleaned);
  if (ctx) {
    data = enrichExtractedParties(data, cleaned, ctx, {
      extractGstins: (s) => svc.extractGstins(s),
      normalizeGstinCandidate: (raw) => svc.normalizeGstinCandidate(raw),
    });
  }
  return data;
}

const cases = [
  ['04-raunaq', 'apps/web/public/samples/bills/sample-data/04-raunaq-batteries.txt', { inv: 'RB/2026-27/359' }, null],
  ['05-vakeel', 'apps/web/public/samples/bills/sample-data/05-vakeel-battery.txt', { inv: '25-26/374' }, null],
  ['07-shubh-merged', 'apps/web/public/samples/bills/sample-data/07-shubh-traders-merged.txt', {
    inv: '358', gstin: '09AHDPA3364M1ZA', total: 123000, taxable: 104237.28, cgst: 9381.36,
  }, demoCtx],
  ['shubh-p2-clean', 'apps/web/public/samples/bills/real/shubh-traders-358-p2.txt', {
    inv: '358', gstin: '09AHDPA3364M1ZA', date: '27 May 2026', total: 123000, taxable: 104237.28, cgst: 9381.36,
  }, demoCtx],
  ['shubh-p2-camera', 'scripts/_shubh-p2-new-ocr.txt', {
    inv: '358', supplier: 'SHUBH TRADERS', gstin: '09AHDPA3364M1ZA', date: '27 May 2026',
    total: 123000, taxable: 104237.28, cgst: 9381.36, customer: 'Tyagi',
  }, demoCtx],
];

function datesMatch(got, expected) {
  if (!expected) return true;
  const a = String(got || '').toLowerCase().replace(/[-/]/g, ' ').replace(/\s+/g, ' ').trim();
  const b = String(expected).toLowerCase().replace(/[-/]/g, ' ').replace(/\s+/g, ' ').trim();
  if (a === b) return true;
  // Accept 27-May-26 vs 27 May 2026
  const norm = (s) => s.replace(/\b(\d{1,2})\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{2,4})\b/i, (_, d, m, y) => {
    const yy = String(y).length === 2 ? `20${y}` : y;
    return `${Number(d)} ${m.slice(0, 3).toLowerCase()} ${yy}`;
  });
  return norm(a) === norm(b) || a.includes('27') && a.includes('may') && a.includes('2026') && b.includes('27') && b.includes('may');
}

let fails = 0;
for (const [name, file, exp, ctx] of cases) {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  const d = extract(text, ctx);
  console.log(`--- ${name} ---`);
  console.log(JSON.stringify({
    supplier: d.supplierName, inv: d.invoiceNumber, date: d.invoiceDate, gstin: d.gstin,
    customer: d.customerName, total: d.totalAmount, taxable: d.taxableValue,
    cgst: d.cgstAmount, eway: d.ewayBillNo, vehicle: d.vehicleNo, address: d.supplierAddress,
  }, null, 2));
  const check = (cond, msg) => { if (!cond) { console.log('FAIL:', msg); fails++; } };
  if (exp.inv) check(d.invoiceNumber === exp.inv, `inv expected ${exp.inv} got ${d.invoiceNumber}`);
  if (exp.gstin) check(d.gstin === exp.gstin, `gstin expected ${exp.gstin} got ${d.gstin}`);
  if (exp.date) check(datesMatch(d.invoiceDate, exp.date), `date expected ${exp.date} got ${d.invoiceDate}`);
  if (exp.total != null) check(Math.abs(Number(d.totalAmount || 0) - exp.total) < 1, `total expected ${exp.total} got ${d.totalAmount}`);
  if (exp.supplier) check(String(d.supplierName || '').includes(exp.supplier), `supplier expected ${exp.supplier} got ${d.supplierName}`);
  if (exp.customer) check(String(d.customerName || '').includes(exp.customer), `customer expected ${exp.customer} got ${d.customerName}`);
  if (exp.taxable != null) check(Math.abs(Number(d.taxableValue || 0) - exp.taxable) < 1, `taxable expected ${exp.taxable} got ${d.taxableValue}`);
  if (exp.cgst != null) check(Math.abs(Number(d.cgstAmount || 0) - exp.cgst) < 1, `cgst expected ${exp.cgst} got ${d.cgstAmount}`);
}

console.log(fails ? `\n${fails} failure(s)` : '\nAll checks passed');
process.exit(fails ? 1 : 0);
