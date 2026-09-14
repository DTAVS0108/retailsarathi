const text = `No
SHUBH TRADERS 2026-27
NEAR SARGAM THEATER
CHANDPUR
GSTIN/UIN: 09AHDPA3364M1ZA
State Name: Uttar Pradesh, Code : 09
Buyer (Bill to)
M/s Tyagi Electric Works
Gulabi Market, Silara Road, Chandpur, Bijnor
09ASWPK4296J1ZR
:ASWPK4296J
GSTINIUIN
PANIT No
State Name
Place of Supply : Uttar Pradesh
85072000
85044010
: Uttar Pradesh, Code : 09
Description of Goods
|Amount Chargeable (in words)
OUTPUT SGST 9 %
Declaration
TAX INVOICE(Page 2)
Total
|INR One Lakh Twenty Three Thousand Oniy
HSN/SAC
HSN/SAC
GST
Rate
INVOICE No.
358
We decare that this INVOICE shows the actual price of the
goods described and that all particulars are true and
Correct.
Delivery Note
Reference No. & Date.
Buyer's Order No.
Dispatch Doc No.
Dispatched through
Bill of Lading/LR-RR No.
Terms of Delivery
Quantity
18.00 Pcs.
e-Way Bill No. Dated
441730045950 27-May-26
Taxable
Value Rate Amount
53813.55 9%
50423.73 9%
Total 104237.28
Sale Price
CGST
(ORIGINAL FOR RECIPIENT)
This is a Computer Generated INVOICE
Mode/Terms of Payment
Rate
4843.22 9%
4538.14 9%
9381.36
Other References
Dated
Delivery Note Date
Destination
Rate
Motor Vehicle No.
UP23AT5449
per
SGST/UTGST
Amount
4843.22
4538.14
9381.36|
Armount
9381.36
123000.00
Tax Amount (in words) : INREighteen Thousand Seven Hundred Sixty Two and Seventy Two paise Only
E. & 0.E
Total
Tax Amount
9686.44
9076.28
18762.72
Company's Bank Details
Bank Name
: PUNJAB NATIONAL BANK CIC
Alc No.
: 0096008700031334
Branch & IFS Code: CHANDPUR & PUNBOO09600
for SHUBH TRADERS 2026-27
For Shubh Traders
Prop
Authorised Signatory
`;

const fs = require('fs');
fs.writeFileSync('scripts/_shubh-user-ocr.txt', text);
const BASE = 'http://127.0.0.1:4000/api/v1';
(async () => {
  const login = await fetch(BASE + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'owner@demo.retailsarathi.in', password: 'Demo@123' }),
  }).then((r) => r.json());
  const body = await fetch(BASE + '/scan/parse-purchase', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + login.accessToken },
    body: JSON.stringify({ text }),
  }).then((r) => r.json());
  console.log(JSON.stringify({
    supplier: body.supplierName,
    address: body.supplierAddress,
    gstin: body.gstin,
    inv: body.invoiceNumber,
    date: body.invoiceDate,
    total: body.totalAmount,
    taxable: body.taxableValue,
    cgst: body.cgstAmount,
    sgst: body.sgstAmount,
    tax: body.taxAmount,
    bank: body.bankName,
    ac: body.bankAccount,
    ifsc: body.ifsc,
    branch: body.bankBranch,
    lines: (body.lines || []).map((l) => l.name + ' x' + l.quantity + '@' + l.unitPrice),
  }, null, 2));
})();
