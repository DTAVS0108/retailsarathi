/**
 * Deep extraction suite for sample-data invoices (from "sample data" folder).
 */
const fs = require('fs');
const path = require('path');

const BASE = process.env.API_URL || 'http://127.0.0.1:4000/api/v1';
const DIR = path.join(__dirname, '../apps/web/public/samples/bills/sample-data');

const CASES = [
  {
    file: '01-battery-trading.txt',
    expect: {
      supplier: /Battery Trading/i,
      invoiceNumber: /^18$/,
      minLines: 3,
      names: [/BL\s*56|Battery/i, /Amaron|HI\s*57/i],
      qtys: { 'BL 56 Battery': [1], Amaron: [1] },
      rates: [1350, 2500, 1250],
      totalAmount: 5545.2,
      cgst: 552.6,
      sgst: 552.6,
      bank: /State Bank/i,
      bankAccount: /30860782596/,
      ifsc: /SBIN0005684/,
      bankBranch: /Urmi/i,
    },
  },
  {
    file: '02-agarwal-cine.txt',
    expect: {
      supplier: /Agarwal Cine/i,
      gstin: /27AARCA3938P1ZT/,
      invoiceNumber: /ACWPL\/1626/i,
      customer: /Maddock/i,
      minLines: 3,
      names: [/Vinyl|Hp Digital/i, /Standy|Flex/i, /Matt Flex|Digital Normal/i],
      rates: [255, 2100, 10],
      totalAmount: 40993,
      cgst: 3126.6,
      bank: /Kotak/i,
      bankAccount: /9993339999/,
      ifsc: /KKBK0001413/,
    },
  },
  {
    file: '03-techguru-plus.txt',
    expect: {
      supplier: /TechGuruPlus/i,
      gstin: /07PTAFF9867H1Z4/,
      invoiceNumber: /3567\/2017-18/,
      customer: /NAZIM/i,
      minLines: 2,
      maxLines: 2,
      names: [/LED LIGHTS/i, /Bulbs/i],
      qtysExact: [
        { name: /LED/i, qty: 50, rate: 500 },
        { name: /Bulbs/i, qty: 20, rate: 2300 },
      ],
      totalAmount: 67024,
      taxableValue: 56800,
    },
  },
  {
    file: '04-raunaq-batteries.txt',
    expect: {
      supplier: /Raunaq/i,
      gstin: /09ABKPH0005M1ZS/,
      invoiceNumber: /RB\/2026-27\/359/,
      customer: /Tyagi/i,
      minLines: 3,
      names: [/ENERGY SAVER/i, /SUPER POWER NEW 900/i, /SUPER POWER NEW 700/i],
      qtysExact: [
        { name: /ENERGY SAVER/i, qty: 4, rate: 3347.46 },
        { name: /900/i, qty: 4, rate: 3601.69 },
        { name: /700/i, qty: 2, rate: 3033.9 },
      ],
      totalAmount: 39960,
      ewayOptional: true,
      bank: /AXIS/i,
      bankAccount: /923030033348387/,
      ifsc: /UTIB0004370/,
      bankBranch: /CHANDPUR/i,
    },
  },
  {
    file: '05-vakeel-battery.txt',
    expect: {
      supplier: /Vakeel/i,
      gstin: /09AFQPA3676K1ZY/,
      invoiceNumber: /25-26\/374/,
      customer: /Tyagi/i,
      minLines: 2,
      names: [/ED22036TT|200AH/i, /ED16536TT|150AH/i],
      qtysExact: [
        { name: /ED22036TT|200AH/i, qty: 10, rate: 12457.63 },
        { name: /ED16536TT|150AH/i, qty: 5, rate: 9406.78 },
      ],
      totalAmount: 198450,
      cgst: 15136.02,
      bank: /AXIS/i,
      bankAccount: /925030044936661/,
      ifsc: /UTIB0001059/,
      bankBranch: /NAJIBABAD/i,
    },
  },
  {
    file: '06-goel-enterprises.txt',
    expect: {
      supplier: /GOEL/i,
      gstin: /09ARDPG9739J1ZA/,
      invoiceNumber: /^67$/,
      customer: /Tyagi/i,
      vehicleNo: /UK19CA1381/,
      ewayBillNo: /471711090767/,
      minLines: 2,
      names: [/ILTT 18060/i, /ILTT 18148/i],
      qtysExact: [
        { name: /18060/i, qty: 10, rate: 10550.85 },
        { name: /18148/i, qty: 5, rate: 9788.14 },
      ],
      totalAmount: 182250,
      taxableValue: 154449.16,
      bank: /HDFC/i,
      bankAccount: /50200052920380/,
      ifsc: /HDFC0001941/,
    },
  },
  {
    file: '07-shubh-traders-merged.txt',
    expect: {
      supplier: /SHUBH/i,
      gstin: /09AHDPA3364M1ZA/,
      invoiceNumber: /^358$/,
      customer: /Tyagi/i,
      minLines: 6,
      names: [/150AH|ILTJ/i, /EVO-D 700/i, /EVO-D 1650/i],
      totalAmount: 123000,
      taxableValue: 104237.28,
      cgst: 9381.36,
      sgst: 9381.36,
      ewayBillNo: /441730045950/,
      vehicleNo: /UP23AT5449/,
      bank: /PUNJAB|PNB/i,
      bankAccount: /0096008700031334/,
      ifsc: /PUNB0009600/,
      bankBranch: /CHANDPUR/i,
    },
  },
];

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

  let passed = 0;
  let failed = 0;
  const results = [];

  for (const c of CASES) {
    const fails = [];
    const text = fs.readFileSync(path.join(DIR, c.file), 'utf8');
    const res = await fetch(BASE + '/scan/parse-purchase', {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    const parse = await res.json();
    assert(res.ok, `HTTP ${res.status}`, fails);
    const e = c.expect;
    const lines = parse.lines || [];

    if (e.supplier) assert(e.supplier.test(String(parse.supplierName || '')), `supplier got "${parse.supplierName}"`, fails);
    if (e.gstin) assert(e.gstin.test(String(parse.gstin || '')), `gstin got "${parse.gstin}"`, fails);
    if (e.invoiceNumber) assert(e.invoiceNumber.test(String(parse.invoiceNumber || '')), `invoice got "${parse.invoiceNumber}"`, fails);
    if (e.customer) assert(e.customer.test(String(parse.customerName || '')), `customer got "${parse.customerName}"`, fails);
    if (e.vehicleNo) assert(e.vehicleNo.test(String(parse.vehicleNo || '')), `vehicle got "${parse.vehicleNo}"`, fails);
    if (e.ewayBillNo) assert(e.ewayBillNo.test(String(parse.ewayBillNo || '')), `eway got "${parse.ewayBillNo}"`, fails);
    if (e.bank) assert(e.bank.test(String(parse.bankName || '')), `bank got "${parse.bankName}"`, fails);
    if (e.bankAccount) assert(e.bankAccount.test(String(parse.bankAccount || '')), `a/c got "${parse.bankAccount}"`, fails);
    if (e.ifsc) assert(e.ifsc.test(String(parse.ifsc || '')), `ifsc got "${parse.ifsc}"`, fails);
    if (e.bankBranch) assert(e.bankBranch.test(String(parse.bankBranch || '')), `branch got "${parse.bankBranch}"`, fails);
    if (e.minLines) assert(lines.length >= e.minLines, `lines expected >=${e.minLines} got ${lines.length}`, fails);
    if (e.maxLines) assert(lines.length <= e.maxLines, `lines expected <=${e.maxLines} got ${lines.length}`, fails);
    if (e.names) {
      for (const re of e.names) {
        assert(lines.some((l) => re.test(l.name || '')), `missing name ${re}`, fails);
      }
    }
    if (e.rates) {
      for (const rate of e.rates) {
        assert(
          lines.some((l) => Math.abs(Number(l.unitPrice) - rate) < 0.05),
          `missing rate ${rate}`,
          fails,
        );
      }
    }
    if (e.qtysExact) {
      for (const q of e.qtysExact) {
        const hit = lines.find((l) => q.name.test(l.name || ''));
        assert(hit, `qtyExact missing ${q.name}`, fails);
        if (hit) {
          assert(Math.abs(Number(hit.quantity) - q.qty) < 0.01, `${hit.name} qty ${hit.quantity} != ${q.qty}`, fails);
          if (q.rate != null) {
            assert(
              Math.abs(Number(hit.unitPrice) - q.rate) < 0.05,
              `${hit.name} rate ${hit.unitPrice} != ${q.rate}`,
              fails,
            );
          }
        }
      }
    }
    if (e.totalAmount != null) {
      assert(
        Math.abs(Number(parse.totalAmount) - e.totalAmount) < 1,
        `total ${parse.totalAmount} != ${e.totalAmount}`,
        fails,
      );
    }
    if (e.taxableValue != null) {
      assert(
        Math.abs(Number(parse.taxableValue) - e.taxableValue) < 1,
        `taxable ${parse.taxableValue} != ${e.taxableValue}`,
        fails,
      );
    }
    if (e.cgst != null) {
      assert(Math.abs(Number(parse.cgstAmount) - e.cgst) < 0.5, `cgst ${parse.cgstAmount} != ${e.cgst}`, fails);
    }
    if (e.sgst != null) {
      assert(Math.abs(Number(parse.sgstAmount) - e.sgst) < 0.5, `sgst ${parse.sgstAmount} != ${e.sgst}`, fails);
    }

    // Noise checks: tax rows / transport-only junk as products with bad qty
    assert(
      !lines.some((l) => /OUTPUT|CGST SALE|SGST SALE|ROUND OFF|Less Discount|Taxable Value/i.test(l.name || '')),
      `tax noise in lines: ${lines.map((l) => l.name).join(' | ')}`,
      fails,
    );

    const ok = fails.length === 0;
    if (ok) passed++;
    else failed++;
    results.push({
      file: c.file,
      ok,
      fails,
      header: {
        supplier: parse.supplierName,
        gstin: parse.gstin,
        invoice: parse.invoiceNumber,
        customer: parse.customerName,
        total: parse.totalAmount,
        taxable: parse.taxableValue,
        cgst: parse.cgstAmount,
        sgst: parse.sgstAmount,
      },
      lines: lines.map((l) => `${l.name} x${l.quantity}@${l.unitPrice} hsn=${l.hsnCode}`),
    });

    console.log('\n==', c.file, ok ? 'PASS' : 'FAIL');
    if (fails.length) console.log('  fails:', fails.join(' | '));
    console.log('  header:', results[results.length - 1].header);
    console.log('  lines:', results[results.length - 1].lines.join(' || '));
  }

  const out = path.join(__dirname, 'fixtures/bills/last-sample-data-deep-report.json');
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ passed, failed, results }, null, 2));
  console.log('\nSUMMARY', { passed, failed, report: out });
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
