/**
 * Simulates fixed mobile stock-in client behavior.
 */
const fs = require('fs');
const path = require('path');

(async () => {
  const base = 'http://127.0.0.1:4000/api/v1';
  const login = await fetch(base + '/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'owner@demo.retailsarathi.in',
      password: 'Demo@123',
    }),
  }).then((r) => r.json());
  const h = {
    Authorization: 'Bearer ' + login.accessToken,
    'Content-Type': 'application/json',
  };

  const sample = fs.readFileSync(
    path.join(__dirname, '../apps/web/public/samples/demo-supplier-invoice.txt'),
    'utf8',
  );

  let pass = 0;
  let fail = 0;
  const check = (name, ok, detail) => {
    console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (detail ? ' — ' + detail : ''));
    if (ok) pass++;
    else fail++;
  };

  const parseRes = await fetch(base + '/scan/parse-purchase', {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ text: sample }),
  });
  const parse = await parseRes.json();
  check('parse-purchase', parseRes.ok && parse.linesTotal > 0, 'lines=' + parse.linesTotal);

  // Fixed mobile: trackSerial always false unless user opts in
  const lines = (parse.lines || [])
    .filter((l) => l.name && Number(l.quantity) > 0)
    .slice(0, 4)
    .map((l) => ({
      name: String(l.name).trim(),
      quantity: Number(l.quantity),
      unitPrice: l.unitPrice,
      salePrice: l.salePrice || (l.unitPrice ? Number(l.unitPrice) * 1.2 : undefined),
      hsnCode: l.hsnCode,
      gstRate: l.gstRate,
      brand: l.brand,
      category: l.category,
      sku: l.sku,
      productId: l.productId,
      createIfMissing: true,
      trackSerial: false,
      commitStock: true,
    }));

  const inv = 'MOBFIX-' + Date.now();
  const conf = await fetch(base + '/scan/confirm-stock-in', {
    method: 'POST',
    headers: h,
    body: JSON.stringify({
      supplierName: parse.supplierName || 'PowerHub Distributors Pvt Ltd',
      invoiceNumber: inv,
      invoiceDate: parse.invoiceDate,
      gstin: parse.gstin,
      lines,
    }),
  });
  const body = await conf.json();
  check('confirm without serials (fixed client)', conf.ok && body.success, body.message);
  check('purchase bill created', !!body.purchaseBill?.invoiceNumber, body.purchaseBill?.invoiceNumber);

  // Opt-in serials path
  const serialConf = await fetch(base + '/scan/confirm-stock-in', {
    method: 'POST',
    headers: h,
    body: JSON.stringify({
      supplierName: 'PowerHub',
      invoiceNumber: 'SER-' + Date.now(),
      invoiceDate: '19-Jul-26',
      lines: [
        {
          name: 'Serial Test Battery Pack',
          quantity: 2,
          unitPrice: 500,
          salePrice: 600,
          createIfMissing: true,
          trackSerial: true,
          serialNumbers: ['ST-A-' + Date.now(), 'ST-B-' + Date.now()],
          barcode: '890ST' + String(Date.now()).slice(-8),
          category: 'Battery',
          hsnCode: '8507',
          gstRate: 28,
          commitStock: true,
        },
      ],
    }),
  });
  const serBody = await serialConf.json();
  check(
    'confirm with trackSerial + serials',
    serialConf.ok && serBody.items?.[0]?.serialsAdded === 2,
    serBody.message || JSON.stringify(serBody).slice(0, 120),
  );

  const draft = await fetch(base + '/scan/drafts', {
    method: 'POST',
    headers: h,
    body: JSON.stringify({
      supplierName: 'PowerHub',
      invoiceNumber: 'DR-' + Date.now(),
      previewJson: { lines, supplierName: 'PowerHub' },
    }),
  });
  const d = await draft.json();
  check('save draft', draft.ok && !!d.id, d.id);

  const fd = new FormData();
  fd.append('file', new Blob([sample], { type: 'text/plain' }), 'inv.txt');
  fd.append('extractedText', sample);
  const up = await fetch(base + '/scan/upload', {
    method: 'POST',
    headers: { Authorization: h.Authorization },
    body: fd,
  });
  const upBody = await up.json();
  check(
    'upload + preview',
    up.ok && (upBody.purchasePreview?.lines?.length > 0 || upBody.extractedText),
    'lines=' + (upBody.purchasePreview?.lines?.length || 0),
  );

  console.log('--- ' + pass + '/' + (pass + fail) + ' passed ---');
  process.exit(fail ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
