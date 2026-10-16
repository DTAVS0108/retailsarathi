import type { InvoiceCopyKind, PrintInvoiceData } from './print';
import { resolveInvoiceCopyLabel } from './print';
import {
  buildInvoiceQrPayload,
  invoiceQrImageUrl,
  encodeTextAsQrImage,
  DEFAULT_INVOICE_DISPLAY_OPTIONS,
  formatUnitLabel,
  type InvoiceDisplayOptions,
} from '@retail-sarathi/gst-engine';

export interface BillingTemplateMeta {
  id: string;
  name: string;
  description: string;
  accent: string;
  layout: 'a4' | 'thermal';
  mobileRecommended?: boolean;
  /** Shared static preview (web/desktop public path). */
  previewImage: string;
  /** Flutter asset path for the same PNG. */
  mobilePreviewAsset: string;
}

export const BILLING_TEMPLATES: BillingTemplateMeta[] = [
  {
    id: 'classic',
    name: 'Classic GST',
    description: 'Rule 46 compliant layout with HSN table, tax summary, and amount in words.',
    accent: '#0F766E',
    layout: 'a4',
    mobileRecommended: true,
    previewImage: '/invoice-previews/classic.png',
    mobilePreviewAsset: 'assets/invoice_previews/classic.png',
  },
  {
    id: 'minimal',
    description: 'Dense black-and-white format optimised for laser printing and audits.',
    name: 'Minimal Compliance',
    accent: '#1F2937',
    layout: 'a4',
    mobileRecommended: true,
    previewImage: '/invoice-previews/minimal.png',
    mobilePreviewAsset: 'assets/invoice_previews/minimal.png',
  },
  {
    id: 'modern',
    name: 'Modern Pro',
    description: 'Contemporary design with e-invoice QR slot and payment summary.',
    accent: '#1D4ED8',
    layout: 'a4',
    mobileRecommended: true,
    previewImage: '/invoice-previews/modern.png',
    mobilePreviewAsset: 'assets/invoice_previews/modern.png',
  },
  {
    id: 'gst-formal',
    name: 'GST Formal',
    description: 'Government-style tax invoice with signature blocks and legal footer.',
    accent: '#92400E',
    layout: 'a4',
    mobileRecommended: true,
    previewImage: '/invoice-previews/gst-formal.png',
    mobilePreviewAsset: 'assets/invoice_previews/gst-formal.png',
  },
  {
    id: 'retail-bold',
    name: 'Retail Counter',
    description: 'Bold counter bill with large total, UPI note, and customer-friendly layout.',
    accent: '#BE123C',
    layout: 'a4',
    mobileRecommended: true,
    previewImage: '/invoice-previews/retail-bold.png',
    mobilePreviewAsset: 'assets/invoice_previews/retail-bold.png',
  },
  {
    id: 'tally-einvoice',
    name: 'Tally E-Invoice',
    description: 'Tally-style tax invoice with IRN header, large e-invoice QR, and HSN tax table.',
    accent: '#1D4ED8',
    layout: 'a4',
    previewImage: '/invoice-previews/tally-einvoice.png',
    mobilePreviewAsset: 'assets/invoice_previews/tally-einvoice.png',
  },
  {
    id: 'tally-standard',
    name: 'Tally Standard',
    description: 'Classic Tally tax invoice with e-way bill slot, item table, and bank footer.',
    accent: '#374151',
    layout: 'a4',
    previewImage: '/invoice-previews/tally-standard.png',
    mobilePreviewAsset: 'assets/invoice_previews/tally-standard.png',
  },
  {
    id: 'goel-enterprise',
    name: 'B2B Trade',
    description: 'Dealer-style layout with inline CGST/SGST columns, vehicle/e-way header, and bottom IRN QR.',
    accent: '#6D28D9',
    layout: 'a4',
    previewImage: '/invoice-previews/goel-enterprise.png',
    mobilePreviewAsset: 'assets/invoice_previews/goel-enterprise.png',
  },
];

/** Public URL path for a template preview image (web / Electron). */
export function invoicePreviewImage(templateId: string): string {
  const t = BILLING_TEMPLATES.find((x) => x.id === templateId);
  return t?.previewImage ?? `/invoice-previews/${templateId}.png`;
}
const STATE_NAMES: Record<string, string> = {
  '01': 'Jammu & Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '11': 'Sikkim',
  '12': 'Arunachal Pradesh',
  '13': 'Nagaland',
  '14': 'Manipur',
  '15': 'Mizoram',
  '16': 'Tripura',
  '17': 'Meghalaya',
  '18': 'Assam',
  '19': 'West Bengal',
  '20': 'Jharkhand',
  '21': 'Odisha',
  '22': 'Chhattisgarh',
  '23': 'Madhya Pradesh',
  '24': 'Gujarat',
  '27': 'Maharashtra',
  '29': 'Karnataka',
  '30': 'Goa',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
};

function formatFooterNote(value: string | null | undefined) {
  return escapeHtml(value).replace(/\r\n|\r|\n/g, '<br>');
}

