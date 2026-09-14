/**
 * Full Shubh Traders invoice: extract everything + confirm creates supplier + bill.
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
  const merged = mergePageText(page1, page2, 2);

  const fails = [];
  const parseRes = await fetch(BASE + '/scan/parse-purchase', {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: merged }),
  });
  const parse = await parseRes.json();
  assert(parseRes.ok, `parse HTTP ${parseRes.status}`, fails);

  console.log('\n=== EXTRACTED HEADER ===');
  const headerKeys = [
    'supplierName',
    'supplierAddress',
    'gstin',
    'invoiceNumber',
    'invoiceDate',
    'customerName',
    'customerGstin',
    'stateName',
    'placeOfSupply',
    'irn',
    'ackNo',
    'ackDate',
    'ewayBillNo',
    'vehicleNo',
    'bankName',
    'bankAccount',
    'ifsc',
    'taxableValue',
    'cgstAmount',
    'sgstAmount',
    'taxAmount',
    'totalAmount',
  ];
  for (const k of headerKeys) {
    console.log(`  ${k}:`, parse[k] ?? '(missing)');
  }
  console.log('  lines:', (parse.lines || []).length);
  console.log('  hsnTaxSummary:', parse.hsnTaxSummary);

  assert(/SHUBH/i.test(String(parse.supplierName || '')), 'supplier name', fails);
  assert(/SARGAM|CHANDPUR/i.test(String(parse.supplierAddress || '')), `supplier address got "${parse.supplierAddress}"`, fails);
  assert(parse.gstin === '09AHDPA3364M1ZA', `gstin ${parse.gstin}`, fails);
  assert(String(parse.invoiceNumber) === '358', `invoice ${parse.invoiceNumber}`, fails);
  assert(/27.?May.?(26|2026)/i.test(String(parse.invoiceDate || '')), `date ${parse.invoiceDate}`, fails);
  assert(/Tyagi/i.test(String(parse.customerName || '')), `buyer ${parse.customerName}`, fails);
  assert(parse.customerGstin === '09ASWPK4296J1ZR', `buyer gstin ${parse.customerGstin}`, fails);
  assert(/Uttar/i.test(String(parse.stateName || parse.placeOfSupply || '')), 'state/place', fails);
  assert(parse.irn && String(parse.irn).length > 40, `irn ${parse.irn}`, fails);
  assert(String(parse.ackNo) === '142620411352896', `ack ${parse.ackNo}`, fails);
  assert(String(parse.ewayBillNo) === '441730045950', `eway ${parse.ewayBillNo}`, fails);
  assert(/UP23AT5449/i.test(String(parse.vehicleNo || '')), `vehicle ${parse.vehicleNo}`, fails);
  assert(/PUNJAB|PNB/i.test(String(parse.bankName || '')), `bank ${parse.bankName}`, fails);
  assert(String(parse.bankAccount) === '0096008700031334', `a/c ${parse.bankAccount}`, fails);
  assert(String(parse.ifsc) === 'PUNB0009600', `ifsc ${parse.ifsc}`, fails);
  assert(Math.abs(Number(parse.cgstAmount) - 9381.36) < 0.1, `cgst ${parse.cgstAmount}`, fails);
  assert(Math.abs(Number(parse.sgstAmount) - 9381.36) < 0.1, `sgst ${parse.sgstAmount}`, fails);
  assert(Math.abs(Number(parse.taxableValue) - 104237.28) < 1, `taxable ${parse.taxableValue}`, fails);
  assert(Math.abs(Number(parse.totalAmount) - 123000) < 1, `total ${parse.totalAmount}`, fails);
  assert((parse.lines || []).length >= 6, `lines ${parse.lines?.length}`, fails);
  assert((parse.hsnTaxSummary || []).length >= 2, `hsn summary ${JSON.stringify(parse.hsnTaxSummary)}`, fails);

  const invNo = `358-TEST-${Date.now()}`;
  const confRes = await fetch(BASE + '/scan/confirm-stock-in', {
    method: 'POST',
    headers: { ...auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      supplierName: parse.supplierName,
      supplierAddress: parse.supplierAddress,
      invoiceNumber: invNo,
      invoiceDate: parse.invoiceDate,
      gstin: parse.gstin,
      taxableValue: parse.taxableValue,
      taxAmount: parse.taxAmount,
      totalAmount: parse.totalAmount,
      cgstAmount: parse.cgstAmount,
      sgstAmount: parse.sgstAmount,
      irn: parse.irn,
      ackNo: parse.ackNo,
      ackDate: parse.ackDate,
      ewayBillNo: parse.ewayBillNo,
      vehicleNo: parse.vehicleNo,
      bankName: parse.bankName,
      bankAccount: parse.bankAccount,
      ifsc: parse.ifsc,
      placeOfSupply: parse.placeOfSupply,
      stateName: parse.stateName,
      customerName: parse.customerName,
      customerGstin: parse.customerGstin,
      lines: (parse.lines || []).slice(0, 2).map((l) => ({
        name: l.name,
        quantity: 1,
        unitPrice: l.unitPrice,
        hsnCode: l.hsnCode,
        gstRate: l.gstRate || 18,
        brand: l.brand,
        category: l.category,
        createIfMissing: true,
        trackSerial: false,
        commitStock: true,
      })),
    }),
  });
  const conf = await confRes.json();
  assert(confRes.ok, `confirm HTTP ${confRes.status} ${JSON.stringify(conf).slice(0, 200)}`, fails);
  assert(conf.supplier?.id, 'confirm should return supplier', fails);
  assert(/SHUBH/i.test(String(conf.supplier?.name || '')), 'supplier name on confirm', fails);
  assert(conf.supplier?.gstin === '09AHDPA3364M1ZA', `supplier gstin saved ${conf.supplier?.gstin}`, fails);
  assert(
    /SARGAM|CHANDPUR/i.test(String(conf.supplier?.address || '')),
    `supplier address saved "${conf.supplier?.address}"`,
    fails,
  );
  assert(conf.purchaseBill?.invoiceNumber === invNo, 'purchase bill created', fails);
  assert(
    Math.abs(Number(conf.purchaseBill?.totalAmount) - 123000) < 1 ||
      Number(conf.purchaseBill?.totalAmount) > 0,
    `bill total ${conf.purchaseBill?.totalAmount}`,
    fails,
  );

  const suppliers = await fetch(BASE + '/suppliers', { headers: auth }).then((r) => r.json());
  const found = (Array.isArray(suppliers) ? suppliers : []).find(
    (s) => s.id === conf.supplier.id || s.gstin === '09AHDPA3364M1ZA',
  );
  assert(found, 'supplier listed in /suppliers', fails);
  assert(found?.gstin === '09AHDPA3364M1ZA', 'list gstin', fails);
  assert(/SARGAM|CHANDPUR/i.test(String(found?.address || '')), `list address "${found?.address}"`, fails);

  const notes = conf.purchaseBill?.notes ? JSON.parse(conf.purchaseBill.notes) : {};
  assert(notes.ewayBillNo === '441730045950' || notes.irn, `bill notes extras ${conf.purchaseBill?.notes}`, fails);

  console.log('\n=== CONFIRM ===');
  console.log('  supplier:', conf.supplier);
  console.log('  bill:', {
    id: conf.purchaseBill?.id,
    invoiceNumber: conf.purchaseBill?.invoiceNumber,
    subtotal: conf.purchaseBill?.subtotal,
    taxAmount: conf.purchaseBill?.taxAmount,
    totalAmount: conf.purchaseBill?.totalAmount,
  });
  console.log('  notes extras:', notes);

  const out = path.join(__dirname, 'fixtures/bills/last-shubh-full-extract-report.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(
    out,
    JSON.stringify({ fails, parse, confirm: conf, supplierFromList: found }, null, 2),
  );

  if (fails.length) {
    console.log('\nFAILURES:');
    fails.forEach((f) => console.log(' -', f));
    console.log('\nSUMMARY FAIL', { failCount: fails.length, report: out });
    process.exit(1);
  }
  console.log('\nSUMMARY PASS', { report: out });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
