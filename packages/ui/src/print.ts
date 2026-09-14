import { renderInvoiceHtml } from './invoice-templates';

import type { InvoiceDisplayOptions } from '@retail-sarathi/gst-engine';

export type InvoiceCopyKind = 'original' | 'duplicate' | 'triplicate';

export interface InvoiceQrParsed {
  gstin?: string;
  invoiceNumber?: string;
  date?: string;
  taxable?: number;
  amount?: number;
  cgst?: number;
  sgst?: number;
  igst?: number;
  buyerGstin?: string;
  buyer?: string;
  pay?: string;
  irn?: string;
}

export interface PrintInvoiceData {
  shopName: string;
  shopAddress: string;
  gstin?: string;
  shopStateCode?: string;
  shopPhone?: string;
  shopEmail?: string;
  bankName?: string;
  bankAccountNo?: string;
  bankIfsc?: string;
  bankBranch?: string;
  invoiceNumber: string;
  date: string;
  customerName?: string;
  customerPhone?: string;
  customerGstin?: string;
  customerStateCode?: string;
  customerAddress?: string;
  placeOfSupply?: string;
  supplyType?: 'INTRA_STATE' | 'INTER_STATE';
  reverseCharge?: boolean;
  irn?: string;
  einvoiceQr?: string;
  /** 'nic' = NIC SignedQR / live IRN; 'shop' = RetailSarathi verification QR */
  qrKind?: 'nic' | 'shop';
  ewayBillNo?: string;
  vehicleNo?: string;
  /** ORIGINAL FOR RECIPIENT / Duplicate / Triplicate */
  copyKind?: InvoiceCopyKind;
  copyLabel?: string;
  notes?: string;
  templateId?: string;
  displayOptions?: Partial<InvoiceDisplayOptions>;
  complianceLive?: boolean;
  qrPayload?: string;
  qrUrl?: string;
  qrParsed?: InvoiceQrParsed;
  lines: Array<{
    name: string;
    hsnCode?: string;
    sku?: string;
    barcode?: string;
    /** GST UQC e.g. NOS, KGS */
    unit?: string;
    qty: number;
    rate: number;
    amount: number;
    gstRate: number;
    taxableAmount?: number;
    cgst?: number;
    sgst?: number;
    igst?: number;
  }>;
  subtotal: number;
  totalCgst: number;
  totalSgst: number;
  totalIgst: number;
  grandTotal: number;
  /** TAX_INVOICE (default) or CREDIT_NOTE */
  documentType?: 'TAX_INVOICE' | 'CREDIT_NOTE';
  /** Original tax invoice referenced by a credit note */
  originalInvoiceNumber?: string;
  originalInvoiceDate?: string;
  /** Restocking/handling fee deducted from refund (credit note only) */
  processingFee?: number;
  /** Amount refunded to customer after processing fee */
  netRefundAmount?: number;
  payments?: Array<{ method: string; amount: number }>;
}

export function resolveInvoiceCopyLabel(
  kind: InvoiceCopyKind = 'original',
  style: 'tally' | 'plain' = 'plain',
): string {
  if (style === 'tally') {
    if (kind === 'duplicate') return '(DUPLICATE FOR TRANSPORTER)';
    if (kind === 'triplicate') return '(TRIPLICATE FOR SUPPLIER)';
    return '(ORIGINAL FOR RECIPIENT)';
  }
  if (kind === 'duplicate') return 'Duplicate Copy';
  if (kind === 'triplicate') return 'Triplicate Copy';
  return 'Original Copy';
}

export function generateThermalReceipt(data: PrintInvoiceData): string {
  const width = 32;
  const line = (text: string) => text.slice(0, width).padEnd(width);
  const center = (text: string) => {
    const pad = Math.max(0, Math.floor((width - text.length) / 2));
    return ' '.repeat(pad) + text;
  };
  const divider = '-'.repeat(width);

  const rows: string[] = [
    center(data.shopName),
    center(data.shopAddress.slice(0, width)),
    data.gstin ? center(`GSTIN: ${data.gstin}`) : '',
    divider,
    `Inv: ${data.invoiceNumber}`,
    `Date: ${data.date}`,
    data.customerName ? `Cust: ${data.customerName}` : '',
    data.customerAddress ? `Addr: ${data.customerAddress.slice(0, width - 6)}` : '',
    divider,
  ];

  for (const item of data.lines) {
    rows.push(line(item.name));
    const u = item.unit ? ` ${item.unit}` : '';
    rows.push(
      line(` ${item.qty}${u} x ${item.rate.toFixed(2)} = ${item.amount.toFixed(2)}`),
    );
  }

  rows.push(
    divider,
    line(`Subtotal: ${data.subtotal.toFixed(2)}`),
    data.totalCgst > 0 ? line(`CGST: ${data.totalCgst.toFixed(2)}`) : '',
    data.totalSgst > 0 ? line(`SGST: ${data.totalSgst.toFixed(2)}`) : '',
    data.totalIgst > 0 ? line(`IGST: ${data.totalIgst.toFixed(2)}`) : '',
    line(`TOTAL: ${data.grandTotal.toFixed(2)}`),
    divider,
    center('Thank you!'),
    center('RetailSarathi'),
  );

  return rows.filter(Boolean).join('\n');
}

export function generateA4InvoiceHtml(data: PrintInvoiceData, templateId = 'classic'): string {
  return renderInvoiceHtml(data, templateId);
}

/** Merge multiple full HTML print documents into one multi-page print view. */
export function combinePrintDocuments(documents: string[]): string {
  if (!documents.length) return '';
  if (documents.length === 1) return documents[0];

  const styles: string[] = [];
  const sheets: string[] = [];

  for (const doc of documents) {
    const styleBlocks = doc.match(/<style[^>]*>[\s\S]*?<\/style>/gi) ?? [];
    for (const block of styleBlocks) {
      const inner = block.replace(/<\/?style[^>]*>/gi, '').trim();
      if (inner) styles.push(inner);
    }
    const bodyMatch = doc.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
    if (bodyMatch?.[1]) {
      sheets.push(`<div class="print-sheet">${bodyMatch[1]}</div>`);
    }
  }

  const titleMatch = documents[0].match(/<title>([^<]*)<\/title>/i);
  const title = titleMatch?.[1] ?? 'Print';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${title}</title>
  <style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body { margin: 0; background: #fff; }
    .print-sheet {
      page-break-after: always;
      break-after: page;
    }
    .print-sheet:last-child {
      page-break-after: auto;
      break-after: auto;
    }
    ${styles.join('\n')}
  </style>
</head>
<body>
  ${sheets.join('\n')}
</body>
</html>`;
}