function escapeHtml(value: string | null | undefined) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fmt(n: number) {
  return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function stateLabel(code?: string) {
  if (!code) return '—';
  return `${STATE_NAMES[code] ?? 'State'} (${code})`;
}

function amountInWordsIndian(amount: number): string {
  if (!Number.isFinite(amount) || amount < 0) return 'Zero Rupees Only';
  const ones = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const teens = [
    'Ten',
    'Eleven',
    'Twelve',
    'Thirteen',
    'Fourteen',
    'Fifteen',
    'Sixteen',
    'Seventeen',
    'Eighteen',
    'Nineteen',
  ];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function twoDigits(n: number): string {
    if (n < 10) return ones[n];
    if (n < 20) return teens[n - 10];
    return `${tens[Math.floor(n / 10)]}${ones[n % 10] ? ` ${ones[n % 10]}` : ''}`.trim();
  }

  function threeDigits(n: number): string {
    if (n === 0) return '';
    const hundred = Math.floor(n / 100);
    const rest = n % 100;
    return `${hundred ? `${ones[hundred]} Hundred` : ''}${rest ? (hundred ? ' ' : '') + twoDigits(rest) : ''}`.trim();
  }

  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);

  const parts: string[] = [];
  let n = rupees;
  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  const hundredBlock = n;

  if (crore) parts.push(`${twoDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (hundredBlock) parts.push(threeDigits(hundredBlock));

  const rupeeWords = parts.length ? parts.join(' ') : 'Zero';
  const paiseWords = paise ? ` and ${twoDigits(paise)} Paise` : '';
  return `${rupeeWords} Rupees${paiseWords} Only`;
}

function printStyles(extra = '') {
  return `
  /* margin: 0 here, not a real page margin — a nonzero @page margin is exactly the box Chrome
     draws its own URL/date/page-number footer into. The actual visual margin instead comes from
     .page/.tally-page's own padding below (forced via !important since each template's "extra"
     CSS block, which also sets its own smaller padding, is interpolated after this and would
     otherwise win the cascade). */
  @page { size: A4; margin: 0; }
  @media print {
    body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none !important; }
  }
  * { box-sizing: border-box; }
  body { font-family: 'Segoe UI', Arial, sans-serif; color: #0f172a; font-size: 12px; line-height: 1.45; margin: 0; }
  .page, .tally-page { padding: 12mm !important; }
  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 7px 8px; vertical-align: top; }
  .num { text-align: right; white-space: nowrap; }
  .muted { color: #64748b; font-size: 11px; }
  .label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; font-weight: 600; }
  .box { border: 1px solid #cbd5e1; border-radius: 6px; padding: 10px 12px; }
  .grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
  .grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
  ${extra}`;
}

function displayOpts(data: PrintInvoiceData): InvoiceDisplayOptions {
  return { ...DEFAULT_INVOICE_DISPLAY_OPTIONS, ...data.displayOptions };
}

function copyKind(data: PrintInvoiceData): InvoiceCopyKind {
  return data.copyKind === 'duplicate' || data.copyKind === 'triplicate' ? data.copyKind : 'original';
}

function copyLabelTally(data: PrintInvoiceData) {
  return escapeHtml(data.copyLabel ?? resolveInvoiceCopyLabel(copyKind(data), 'tally'));
}

function copyLabelPlain(data: PrintInvoiceData) {
  return escapeHtml(data.copyLabel ?? resolveInvoiceCopyLabel(copyKind(data), 'plain'));
}

function documentTitle(data: PrintInvoiceData) {
  return data.documentType === 'CREDIT_NOTE' ? 'Credit Note' : 'Tax Invoice';
}

function documentBadge(data: PrintInvoiceData) {
  return data.documentType === 'CREDIT_NOTE' ? 'CREDIT NOTE' : 'TAX INVOICE';
}

function creditNoteReferenceBlock(data: PrintInvoiceData) {
  if (data.documentType !== 'CREDIT_NOTE' || !data.originalInvoiceNumber) return '';
  const datePart = data.originalInvoiceDate ? ` · ${escapeHtml(data.originalInvoiceDate)}` : '';
  return `<div class="box" style="margin-top:10px;background:#fffbeb;border-color:#fcd34d">
    <span class="label">Original tax invoice</span><br>
    <strong>${escapeHtml(data.originalInvoiceNumber)}</strong>${datePart}
    <div class="muted" style="margin-top:4px">Credit note reverses supply against the original invoice for GST / ITR.</div>
  </div>`;
}

function processingFeeSummaryRows(data: PrintInvoiceData) {
  const fee = data.processingFee ?? 0;
  if (fee <= 0) return '';
  const net = data.netRefundAmount ?? data.grandTotal - fee;
  return `<tr><td>Processing / restocking fee</td><td class="num">− ₹${fmt(fee)}</td></tr>
  <tr class="grand"><td><strong>Net refund to customer</strong></td><td class="num"><strong>₹${fmt(net)}</strong></td></tr>`;
}

function lineUqc(line: PrintInvoiceData['lines'][number]) {
  return (line.unit || 'NOS').toUpperCase();
}

function lineQtyWithUnit(line: PrintInvoiceData['lines'][number], decimals?: number) {
  const qty = decimals != null ? line.qty.toFixed(decimals) : String(line.qty);
  return `${qty} ${lineUqc(line)}`;
}

function lineQtyWithLabel(line: PrintInvoiceData['lines'][number], decimals = 2) {
  return `${line.qty.toFixed(decimals)} ${formatUnitLabel(line.unit)}`;
}

function vehicleDisplay(data: PrintInvoiceData) {
  return data.vehicleNo?.trim() ? escapeHtml(data.vehicleNo.trim()) : '—';
}

function bankDetailsBlock(data: PrintInvoiceData) {
  const opts = displayOpts(data);
  if (!opts.showBankDetails) return '';
  if (!data.bankName && !data.bankAccountNo && !data.bankIfsc && !data.bankBranch) return '';
  return `<div class="tally-box" style="margin-top:8px">
    <strong>Company's Bank Details</strong><br>
    ${data.bankName ? `Bank Name: ${escapeHtml(data.bankName)}<br>` : ''}
    ${data.bankAccountNo ? `A/c No.: ${escapeHtml(data.bankAccountNo)}<br>` : ''}
    ${data.bankIfsc || data.bankBranch ? `Branch &amp; IFS Code: ${escapeHtml([data.bankBranch, data.bankIfsc].filter(Boolean).join(' & '))}` : ''}
  </div>`;
}

function lineRowsDetailed(data: PrintInvoiceData) {
  const opts = displayOpts(data);
  return data.lines
    .map((l, i) => {
      const hsn = l.hsnCode ? escapeHtml(l.hsnCode) : '—';
      const taxable = l.taxableAmount ?? l.amount;
      const cgst = l.cgst ?? 0;
      const sgst = l.sgst ?? 0;
      const igst = l.igst ?? 0;
      const hsnCell = opts.showHsnColumn ? `<td class="num">${hsn}</td>` : '';
      const taxCells =
        !opts.showLineTaxBreakup
          ? ''
          : data.totalIgst > 0
            ? `<td class="num">₹${fmt(igst)}</td>`
            : `<td class="num">₹${fmt(cgst)}</td><td class="num">₹${fmt(sgst)}</td>`;
      return `<tr>
        <td class="num">${i + 1}</td>
        <td>${escapeHtml(l.name)}</td>
        ${hsnCell}
        <td class="num">${lineQtyWithUnit(l)}</td>
        <td class="num">₹${fmt(l.rate)}</td>
        ${opts.showLineTaxBreakup ? `<td class="num">₹${fmt(taxable)}</td><td class="num">${l.gstRate}%</td>` : `<td class="num">${l.gstRate}%</td>`}
        ${taxCells}
        <td class="num"><strong>₹${fmt(l.amount)}</strong></td>
      </tr>`;
    })
    .join('');
}

function lineHeader(data: PrintInvoiceData) {
  const opts = displayOpts(data);
  const hsnHead = opts.showHsnColumn ? `<th class="num">HSN</th>` : '';
  if (!opts.showLineTaxBreakup) {
    return `<tr>
      <th class="num">#</th><th>Description</th>${hsnHead}<th class="num">Qty / UQC</th>
      <th class="num">Rate</th><th class="num">GST%</th><th class="num">Amount</th>
    </tr>`;
  }
  if (data.totalIgst > 0) {
    return `<tr>
      <th class="num">#</th><th>Description</th>${hsnHead}<th class="num">Qty / UQC</th>
      <th class="num">Rate</th><th class="num">Taxable</th><th class="num">GST%</th><th class="num">IGST</th><th class="num">Amount</th>
    </tr>`;
  }
  return `<tr>
    <th class="num">#</th><th>Description</th>${hsnHead}<th class="num">Qty / UQC</th>
    <th class="num">Rate</th><th class="num">Taxable</th><th class="num">GST%</th><th class="num">CGST</th><th class="num">SGST</th><th class="num">Amount</th>
  </tr>`;
}

function taxSummaryRows(data: PrintInvoiceData) {
  const rows = [
    `<tr><td>Taxable value</td><td class="num">₹${fmt(data.subtotal)}</td></tr>`,
  ];
  if (data.totalCgst > 0) rows.push(`<tr><td>CGST</td><td class="num">₹${fmt(data.totalCgst)}</td></tr>`);
  if (data.totalSgst > 0) rows.push(`<tr><td>SGST / UTGST</td><td class="num">₹${fmt(data.totalSgst)}</td></tr>`);
  if (data.totalIgst > 0) rows.push(`<tr><td>IGST</td><td class="num">₹${fmt(data.totalIgst)}</td></tr>`);
  rows.push(`<tr class="grand"><td><strong>${data.documentType === 'CREDIT_NOTE' ? 'Credit note total' : 'Grand total'}</strong></td><td class="num"><strong>₹${fmt(data.grandTotal)}</strong></td></tr>`);
  if (data.documentType === 'CREDIT_NOTE') rows.push(processingFeeSummaryRows(data));
  return rows.join('');
}

function paymentsBlock(data: PrintInvoiceData) {
  if (!displayOpts(data).showPayments || !data.payments?.length) return '';
  const rows = data.payments
    .map((p) => `<tr><td>${escapeHtml(p.method)}</td><td class="num">₹${fmt(p.amount)}</td></tr>`)
    .join('');
  return `<div class="box" style="margin-top:12px">
    <div class="label">Payment received</div>
    <table style="margin-top:6px"><tbody>${rows}</tbody></table>
  </div>`;
}

function qrPayloadFromPrintData(data: PrintInvoiceData): string {
  return buildInvoiceQrPayload({
    gstin: data.gstin,
    invoiceNumber: data.invoiceNumber,
    date: data.date,
    subtotal: data.subtotal,
    grandTotal: data.grandTotal,
    totalCgst: data.totalCgst,
    totalSgst: data.totalSgst,
    totalIgst: data.totalIgst,
    customerGstin: data.customerGstin,
    customerName: data.customerName,
    paymentMethod: data.payments?.length === 1 ? data.payments[0].method : undefined,
    irn: data.irn,
    storedQr: data.einvoiceQr,
  });
}

/** A shop (non-NIC) QR encodes a link to the invoice's public view page when one is available,
    so a customer's scan opens the actual invoice rather than raw pipe-delimited text. The NIC
    e-invoice QR is untouched — that's a government-signed payload, not ours to redirect. */
function resolveQrSrc(data: PrintInvoiceData): string {
  const stored = data.einvoiceQr?.trim();
  const isImage =
    !!stored && (/^https?:\/\//i.test(stored) || /^data:image\//i.test(stored));
  if (isImage) return stored!;
  if (data.qrKind === 'shop' && data.publicViewUrl) return encodeTextAsQrImage(data.publicViewUrl);
  return invoiceQrImageUrl(qrPayloadFromPrintData(data));
}

function qrPlaceholder(data: PrintInvoiceData) {
  if (!displayOpts(data).showQr) return '';
  const src = resolveQrSrc(data);
  const nic = data.qrKind === 'nic';
  const label = nic ? 'NIC e-Invoice QR' : 'Invoice QR (shop)';
  // A real NIC e-invoice QR must print at a minimum ~3x3in / 290x290px with white padding
  // (Rule 46 + NIC spec) — a shop's own verification QR carries no such legal size requirement,
  // so it stays compact. 260px is the practical ceiling that still fits this box's 280px column
  // without restructuring the surrounding grid.
  const size = nic ? 260 : 96;
  return `<div class="box qr-box"${nic ? ' style="background:#fff;padding:16px"' : ''}>
    <div class="label">${label}</div>
    <img src="${escapeHtml(src)}" alt="${label}" style="width:${size}px;height:${size}px;margin-top:6px;image-rendering:pixelated" />
    ${data.irn && displayOpts(data).showIrn ? `<div class="muted" style="margin-top:6px">IRN: ${escapeHtml(data.irn)}</div>` : `<div class="muted" style="margin-top:6px">${nic ? 'Signed QR from NIC / GSP' : 'Shop verification QR (not NIC SignedQR)'}</div>`}
  </div>`;
}

function legalFooter(data: PrintInvoiceData) {
  const opts = displayOpts(data);
  if (!opts.showLegalFooter && !opts.customFooterNote) return '';
  const reverse = data.reverseCharge
    ? 'Tax payable under reverse charge: Yes'
    : 'Tax payable under reverse charge: No';
  return `<div class="legal muted">
    ${opts.showLegalFooter ? `${reverse} · This is a computer-generated tax invoice issued under Rule 46 of CGST Rules, 2017.` : ''}
    ${data.notes ? `<br>Note: ${escapeHtml(data.notes)}` : ''}
    ${opts.customFooterNote ? `<br>${formatFooterNote(opts.customFooterNote)}` : ''}
  </div>`;
}

function partiesBlock(data: PrintInvoiceData, accent: string) {
  const opts = displayOpts(data);
  const buyerGstin =
    opts.showCustomerGstin && data.customerGstin
      ? `<div>GSTIN: ${escapeHtml(data.customerGstin)}</div>`
      : '';
  const buyerPhone =
    opts.showCustomerPhone && data.customerPhone
      ? `<div>${escapeHtml(data.customerPhone)}</div>`
      : '';
  const buyerState = data.customerStateCode
    ? `<div>State: ${escapeHtml(stateLabel(data.customerStateCode))}</div>`
    : '';
  const buyerAddress = data.customerAddress
    ? `<div class="muted">${escapeHtml(data.customerAddress)}</div>`
    : '';
  return `<div class="grid-2">
    <div class="box party" style="border-top:3px solid ${accent}">
      <div class="label">Supplier</div>
      <strong>${escapeHtml(data.shopName)}</strong>
      <div class="muted">${escapeHtml(data.shopAddress ?? '')}</div>
      ${data.gstin ? `<div>GSTIN: <strong>${escapeHtml(data.gstin)}</strong></div>` : ''}
      ${data.shopStateCode ? `<div>State: ${escapeHtml(stateLabel(data.shopStateCode))}</div>` : ''}
      ${opts.showShopPhone && data.shopPhone ? `<div>Phone: ${escapeHtml(data.shopPhone)}</div>` : ''}
    </div>
    <div class="box party">
      <div class="label">Bill to</div>
      <strong>${data.customerName ? escapeHtml(data.customerName) : 'Walk-in customer'}</strong>
      ${buyerAddress}
      ${buyerPhone}
      ${buyerGstin}
      ${buyerState}
    </div>
  </div>`;
}

function invoiceMetaBlock(data: PrintInvoiceData) {
  const opts = displayOpts(data);
  const posBlock = opts.showPlaceOfSupply
    ? `<div><span class="label">Place of supply</span><br><strong>${escapeHtml(stateLabel(data.placeOfSupply ?? data.shopStateCode))}</strong></div>`
    : '<div></div>';
  const showTransport =
    opts.showEwayBill && (data.ewayBillNo || data.vehicleNo);
  const complianceBlock =
    (opts.showIrn && data.irn) || showTransport
      ? `<div class="grid-2 meta-row" style="margin-top:8px">
    ${opts.showIrn && data.irn ? `<div><span class="label">IRN</span><br><strong class="muted" style="font-size:11px;word-break:break-all">${escapeHtml(data.irn)}</strong></div>` : '<div></div>'}
    ${showTransport ? `<div><span class="label">Transport</span><br>${data.ewayBillNo ? `<strong>E-way: ${escapeHtml(data.ewayBillNo)}</strong><br>` : ''}${data.vehicleNo ? `<strong>Vehicle: ${escapeHtml(data.vehicleNo)}</strong>` : ''}</div>` : '<div></div>'}
  </div>`
      : '';
  return `<div class="grid-3 meta-row">
    <div><span class="label">Invoice no.</span><br><strong>${escapeHtml(data.invoiceNumber)}</strong></div>
    <div><span class="label">Invoice date</span><br><strong>${data.date}</strong></div>
    ${posBlock}
  </div>
  ${complianceBlock}`;
}

function amountWordsBlock(data: PrintInvoiceData) {
  if (!displayOpts(data).showAmountInWords) return '';
  return `<div class="box amount-words">
    <span class="label">Amount chargeable (in words)</span><br>
    <strong>${amountInWordsIndian(data.grandTotal)}</strong>
  </div>`;
}

function signatureBlock(data: PrintInvoiceData) {
  if (!displayOpts(data).showSignatures) return '';
  return `<div class="grid-2 sig-row">
    <div class="sig"><div class="sig-line"></div><span class="muted">Customer signature</span></div>
    <div class="sig"><div class="sig-line"></div><span class="muted">Authorised signatory</span></div>
  </div>`;
}

function tallyPrintStyles(extra = '') {
  return printStyles(`
  .tally-page { max-width: 210mm; margin: 0 auto; padding: 10px 12px; font-size: 11px; }
  .tally-title { text-align: center; font-weight: 700; font-size: 15px; letter-spacing: 0.04em; margin: 0; }
  .tally-sub { text-align: center; font-size: 10px; margin: 2px 0 8px; }
  .tally-table th, .tally-table td { border: 1px solid #111; padding: 4px 5px; font-size: 10px; vertical-align: top; }
  .tally-table th { background: #f3f4f6; font-weight: 600; }
  .tally-box { border: 1px solid #111; padding: 5px 7px; }
  .tally-meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0; border: 1px solid #111; }
  .tally-meta-grid > div { border: 1px solid #111; padding: 4px 6px; min-height: 28px; font-size: 10px; }
  .tally-meta-grid .meta-label { font-size: 9px; color: #444; display: block; }
  .tally-head { display: grid; grid-template-columns: 1fr 170px; gap: 10px; align-items: start; }
  .tally-qr img { width: 118px; height: 118px; border: 1px solid #111; image-rendering: pixelated; }
  .tally-irn { font-size: 9px; word-break: break-all; line-height: 1.35; margin-top: 4px; }
  .tally-footer-grid { display: grid; grid-template-columns: 1.4fr 1fr; gap: 10px; margin-top: 10px; }
  .tally-decl { border: 1px solid #111; padding: 8px; font-size: 10px; min-height: 72px; }
  .tally-sig { border: 1px solid #111; padding: 8px; min-height: 72px; text-align: center; }
  .tally-sig-line { border-bottom: 1px solid #111; height: 42px; margin-bottom: 6px; }
  .tally-center { text-align: center; font-size: 10px; margin-top: 8px; }
  ${extra}`);
}

function qrImageSrc(data: PrintInvoiceData): string | null {
  if (!displayOpts(data).showQr) return null;
  return resolveQrSrc(data);
}

interface HsnRollup {
  hsn: string;
  taxable: number;
  cgst: number;
  sgst: number;
  igst: number;
  gstRate: number;
}

function rollupByHsn(data: PrintInvoiceData): HsnRollup[] {
  const map = new Map<string, HsnRollup>();
  for (const line of data.lines) {
    const hsn = line.hsnCode?.trim() || '—';
    const cur = map.get(hsn) ?? {
      hsn,
      taxable: 0,
      cgst: 0,
      sgst: 0,
      igst: 0,
      gstRate: line.gstRate,
    };
    cur.taxable += line.taxableAmount ?? line.amount;
    cur.cgst += line.cgst ?? 0;
    cur.sgst += line.sgst ?? 0;
    cur.igst += line.igst ?? 0;
    map.set(hsn, cur);
  }
  return [...map.values()];
}

function hsnSummaryTable(data: PrintInvoiceData, igstMode = false) {
  if (!displayOpts(data).showHsnSummaryTable) return '';
  const rows = rollupByHsn(data);
  const body = rows
    .map((r) => {
      const cgstRate = r.gstRate / 2;
      if (igstMode || data.totalIgst > 0) {
        return `<tr>
          <td>${escapeHtml(r.hsn)}</td>
          <td class="num">₹${fmt(r.taxable)}</td>
          <td class="num">${r.gstRate}%</td>
          <td class="num">₹${fmt(r.igst)}</td>
          <td class="num">₹${fmt(r.igst)}</td>
        </tr>`;
      }
      return `<tr>
        <td>${escapeHtml(r.hsn)}</td>
        <td class="num">₹${fmt(r.taxable)}</td>
        <td class="num">${cgstRate}%</td>
        <td class="num">₹${fmt(r.cgst)}</td>
        <td class="num">${cgstRate}%</td>
        <td class="num">₹${fmt(r.sgst)}</td>
        <td class="num">₹${fmt(r.cgst + r.sgst + r.igst)}</td>
      </tr>`;
    })
    .join('');
  const head =
    igstMode || data.totalIgst > 0
      ? `<tr><th>HSN/SAC</th><th class="num">Taxable Value</th><th class="num">IGST Rate</th><th class="num">IGST Amt</th><th class="num">Total Tax</th></tr>`
      : `<tr><th>HSN/SAC</th><th class="num">Taxable Value</th><th class="num">CGST Rate</th><th class="num">CGST Amt</th><th class="num">SGST Rate</th><th class="num">SGST Amt</th><th class="num">Total Tax</th></tr>`;
  const totalTax = data.totalCgst + data.totalSgst + data.totalIgst;
  const foot =
    igstMode || data.totalIgst > 0
      ? `<tr><td><strong>Total</strong></td><td class="num"><strong>₹${fmt(data.subtotal)}</strong></td><td></td><td class="num"><strong>₹${fmt(data.totalIgst)}</strong></td><td class="num"><strong>₹${fmt(totalTax)}</strong></td></tr>`
      : `<tr><td><strong>Total</strong></td><td class="num"><strong>₹${fmt(data.subtotal)}</strong></td><td></td><td class="num"><strong>₹${fmt(data.totalCgst)}</strong></td><td></td><td class="num"><strong>₹${fmt(data.totalSgst)}</strong></td><td class="num"><strong>₹${fmt(totalTax)}</strong></td></tr>`;
  return `<table class="tally-table" style="margin-top:8px"><thead>${head}</thead><tbody>${body}${foot}</tbody></table>`;
}

function tallySellerBuyerBlock(data: PrintInvoiceData) {
  const opts = displayOpts(data);
  const buyerGstin =
    opts.showCustomerGstin && data.customerGstin
      ? `<div>GSTIN/UIN: ${escapeHtml(data.customerGstin)}</div>`
      : '';
  const buyerPhone =
    opts.showCustomerPhone && data.customerPhone
      ? `<div>Contact: ${escapeHtml(data.customerPhone)}</div>`
      : '';
  const buyerState = data.customerStateCode
    ? `<div>State Name: ${escapeHtml(stateLabel(data.customerStateCode))}</div>`
    : '';
  const buyerAddress = data.customerAddress
    ? `<div>${escapeHtml(data.customerAddress)}</div>`
    : '';
  const pos = data.placeOfSupply ?? data.customerStateCode ?? data.shopStateCode;
  const ewayCell =
    opts.showEwayBill && data.ewayBillNo
      ? `<div><span class="meta-label">E-Way Bill No.</span><strong>${escapeHtml(data.ewayBillNo)}</strong></div>`
      : '<div><span class="meta-label">Reference No. &amp; Date</span>—</div>';
  const vehicleCell = `<div><span class="meta-label">Motor Vehicle No.</span>${opts.showEwayBill ? vehicleDisplay(data) : '—'}</div>`;
  return `<div style="display:grid;grid-template-columns:1.2fr 0.8fr;gap:10px;margin-top:8px">
    <div class="tally-box">
      <strong>${escapeHtml(data.shopName)}</strong>
      <div>${escapeHtml(data.shopAddress)}</div>
      ${data.gstin ? `<div>GSTIN/UIN: <strong>${escapeHtml(data.gstin)}</strong></div>` : ''}
      ${data.shopStateCode ? `<div>State Name: ${escapeHtml(stateLabel(data.shopStateCode))}</div>` : ''}
      ${opts.showShopPhone && data.shopPhone ? `<div>Contact: ${escapeHtml(data.shopPhone)}</div>` : ''}
    </div>
    <div class="tally-meta-grid">
      <div><span class="meta-label">Invoice No.</span><strong>${escapeHtml(data.invoiceNumber)}</strong></div>
      <div><span class="meta-label">Dated</span><strong>${data.date}</strong></div>
      <div><span class="meta-label">Delivery Note</span>—</div>
      <div><span class="meta-label">Mode/Terms of Payment</span>—</div>
      ${ewayCell}
      ${vehicleCell}
      <div><span class="meta-label">Buyer's Order No.</span>—</div>
      <div><span class="meta-label">Dispatch Doc No.</span>—</div>
      <div><span class="meta-label">Destination</span>${data.customerAddress ? escapeHtml(data.customerAddress.slice(0, 40)) : '—'}</div>
    </div>
  </div>
  <div class="tally-box" style="margin-top:8px">
    <div style="font-weight:600;margin-bottom:4px">Buyer (Bill to)</div>
    <strong>${data.customerName ? escapeHtml(data.customerName) : 'Walk-in customer'}</strong>
    ${buyerAddress}
    ${buyerPhone}
    ${buyerGstin}
    ${buyerState}
    ${opts.showPlaceOfSupply && pos ? `<div>Place of Supply: ${escapeHtml(stateLabel(pos))}</div>` : ''}
  </div>`;
}

function renderTallyEinvoice(data: PrintInvoiceData) {
  const opts = displayOpts(data);
  const qrSrc = qrImageSrc(data);
  const lineRows = data.lines
    .map(
      (l, i) => `<tr>
        <td class="num">${i + 1}</td>
        <td>${escapeHtml(l.name)}</td>
        <td class="num">${l.gstRate}%</td>
        <td class="num">${lineQtyWithUnit(l)}</td>
        <td class="num">₹${fmt(l.rate)}</td>
        <td class="num">₹${fmt(l.amount)}</td>
      </tr>`,
    )
    .join('');
  const taxLines =
    data.totalIgst > 0
      ? `<tr><td colspan="5" style="text-align:right"><strong>IGST</strong></td><td class="num"><strong>₹${fmt(data.totalIgst)}</strong></td></tr>`
      : `<tr><td colspan="5" style="text-align:right"><strong>CGST</strong></td><td class="num"><strong>₹${fmt(data.totalCgst)}</strong></td></tr>
         <tr><td colspan="5" style="text-align:right"><strong>SGST</strong></td><td class="num"><strong>₹${fmt(data.totalSgst)}</strong></td></tr>`;
  const totalQty = data.lines.reduce((s, l) => s + l.qty, 0);
  const primaryUnit = lineUqc(data.lines[0] ?? { qty: 0, rate: 0, amount: 0, gstRate: 0, name: '' });
  const qrHead = qrSrc
    ? `<div class="tally-qr" style="text-align:center">
      <img src="${escapeHtml(qrSrc)}" alt="Invoice QR"${data.qrKind === 'nic' ? ' style="width:150px;height:150px"' : ''} />
      <div class="tally-sub">${data.qrKind === 'nic' ? 'NIC e-Invoice QR' : 'Invoice QR (shop)'}</div>
    </div>`
    : '';

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Tax Invoice ${escapeHtml(data.invoiceNumber)}</title>
<style>${tallyPrintStyles()}</style></head><body>
<div class="tally-page">
  <div class="tally-head">
    <div>
      <p class="tally-title">Tax Invoice</p>
      <p class="tally-sub">${copyLabelTally(data)}</p>
      ${opts.showIrn && data.irn ? `<div class="tally-irn"><strong>IRN:</strong> ${escapeHtml(data.irn)}</div>` : ''}
    </div>
    ${qrHead}
  </div>
  ${tallySellerBuyerBlock(data)}
  <table class="tally-table" style="margin-top:10px">
    <thead><tr>
      <th class="num">Sl No.</th><th>Description of Goods</th><th class="num">GST Rate</th>
      <th class="num">Quantity</th><th class="num">Rate (Incl. of Tax)</th><th class="num">Amount</th>
    </tr></thead>
    <tbody>
      ${lineRows}
      <tr><td colspan="5" style="text-align:right"><strong>Taxable Value</strong></td><td class="num"><strong>₹${fmt(data.subtotal)}</strong></td></tr>
      ${taxLines}
      <tr><td colspan="3" style="text-align:right"><strong>Total</strong></td><td class="num"><strong>${totalQty} ${primaryUnit}</strong></td><td></td><td class="num"><strong>₹${fmt(data.grandTotal)}</strong></td></tr>
    </tbody>
  </table>
  ${amountWordsBlock(data)}
  ${hsnSummaryTable(data)}
  ${opts.showAmountInWords ? `<div class="tally-box" style="margin-top:8px">
    <span class="label">Tax Amount (in words)</span><br>
    <strong>INR ${amountInWordsIndian(data.totalCgst + data.totalSgst + data.totalIgst)}</strong>
  </div>` : ''}
  ${bankDetailsBlock(data)}
  ${opts.showSignatures ? `<div class="tally-footer-grid">
    <div class="tally-decl">
      <strong>Declaration</strong><br>
      We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.
      ${data.notes ? `<br><br>Note: ${escapeHtml(data.notes)}` : ''}
      ${opts.customFooterNote ? `<br><br>${formatFooterNote(opts.customFooterNote)}` : ''}
    </div>
    <div class="tally-sig">
      <div class="tally-sig-line"></div>
      for <strong>${escapeHtml(data.shopName)}</strong><br>
      <span class="muted">Authorised Signatory</span>
    </div>
  </div>` : ''}
  ${legalFooter(data)}
  <div class="tally-center muted">This is a Computer Generated Invoice</div>
</div></body></html>`;
}

function renderTallyStandard(data: PrintInvoiceData) {
  const opts = displayOpts(data);
  const qrSrc = qrImageSrc(data);
  const lineRows = data.lines
    .map(
      (l, i) => `<tr>
        <td class="num">${i + 1}</td>
        <td>${escapeHtml(l.name)}</td>
        <td class="num">${l.hsnCode ? escapeHtml(l.hsnCode) : '—'}</td>
        <td class="num">${l.gstRate}%</td>
        <td class="num">${l.qty.toFixed(2)}</td>
        <td class="num">₹${fmt(l.rate)}</td>
        <td>${lineUqc(l)}</td>
        <td class="num">₹${fmt(l.amount)}</td>
      </tr>`,
    )
    .join('');
  const outputTax =
    data.totalIgst > 0
      ? `<tr><td colspan="7"><strong>OUTPUT IGST @ ${data.lines[0]?.gstRate ?? 18}%</strong></td><td class="num"><strong>₹${fmt(data.totalIgst)}</strong></td></tr>`
      : `<tr><td colspan="7"><strong>OUTPUT CGST @ ${(data.lines[0]?.gstRate ?? 18) / 2}%</strong></td><td class="num"><strong>₹${fmt(data.totalCgst)}</strong></td></tr>
         <tr><td colspan="7"><strong>OUTPUT SGST @ ${(data.lines[0]?.gstRate ?? 18) / 2}%</strong></td><td class="num"><strong>₹${fmt(data.totalSgst)}</strong></td></tr>`;
  const totalQty = data.lines.reduce((s, l) => s + l.qty, 0);

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Tax Invoice ${escapeHtml(data.invoiceNumber)}</title>
<style>${tallyPrintStyles(`
  .shubh-meta { display:grid; grid-template-columns:repeat(4,1fr); gap:0; border:1px solid #111; margin-top:8px; }
  .shubh-meta > div { border:1px solid #111; padding:4px 6px; font-size:10px; min-height:30px; }
`)}</style></head><body>
<div class="tally-page">
  <p class="tally-title">Tax Invoice</p>
  <p class="tally-sub">${copyLabelTally(data)}</p>
  <div class="tally-box">
    <strong>${escapeHtml(data.shopName)}</strong>
    <div>${escapeHtml(data.shopAddress)}</div>
    ${data.gstin ? `<div>GSTIN/UIN: ${escapeHtml(data.gstin)}</div>` : ''}
    ${data.shopStateCode ? `<div>State Name: ${escapeHtml(stateLabel(data.shopStateCode))}</div>` : ''}
  </div>
  <div class="shubh-meta">
    <div><span class="meta-label">Invoice No.</span><strong>${escapeHtml(data.invoiceNumber)}</strong></div>
    <div><span class="meta-label">Dated</span><strong>${data.date}</strong></div>
    <div><span class="meta-label">E-Way Bill No.</span>${opts.showEwayBill && data.ewayBillNo ? `<strong>${escapeHtml(data.ewayBillNo)}</strong>` : '—'}</div>
    <div><span class="meta-label">Motor Vehicle No.</span>${opts.showEwayBill ? vehicleDisplay(data) : '—'}</div>
  </div>
  <div class="tally-box" style="margin-top:8px">
    <div style="font-weight:600;margin-bottom:4px">Buyer (Bill to)</div>
    <strong>${data.customerName ? escapeHtml(data.customerName) : 'Walk-in customer'}</strong>
    ${data.customerAddress ? `<div>${escapeHtml(data.customerAddress)}</div>` : ''}
    ${opts.showCustomerPhone && data.customerPhone ? `<div>Contact: ${escapeHtml(data.customerPhone)}</div>` : ''}
    ${opts.showCustomerGstin && data.customerGstin ? `<div>GSTIN/UIN: ${escapeHtml(data.customerGstin)}</div>` : ''}
    ${data.customerStateCode ? `<div>State Name: ${escapeHtml(stateLabel(data.customerStateCode))}</div>` : ''}
    ${opts.showPlaceOfSupply ? `<div>Place of Supply: ${escapeHtml(stateLabel(data.placeOfSupply ?? data.shopStateCode))}</div>` : ''}
  </div>
  <table class="tally-table" style="margin-top:10px">
    <thead><tr>
      <th class="num">Sl No.</th><th>Description of Goods</th><th class="num">HSN/SAC</th><th class="num">GST Rate</th>
      <th class="num">Quantity</th><th class="num">Rate</th><th>per</th><th class="num">Amount</th>
    </tr></thead>
    <tbody>
      ${lineRows}
      <tr><td colspan="4"></td><td class="num"><strong>${totalQty.toFixed(2)}</strong></td><td colspan="2"><strong>Total</strong></td><td class="num"><strong>₹${fmt(data.grandTotal)}</strong></td></tr>
      ${outputTax}
    </tbody>
  </table>
  ${amountWordsBlock(data)}
  ${hsnSummaryTable(data)}
  ${opts.showAmountInWords ? `<div class="tally-box" style="margin-top:8px">
    <span class="label">Tax Amount (in words)</span><br>
    <strong>INR ${amountInWordsIndian(data.totalCgst + data.totalSgst + data.totalIgst)}</strong>
  </div>` : ''}
  ${bankDetailsBlock(data)}
  ${qrSrc ? `<div class="tally-qr" style="text-align:center;margin-top:8px">
    <img src="${escapeHtml(qrSrc)}" alt="Invoice QR"${data.qrKind === 'nic' ? ' style="width:150px;height:150px"' : ''} />
    <div class="tally-sub">${data.qrKind === 'nic' ? 'NIC e-Invoice QR' : 'Invoice QR (shop)'}${opts.showIrn && data.irn ? ` · IRN: ${escapeHtml(data.irn)}` : ''}</div>
  </div>` : ''}
  ${opts.showSignatures ? `<div class="tally-footer-grid">
    <div class="tally-decl">
      We declare that this invoice shows the actual price of the goods described and that all particulars are true and correct.
      ${opts.customFooterNote ? `<br><br>${formatFooterNote(opts.customFooterNote)}` : ''}
    </div>
    <div class="tally-sig">
      <div class="tally-sig-line"></div>
      for <strong>${escapeHtml(data.shopName)}</strong><br>
      <span class="muted">Authorised Signatory</span>
    </div>
  </div>` : ''}
  ${legalFooter(data)}
  <div class="tally-center muted">This is a Computer Generated Invoice</div>
</div></body></html>`;
}

function renderGoelEnterprise(data: PrintInvoiceData) {
  const opts = displayOpts(data);
  const qrSrc = qrImageSrc(data);
  const lineRows = data.lines
    .map((l, i) => {
      const cgstRate = l.gstRate / 2;
      const cgst = l.cgst ?? 0;
      const sgst = l.sgst ?? 0;
      const igst = l.igst ?? 0;
      if (data.totalIgst > 0) {
        return `<tr>
          <td class="num">${i + 1}</td>
          <td>${escapeHtml(l.name)}</td>
          <td class="num">${l.hsnCode ? escapeHtml(l.hsnCode) : '—'}</td>
          <td class="num">${lineQtyWithLabel(l)}</td>
          <td class="num">₹${fmt(l.rate)}</td>
          <td class="num">${l.gstRate}%</td>
          <td class="num">₹${fmt(igst)}</td>
          <td class="num">₹${fmt(l.amount)}</td>
        </tr>`;
      }
      return `<tr>
        <td class="num">${i + 1}</td>
        <td>${escapeHtml(l.name)}</td>
        <td class="num">${l.hsnCode ? escapeHtml(l.hsnCode) : '—'}</td>
        <td class="num">${lineQtyWithLabel(l)}</td>
        <td class="num">₹${fmt(l.rate)}</td>
        <td class="num">${cgstRate.toFixed(2)}%</td>
        <td class="num">₹${fmt(cgst)}</td>
        <td class="num">${cgstRate.toFixed(2)}%</td>
        <td class="num">₹${fmt(sgst)}</td>
        <td class="num">₹${fmt(l.amount)}</td>
      </tr>`;
    })
    .join('');
  const totalQty = data.lines.reduce((s, l) => s + l.qty, 0);
  const primaryLabel = formatUnitLabel(data.lines[0]?.unit);
  const partyBlock = (title: string) => `<div class="tally-box">
    <div style="font-weight:600;margin-bottom:4px">${title}</div>
    <strong>${data.customerName ? escapeHtml(data.customerName) : 'Walk-in customer'}</strong>
    ${data.customerAddress ? `<div>${escapeHtml(data.customerAddress)}</div>` : ''}
    ${opts.showCustomerPhone && data.customerPhone ? `<div>MO: ${escapeHtml(data.customerPhone)}</div>` : ''}
    ${opts.showCustomerGstin && data.customerGstin ? `<div>GSTIN / UIN: ${escapeHtml(data.customerGstin)}</div>` : ''}
    ${data.customerStateCode ? `<div>State: ${escapeHtml(stateLabel(data.customerStateCode))}</div>` : ''}
  </div>`;
  const lineHead =
    data.totalIgst > 0
      ? `<tr><th class="num">S.N.</th><th>Description of Goods</th><th class="num">HSN/SAC Code</th><th class="num">Qty. Unit</th><th class="num">Price</th><th class="num">IGST Rate</th><th class="num">IGST Amt</th><th class="num">Amount(₹)</th></tr>`
      : `<tr><th class="num">S.N.</th><th>Description of Goods</th><th class="num">HSN/SAC Code</th><th class="num">Qty. Unit</th><th class="num">Price</th><th class="num">CGST Rate</th><th class="num">CGST Amt</th><th class="num">SGST Rate</th><th class="num">SGST Amt</th><th class="num">Amount(₹)</th></tr>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Tax Invoice ${escapeHtml(data.invoiceNumber)}</title>
<style>${tallyPrintStyles(`
  .goel-head { display:grid; grid-template-columns:1fr auto; align-items:start; gap:8px; }
  .goel-copy { border:1px solid #111; padding:4px 10px; font-size:10px; font-weight:600; }
  .goel-meta { display:grid; grid-template-columns:repeat(4,1fr); gap:0; border:1px solid #111; margin-top:8px; }
  .goel-meta > div { border:1px solid #111; padding:4px 6px; font-size:10px; }
  .goel-bottom { display:grid; grid-template-columns:170px 1fr; gap:10px; margin-top:10px; align-items:start; }
`)}</style></head><body>
<div class="tally-page">
  <div class="goel-head">
    <div>
      <p class="tally-title" style="text-align:left">TAX INVOICE</p>
      <strong style="font-size:14px">${escapeHtml(data.shopName)}</strong>
      <div>${escapeHtml(data.shopAddress)}</div>
      ${data.gstin ? `<div>GSTIN: ${escapeHtml(data.gstin)}</div>` : ''}
    </div>
    <div class="goel-copy">${copyLabelPlain(data)}</div>
  </div>
  <div class="goel-meta">
    <div><span class="meta-label">Invoice No.</span><strong>${escapeHtml(data.invoiceNumber)}</strong></div>
    <div><span class="meta-label">Dated</span><strong>${data.date}</strong></div>
    <div><span class="meta-label">Place of Supply</span>${opts.showPlaceOfSupply ? escapeHtml(stateLabel(data.placeOfSupply ?? data.shopStateCode)) : '—'}</div>
    <div><span class="meta-label">Reverse Charge</span>${data.reverseCharge ? 'Y' : 'N'}</div>
    <div><span class="meta-label">Transport</span>FOR</div>
    <div><span class="meta-label">Vehicle No.</span>${opts.showEwayBill ? vehicleDisplay(data) : '—'}</div>
    <div><span class="meta-label">Station</span>—</div>
    <div><span class="meta-label">E-Way Bill No.</span>${opts.showEwayBill && data.ewayBillNo ? escapeHtml(data.ewayBillNo) : '—'}</div>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:8px">
    ${partyBlock('Billed to:')}
    ${partyBlock('Shipped to:')}
  </div>
  <table class="tally-table" style="margin-top:10px">
    <thead>${lineHead}</thead>
    <tbody>
      ${lineRows}
      <tr>
        <td colspan="${data.totalIgst > 0 ? 3 : 3}"><strong>Grand Total</strong></td>
        <td class="num"><strong>${totalQty.toFixed(2)} ${primaryLabel}</strong></td>
        <td colspan="${data.totalIgst > 0 ? 4 : 6}"></td>
        <td class="num"><strong>₹${fmt(data.grandTotal)}</strong></td>
      </tr>
    </tbody>
  </table>
  ${hsnSummaryTable(data)}
  ${opts.showAmountInWords ? `<div class="tally-box" style="margin-top:8px"><strong>Total in Words:</strong> Rupees ${amountInWordsIndian(data.grandTotal)}</div>` : ''}
  ${qrSrc || opts.showBankDetails || opts.showSignatures ? `<div class="goel-bottom">
    ${qrSrc ? `<div style="text-align:center">
      <img src="${escapeHtml(qrSrc)}" alt="Invoice QR" style="width:${data.qrKind === 'nic' ? 150 : 118}px;height:${data.qrKind === 'nic' ? 150 : 118}px;border:1px solid #111;image-rendering:pixelated" />
      ${opts.showIrn && data.irn ? `<div class="tally-irn" style="margin-top:6px"><strong>IRN:</strong> ${escapeHtml(data.irn)}</div>` : ''}
    </div>` : '<div></div>'}
    <div>
      ${bankDetailsBlock(data)}
      ${opts.showSignatures ? `<div class="tally-sig" style="margin-top:8px">
        <div class="tally-sig-line"></div>
        for <strong>${escapeHtml(data.shopName)}</strong><br>
        <span class="muted">Authorised Signatory</span>
      </div>` : ''}
    </div>
  </div>` : ''}
  ${legalFooter(data)}
</div></body></html>`;
}

function renderClassic(data: PrintInvoiceData, accent: string) {
  const title = documentTitle(data);
  const badge = documentBadge(data);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title} ${escapeHtml(data.invoiceNumber)}</title>
<style>${printStyles(`
  .page { max-width: 210mm; margin: 0 auto; padding: 16px; }
  .title-bar { display:flex; justify-content:space-between; align-items:flex-start; border-bottom:3px solid ${accent}; padding-bottom:12px; margin-bottom:14px; }
  .title-bar h1 { margin:0; color:${accent}; font-size:22px; }
  .tax-badge { background:${accent}; color:#fff; padding:6px 14px; border-radius:4px; font-weight:700; font-size:13px; letter-spacing:0.05em; }
  .items th { background:${accent}18; border:1px solid #cbd5e1; font-size:11px; }
  .items td { border:1px solid #e2e8f0; font-size:11px; }
  .items tr:nth-child(even) td { background:#f8fafc; }
  .summary td { border-bottom:1px solid #e2e8f0; padding:6px 8px; }
  .summary .grand td { border-top:2px solid ${accent}; font-size:14px; }
  .bottom { display:grid; grid-template-columns:1fr 280px; gap:16px; margin-top:14px; align-items:start; }
  .qr-placeholder { width:96px; height:96px; border:1px dashed #94a3b8; display:flex; align-items:center; justify-content:center; text-align:center; font-size:10px; color:#64748b; margin-top:6px; padding:8px; }
  .sig-line { border-bottom:1px solid #94a3b8; height:36px; margin-bottom:4px; }
  .legal { margin-top:16px; border-top:1px solid #e2e8f0; padding-top:10px; }
`)}</style></head><body>
<div class="page">
  <div class="title-bar">
    <div><h1>${escapeHtml(data.shopName)}</h1><div class="muted">${title} · ${copyLabelPlain(data)}</div></div>
    <div class="tax-badge">${badge}</div>
  </div>
  ${creditNoteReferenceBlock(data)}
  ${partiesBlock(data, accent)}
  <div style="margin-top:12px">${invoiceMetaBlock(data)}</div>
  <table class="items" style="margin-top:14px">
    <thead>${lineHeader(data)}</thead>
    <tbody>${lineRowsDetailed(data)}</tbody>
  </table>
  <div class="bottom">
    <div>
      ${amountWordsBlock(data)}
      ${bankDetailsBlock(data)}
      ${paymentsBlock(data)}
      ${legalFooter(data)}
    </div>
    <div>
      <table class="summary box" style="padding:0;overflow:hidden"><tbody>${taxSummaryRows(data)}</tbody></table>
      ${qrPlaceholder(data)}
    </div>
  </div>
  ${signatureBlock(data)}
  <p class="muted" style="text-align:center;margin-top:20px">Thank you for your business · Powered by RetailSarathi</p>
</div></body></html>`;
}

function renderMinimal(data: PrintInvoiceData) {
  const title = documentBadge(data);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${documentTitle(data)} ${escapeHtml(data.invoiceNumber)}</title>
<style>${printStyles(`
  .page { max-width:210mm; margin:0 auto; padding:14px; }
  h1 { font-size:18px; margin:0 0 4px; }
  .rule { border-top:2px solid #111; margin:12px 0; }
  .items th, .items td { border:1px solid #111; font-size:10.5px; }
  .items th { background:#f3f4f6; }
  .totals { width:100%; max-width:300px; margin-left:auto; margin-top:12px; }
  .totals td { border:1px solid #111; }
  .words { border:1px solid #111; padding:8px; margin-top:12px; }
  .sig-line { border-bottom:1px solid #111; height:32px; margin:24px 0 4px; }
`)}</style></head><body>
<div class="page">
  <h1>${title}</h1>
  ${creditNoteReferenceBlock(data)}
  <div class="grid-2">
    <div>
      <strong>${escapeHtml(data.shopName)}</strong><br>
      ${escapeHtml(data.shopAddress)}<br>
      ${data.gstin ? `GSTIN: ${escapeHtml(data.gstin)}` : ''}
    </div>
    <div style="text-align:right">
      <div>Invoice: <strong>${escapeHtml(data.invoiceNumber)}</strong></div>
      <div>Date: ${data.date}</div>
      <div>Place of supply: ${escapeHtml(stateLabel(data.placeOfSupply ?? data.shopStateCode))}</div>
    </div>
  </div>
  <div class="rule"></div>
  <div><strong>Bill to:</strong> ${data.customerName ? escapeHtml(data.customerName) : 'Walk-in customer'}${data.customerAddress ? `<br>${escapeHtml(data.customerAddress)}` : ''}${data.customerGstin ? ` · GSTIN ${escapeHtml(data.customerGstin)}` : ''}</div>
  <table class="items" style="margin-top:10px"><thead>${lineHeader(data)}</thead><tbody>${lineRowsDetailed(data)}</tbody></table>
  <table class="totals"><tbody>${taxSummaryRows(data)}</tbody></table>
  <div class="words"><span class="label">Amount in words</span><br><strong>${amountInWordsIndian(data.grandTotal)}</strong></div>
  ${bankDetailsBlock(data)}
  ${paymentsBlock(data)}
  ${qrPlaceholder(data)}
  <div class="grid-2"><div class="sig-line"></div><div class="sig-line"></div></div>
  <div class="grid-2 muted"><span>Customer sign</span><span>Authorised signatory</span></div>
  ${legalFooter(data)}
</div></body></html>`;
}

function renderModern(data: PrintInvoiceData, accent: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Tax Invoice ${escapeHtml(data.invoiceNumber)}</title>
<style>${printStyles(`
  .hero { background:linear-gradient(135deg, ${accent}, ${accent}dd); color:#fff; padding:24px 28px; border-radius:0 0 20px 20px; }
  .hero h1 { margin:0; font-size:24px; }
  .page { max-width:210mm; margin:0 auto; }
  .content { padding:20px 24px 24px; }
  .pill { display:inline-block; background:#fff2; padding:4px 10px; border-radius:999px; font-size:11px; margin-top:8px; }
  .card { background:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; padding:14px; }
  .items th { background:${accent}; color:#fff; font-size:11px; border:none; }
  .items td { border-bottom:1px solid #e2e8f0; font-size:11px; }
  .split { display:grid; grid-template-columns:1fr 300px; gap:16px; margin-top:16px; }
  .qr-placeholder { width:88px; height:88px; border:2px dashed ${accent}55; border-radius:8px; display:flex; align-items:center; justify-content:center; font-size:9px; color:#64748b; text-align:center; padding:6px; margin-top:8px; }
  .summary .grand td { color:${accent}; font-size:15px; }
`)}</style></head><body>
<div class="page">
  <div class="hero">
    <h1>${escapeHtml(data.shopName)}</h1>
    <div class="pill">Tax Invoice · ${escapeHtml(data.invoiceNumber)} · ${data.date}</div>
  </div>
  <div class="content">
    ${partiesBlock(data, accent)}
    <div class="card" style="margin-top:12px">${invoiceMetaBlock(data)}</div>
    <table class="items" style="margin-top:14px"><thead>${lineHeader(data)}</thead><tbody>${lineRowsDetailed(data)}</tbody></table>
    <div class="split">
      <div>
        ${amountWordsBlock(data)}
        ${bankDetailsBlock(data)}
        ${paymentsBlock(data)}
        ${legalFooter(data)}
      </div>
      <div>
        <div class="card"><table class="summary"><tbody>${taxSummaryRows(data)}</tbody></table></div>
        ${qrPlaceholder(data)}
      </div>
    </div>
    ${signatureBlock(data)}
  </div>
</div></body></html>`;
}

function renderGstFormal(data: PrintInvoiceData, accent: string) {
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Tax Invoice ${escapeHtml(data.invoiceNumber)}</title>
<style>${printStyles(`
  .page { max-width:210mm; margin:0 auto; padding:16px; border:2px solid ${accent}; }
  .head { text-align:center; border:2px solid ${accent}; padding:10px; font-weight:800; font-size:16px; letter-spacing:0.12em; }
  .firm { text-align:center; margin:14px 0; }
  .firm h1 { margin:0; font-size:20px; color:${accent}; }
  .items th { border:1px solid ${accent}; background:${accent}12; font-size:10px; }
  .items td { border:1px solid #d6d3d1; font-size:10px; }
  .tax-table { margin-top:12px; }
  .tax-table td { border:1px solid #d6d3d1; }
  .footer-grid { display:grid; grid-template-columns:2fr 1fr; gap:12px; margin-top:14px; }
  .declaration { border:1px solid #d6d3d1; padding:10px; font-size:11px; min-height:80px; }
  .sig-line { border-bottom:1px solid #444; height:40px; margin-top:28px; }
`)}</style></head><body>
<div class="page">
  <div class="head">TAX INVOICE · ${copyLabelPlain(data)}</div>
  <div class="firm">
    <h1>${escapeHtml(data.shopName)}</h1>
    <div>${escapeHtml(data.shopAddress)}</div>
    ${data.gstin ? `<div>GSTIN: <strong>${escapeHtml(data.gstin)}</strong></div>` : ''}
  </div>
  <div class="grid-2">
    <div class="box"><div class="label">Invoice details</div>
      No: <strong>${escapeHtml(data.invoiceNumber)}</strong><br>
      Date: <strong>${data.date}</strong><br>
      Place of supply: <strong>${escapeHtml(stateLabel(data.placeOfSupply ?? data.shopStateCode))}</strong>
    </div>
    <div class="box"><div class="label">Recipient</div>
      <strong>${data.customerName ? escapeHtml(data.customerName) : 'Walk-in customer'}</strong><br>
      ${data.customerAddress ? `${escapeHtml(data.customerAddress)}<br>` : ''}
      ${data.customerPhone ? escapeHtml(data.customerPhone) + '<br>' : ''}
      ${data.customerGstin ? `GSTIN: ${escapeHtml(data.customerGstin)}` : ''}
    </div>
  </div>
  <table class="items" style="margin-top:12px"><thead>${lineHeader(data)}</thead><tbody>${lineRowsDetailed(data)}</tbody></table>
  <div class="footer-grid">
    <div>
      <div class="declaration">
        <div class="label">Amount in words</div>
        <strong>${amountInWordsIndian(data.grandTotal)}</strong>
        <div style="margin-top:10px" class="muted">${data.reverseCharge ? 'Reverse charge applicable.' : 'Reverse charge not applicable.'}</div>
      </div>
      ${bankDetailsBlock(data)}
      ${paymentsBlock(data)}
    </div>
    <div>
      <table class="tax-table"><tbody>${taxSummaryRows(data)}</tbody></table>
      ${qrPlaceholder(data)}
    </div>
  </div>
  <div class="grid-2" style="margin-top:20px">
    <div><div class="sig-line"></div><span class="muted">Receiver's signature</span></div>
    <div><div class="sig-line"></div><span class="muted">For ${escapeHtml(data.shopName)}<br>Authorised signatory</span></div>
  </div>
  ${legalFooter(data)}
</div></body></html>`;
}

function renderRetailBold(data: PrintInvoiceData, accent: string) {
  const payMethods = data.payments?.map((p) => p.method).join(', ') ?? 'Cash / UPI';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Invoice ${escapeHtml(data.invoiceNumber)}</title>
<style>${printStyles(`
  .page { max-width:210mm; margin:0 auto; padding:16px; }
  .banner { background:${accent}; color:#fff; border-radius:14px; padding:20px 22px; display:flex; justify-content:space-between; align-items:center; }
  .banner h1 { margin:0; font-size:26px; }
  .total-hero { text-align:right; font-size:28px; font-weight:800; }
  .items th { background:#111; color:#fff; font-size:11px; }
  .items td { border-bottom:1px solid #e5e7eb; }
  .thanks { text-align:center; margin-top:18px; padding:14px; background:${accent}10; border-radius:10px; color:${accent}; font-weight:600; }
  .pay-chip { display:inline-block; background:#fff; color:${accent}; padding:4px 10px; border-radius:999px; font-size:11px; margin-top:8px; }
`)}</style></head><body>
<div class="page">
  <div class="banner">
    <div>
      <h1>${escapeHtml(data.shopName)}</h1>
      <div style="opacity:0.9;font-size:12px">${escapeHtml(data.invoiceNumber)} · ${data.date}</div>
      <div class="pay-chip">Paid via ${escapeHtml(payMethods)}</div>
    </div>
    <div class="total-hero">₹${fmt(data.grandTotal)}</div>
  </div>
  <div class="muted" style="margin:12px 0">${escapeHtml(data.shopAddress)}${data.gstin ? ` · GSTIN ${escapeHtml(data.gstin)}` : ''}</div>
  <div><strong>Customer:</strong> ${data.customerName ? escapeHtml(data.customerName) : 'Walk-in'}${data.customerPhone ? ` · ${escapeHtml(data.customerPhone)}` : ''}${data.customerAddress ? `<br>${escapeHtml(data.customerAddress)}` : ''}</div>
  <table class="items" style="margin-top:12px">
    <thead><tr><th>Item</th><th class="num">HSN</th><th class="num">Qty</th><th class="num">Rate</th><th class="num">GST</th><th class="num">Amount</th></tr></thead>
    <tbody>${data.lines
      .map(
        (l) =>
          `<tr><td>${escapeHtml(l.name)}</td><td class="num">${l.hsnCode ? escapeHtml(l.hsnCode) : '—'}</td><td class="num">${lineQtyWithUnit(l)}</td><td class="num">₹${fmt(l.rate)}</td><td class="num">${l.gstRate}%</td><td class="num"><strong>₹${fmt(l.amount)}</strong></td></tr>`,
      )
      .join('')}</tbody>
  </table>
  <div class="grid-2" style="margin-top:14px">
    <div class="box"><span class="label">Amount in words</span><br><strong>${amountInWordsIndian(data.grandTotal)}</strong></div>
    <table><tbody>
      <tr><td>Taxable</td><td class="num">₹${fmt(data.subtotal)}</td></tr>
      ${data.totalCgst > 0 ? `<tr><td>CGST</td><td class="num">₹${fmt(data.totalCgst)}</td></tr>` : ''}
      ${data.totalSgst > 0 ? `<tr><td>SGST</td><td class="num">₹${fmt(data.totalSgst)}</td></tr>` : ''}
      ${data.totalIgst > 0 ? `<tr><td>IGST</td><td class="num">₹${fmt(data.totalIgst)}</td></tr>` : ''}
    </tbody></table>
  </div>
  <div class="thanks">Thank you for shopping with us! · Goods once sold will not be taken back except as per store policy.</div>
  <p class="muted" style="text-align:center;margin-top:8px">Place of supply: ${escapeHtml(stateLabel(data.placeOfSupply ?? data.shopStateCode))}</p>
  ${qrPlaceholder(data)}
  ${legalFooter(data)}
</div></body></html>`;
}

export function renderInvoiceHtml(data: PrintInvoiceData, templateId = 'classic'): string {
  const template = BILLING_TEMPLATES.find((t) => t.id === templateId) ?? BILLING_TEMPLATES[0];
  const accent = template.accent;

  switch (templateId) {
    case 'minimal':
      return renderMinimal(data);
    case 'modern':
      return renderModern(data, accent);
    case 'gst-formal':
      return renderGstFormal(data, accent);
    case 'retail-bold':
      return renderRetailBold(data, accent);
    case 'tally-einvoice':
      return renderTallyEinvoice(data);
    case 'tally-standard':
      return renderTallyStandard(data);
    case 'goel-enterprise':
      return renderGoelEnterprise(data);
    default:
      return renderClassic(data, accent);
  }
}
