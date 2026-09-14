/** Offline golden test — all 7 sample-data invoices, no API/DB required */
const fs = require('fs');
const path = require('path');
const { ScanService } = require('../apps/api/dist/scan/scan.service');

const DIR = path.join(__dirname, '../apps/web/public/samples/bills/sample-data');
const svc = new ScanService(
  { product: { findMany: async () => [] }, supplierProductAlias: { findMany: async () => [] } },
  {},
  {},
);

const cases = [
  ['01-battery-trading.txt', { supplier: /Battery Trading/i, invoiceNumber: /^18$/, minLines: 3, totalAmount: 5545.2 }],
  ['02-agarwal-cine.txt', { supplier: /Agarwal Cine/i, invoiceNumber: /ACWPL\/1626/i, minLines: 3, totalAmount: 40993 }],
  ['03-techguru-plus.txt', { supplier: /TechGuruPlus/i, invoiceNumber: /3567\/2017-18/, minLines: 2, totalAmount: 67024 }],
  ['04-raunaq-batteries.txt', { supplier: /Raunaq/i, invoiceNumber: /RB\/2026-27\/359/, minLines: 3, totalAmount: 39960 }],
  ['05-vakeel-battery.txt', { supplier: /Vakeel/i, invoiceNumber: /25-26\/374/, minLines: 2, totalAmount: 198450 }],
  ['06-goel-enterprises.txt', { supplier: /GOEL/i, invoiceNumber: /^67$/, minLines: 2, totalAmount: 182250 }],
  ['07-shubh-traders-merged.txt', { supplier: /SHUBH/i, invoiceNumber: /^358$/, minLines: 6, totalAmount: 123000 }],
];

let passed = 0;
let failed = 0;
for (const [file, exp] of cases) {
  const text = fs.readFileSync(path.join(DIR, file), 'utf8');
  const cleaned = svc.normalizeOcrText(text);
  const header = svc.extractInvoiceData(cleaned);
  const lines = svc.extractPurchaseLines(cleaned);
  const fails = [];
  if (exp.supplier && !exp.supplier.test(String(header.supplierName || '')))
    fails.push(`supplier "${header.supplierName}"`);
  if (exp.invoiceNumber && !exp.invoiceNumber.test(String(header.invoiceNumber || '')))
    fails.push(`invoice "${header.invoiceNumber}"`);
  if (exp.minLines && lines.length < exp.minLines) fails.push(`lines ${lines.length} < ${exp.minLines}`);
  if (exp.totalAmount != null && Math.abs(Number(header.totalAmount) - exp.totalAmount) >= 1)
    fails.push(`total ${header.totalAmount}`);
  if (fails.length) {
    console.log('FAIL', file, fails.join('; '));
    failed++;
  } else {
    console.log('PASS', file);
    passed++;
  }
}
console.log(`\n${passed}/${passed + failed} passed`);
process.exit(failed ? 1 : 0);
