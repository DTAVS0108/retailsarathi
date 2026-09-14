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
  if (!login.accessToken) {
    console.error('LOGIN FAIL', login);
    process.exit(1);
  }
  const h = {
    Authorization: 'Bearer ' + login.accessToken,
    'Content-Type': 'application/json',
  };

  const sample = fs.readFileSync(
    path.join('apps/web/public/samples/demo-supplier-invoice.txt'),
    'utf8',
  );

  const parseRes = await fetch(base + '/scan/parse-purchase', {
    method: 'POST',
    headers: h,
    body: JSON.stringify({ text: sample }),
  });
  const parse = await parseRes.json();
  console.log('PARSE', parseRes.status, 'lines', parse.linesTotal, 'matched', parse.linesMatched);
  if (!parseRes.ok) {
    console.log(parse);
    process.exit(1);
  }

  const tracked = (parse.lines || []).filter((l) => l.trackSerial);
  console.log(
    'trackSerial lines:',
    tracked.map((l) => l.name.slice(0, 40) + ' qty=' + l.quantity).join(' || ') || 'none',
  );

  // Mobile-style confirm WITHOUT serials (current buggy UX)
  const mobileLines = (parse.lines || [])
    .filter((l) => l.name && l.quantity > 0)
    .slice(0, 3)
    .map((l) => ({
      name: String(l.name).trim(),
      quantity: Number(l.quantity),
      unitPrice: l.unitPrice,
      salePrice: l.salePrice || (l.unitPrice ? l.unitPrice * 1.2 : undefined),
      hsnCode: l.hsnCode,
      gstRate: l.gstRate,
      brand: l.brand,
      category: l.category,
      sku: l.sku,
      productId: l.productId,
      createIfMissing: l.createIfMissing !== false,
      trackSerial: !!l.trackSerial,
      commitStock: true,
    }));

  const confBad = await fetch(base + '/scan/confirm-stock-in', {
    method: 'POST',
    headers: h,
    body: JSON.stringify({
      supplierName: parse.supplierName,
      invoiceNumber: 'BAD-' + Date.now(),
      invoiceDate: parse.invoiceDate,
      gstin: parse.gstin,
      lines: mobileLines,
    }),
  });
  const badBody = await confBad.json();
  console.log('CONFIRM without serials (mobile default from match):', confBad.status, badBody.message || badBody);

  // Fixed: trackSerial false unless serials provided
  const fixedLines = mobileLines.map((l) => ({
    ...l,
    trackSerial: false,
    serialNumbers: undefined,
  }));
  const confOk = await fetch(base + '/scan/confirm-stock-in', {
    method: 'POST',
    headers: h,
    body: JSON.stringify({
      supplierName: parse.supplierName,
      invoiceNumber: 'OK-' + Date.now(),
      invoiceDate: parse.invoiceDate,
      gstin: parse.gstin,
      lines: fixedLines,
    }),
  });
  const okBody = await confOk.json();
  console.log('CONFIRM trackSerial=false:', confOk.status, okBody.message || okBody);

  // Draft save
  const draftRes = await fetch(base + '/scan/drafts', {
    method: 'POST',
    headers: h,
    body: JSON.stringify({
      draftId: undefined,
      supplierName: 'PowerHub',
      invoiceNumber: 'DRAFT-X',
      previewJson: { lines: fixedLines, supplierName: 'PowerHub' },
    }),
  });
  const draft = await draftRes.json();
  console.log('DRAFT create:', draftRes.status, draft.id ? 'id=' + draft.id : draft);

  // Upload txt as mobile would
  const fd = new FormData();
  fd.append('file', new Blob([sample], { type: 'text/plain' }), 'invoice.txt');
  fd.append('extractedText', sample);
  const up = await fetch(base + '/scan/upload', {
    method: 'POST',
    headers: { Authorization: h.Authorization },
    body: fd,
  });
  const upBody = await up.json();
  console.log(
    'UPLOAD',
    up.status,
    'previewLines',
    upBody.purchasePreview?.lines?.length,
    'uploadId',
    upBody.upload?.id,
  );
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
