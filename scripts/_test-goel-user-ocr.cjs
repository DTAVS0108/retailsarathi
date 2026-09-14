const fs = require('fs');
const text = fs.readFileSync('scripts/_goel-user-ocr.txt', 'utf8');

fetch('http://127.0.0.1:4000/api/v1/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'owner@demo.retailsarathi.in', password: 'Demo@123' }),
})
  .then((r) => r.json())
  .then((l) =>
    fetch('http://127.0.0.1:4000/api/v1/scan/parse-purchase', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + l.accessToken },
      body: JSON.stringify({ text }),
    }),
  )
  .then((r) => r.json())
  .then((j) => {
    console.log('lines', j.linesTotal, j.lines?.map((x) => `${x.name} x${x.quantity} @${x.unitPrice}`));
    console.log('customer', j.customerName, j.customerGstin);
    console.log('total', j.totalAmount, 'taxable', j.taxableValue);
    console.log('invoice', j.invoiceNumber, j.ackNo, j.ackDate, j.ewayBillNo, j.placeOfSupply);
    console.log('phone', j.phone);
    console.log('hsnTaxSummary', j.hsnTaxSummary?.length, j.hsnTaxSummary?.[0]);
    console.log('extractedJson customer', j.extractedJson?.customer);
  });
