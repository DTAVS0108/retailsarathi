/**
 * Renders each billing template to a PNG preview (A4-ish crop).
 * Output: packages/ui/assets/invoice-previews/{id}.png
 * Copies to web/desktop/mobile for shared picker UX.
 *
 * Usage: node packages/ui/scripts/generate-invoice-previews.mjs
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const root = path.resolve(__dirname, '../../..');
const uiRoot = path.resolve(__dirname, '..');
const outDir = path.join(uiRoot, 'assets', 'invoice-previews');

const { renderInvoiceHtml, BILLING_TEMPLATES } = require('../dist/invoice-templates.js');

const sample = {
  shopName: 'RetailSarathi Demo Store',
  shopAddress: '12 MG Road, Pune, Maharashtra 411001',
  gstin: '27AABCR1234D1Z5',
  shopStateCode: '27',
  shopPhone: '9876543210',
  shopEmail: 'billing@demo.retailsarathi.in',
  bankName: 'HDFC Bank',
  bankAccountNo: '50200012345678',
  bankIfsc: 'HDFC0001234',
  bankBranch: 'MG Road',
  invoiceNumber: 'INV-2025-0042',
  date: '2025-07-26',
  customerName: 'Shubh Traders',
  customerPhone: '9123456780',
  customerGstin: '27AAACS9876F1Z2',
  customerStateCode: '27',
  customerAddress: '45 Market Yard, Pune 411037',
  placeOfSupply: '27',
  supplyType: 'INTRA_STATE',
  reverseCharge: false,
  irn: 'a1b2c3d4e5f6789012345678901234567890abcdef1234567890abcdef123456',
  einvoiceQr: 'https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=IRN-SAMPLE',
  qrKind: 'nic',
  ewayBillNo: 'EWB-791234567890',
  vehicleNo: 'MH12AB1234',
  copyKind: 'original',
  lines: [
    {
      name: 'Lithium Ion Battery Pack 12V',
      hsnCode: '8507',
      unit: 'NOS',
      qty: 2,
      rate: 4500,
      taxableAmount: 7627.12,
      amount: 9000,
      gstRate: 18,
      cgst: 686.44,
      sgst: 686.44,
      igst: 0,
    },
    {
      name: 'Inverter Cable Set',
      hsnCode: '8544',
      unit: 'NOS',
      qty: 1,
      rate: 899,
      taxableAmount: 761.86,
      amount: 899,
      gstRate: 18,
      cgst: 68.57,
      sgst: 68.57,
      igst: 0,
    },
  ],
  subtotal: 8388.98,
  totalCgst: 755.01,
  totalSgst: 755.01,
  totalIgst: 0,
  grandTotal: 9899,
  payments: [
    { method: 'UPI', amount: 5000 },
    { method: 'CASH', amount: 4899 },
  ],
  notes: 'Goods once sold will not be taken back. Subject to Pune jurisdiction.',
};

const copyTargets = [
  path.join(root, 'apps/web/public/invoice-previews'),
  path.join(root, 'apps/desktop/public/invoice-previews'),
  path.join(root, 'apps/mobile/assets/invoice_previews'),
];

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  for (const dir of copyTargets) fs.mkdirSync(dir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 794, height: 1123 }, // ~A4 @ 96dpi
    deviceScaleFactor: 2,
  });

  for (const tpl of BILLING_TEMPLATES) {
    const html = renderInvoiceHtml({ ...sample, templateId: tpl.id }, tpl.id);
    await page.setContent(html, { waitUntil: 'networkidle' });
    // Prefer the invoice root if present
    const handle =
      (await page.$('.sheet, .invoice, .page, body > div')) || (await page.$('body'));
    const file = path.join(outDir, `${tpl.id}.png`);
    await handle.screenshot({ path: file, type: 'png' });
    console.log('wrote', file);

    for (const dir of copyTargets) {
      fs.copyFileSync(file, path.join(dir, `${tpl.id}.png`));
    }
  }

  // Manifest for clients / API
  const manifest = {
    generatedAt: new Date().toISOString(),
    pathPattern: '/invoice-previews/{id}.png',
    mobileAssetPattern: 'assets/invoice_previews/{id}.png',
    templates: BILLING_TEMPLATES.map((t) => ({
      id: t.id,
      name: t.name,
      previewImage: `/invoice-previews/${t.id}.png`,
      mobileAsset: `assets/invoice_previews/${t.id}.png`,
    })),
  };
  fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  for (const dir of copyTargets) {
    fs.copyFileSync(path.join(outDir, 'manifest.json'), path.join(dir, 'manifest.json'));
  }

  await browser.close();
  console.log('Done —', BILLING_TEMPLATES.length, 'previews');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
