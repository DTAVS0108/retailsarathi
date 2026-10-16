import QRCode from 'qrcode';

export interface InvoiceQrInput {
  gstin?: string;
  invoiceNumber: string;
  date: string | Date;
  subtotal?: number;
  grandTotal: number;
  totalCgst?: number;
  totalSgst?: number;
  totalIgst?: number;
  customerGstin?: string;
  customerName?: string;
  paymentMethod?: string;
  irn?: string;
  /** Stored e-invoice SignedQRCode or prior payload — used when plain text. */
  storedQr?: string;
}

export interface ParsedInvoiceQr {
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
  raw: string;
}

const MONTH_INDEX: Record<string, number> = {
  jan: 0,
  feb: 1,
  mar: 2,
  apr: 3,
  may: 4,
  jun: 5,
  jul: 6,
  aug: 7,
  sep: 8,
  oct: 9,
  nov: 10,
  dec: 11,
};

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function formatQrDate(value: string | Date): string {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${pad2(value.getMonth() + 1)}-${pad2(value.getDate())}`;
  }
  const raw = String(value).trim();
  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const named = raw.match(/^(\d{1,2})[\/\-.\s]+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\/\-.\s,]*(\d{2,4})$/i);
  if (named) {
    const day = Number(named[1]);
    const month = MONTH_INDEX[named[2].slice(0, 3).toLowerCase()];
    let year = Number(named[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    return `${year}-${pad2(month + 1)}-${pad2(day)}`;
  }
  const dmy = raw.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (dmy) {
    let year = Number(dmy[3]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    return `${year}-${pad2(Number(dmy[2]))}-${pad2(Number(dmy[1]))}`;
  }
  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${pad2(parsed.getMonth() + 1)}-${pad2(parsed.getDate())}`;
  }
  return raw.slice(0, 10);
}

/** Pipe-delimited GST invoice QR payload for B2C verification / print. */
export function buildInvoiceQrPayload(input: InvoiceQrInput): string {
  const stored = input.storedQr?.trim();
  if (stored && !/^https?:\/\//i.test(stored) && !/^data:image\//i.test(stored)) {
    return stored;
  }
  const parts = [
    input.gstin ? `GSTIN:${input.gstin}` : null,
    `Inv:${input.invoiceNumber}`,
    `Dt:${formatQrDate(input.date)}`,
    input.subtotal != null ? `Taxable:${Number(input.subtotal).toFixed(2)}` : null,
    `Amt:${Number(input.grandTotal).toFixed(2)}`,
    `CGST:${Number(input.totalCgst ?? 0).toFixed(2)}`,
    `SGST:${Number(input.totalSgst ?? 0).toFixed(2)}`,
    `IGST:${Number(input.totalIgst ?? 0).toFixed(2)}`,
    input.customerGstin ? `BuyerGSTIN:${input.customerGstin}` : null,
    input.customerName ? `Buyer:${input.customerName.slice(0, 48)}` : null,
    input.paymentMethod ? `Pay:${input.paymentMethod}` : null,
    input.irn ? `IRN:${input.irn}` : null,
  ].filter(Boolean);
  return parts.join('|');
}

/** Decode a pipe-delimited invoice QR payload. */
export function parseInvoiceQrPayload(raw: string): ParsedInvoiceQr {
  const result: ParsedInvoiceQr = { raw };
  for (const segment of raw.split('|')) {
    const idx = segment.indexOf(':');
    if (idx <= 0) continue;
    const key = segment.slice(0, idx).trim().toUpperCase();
    const val = segment.slice(idx + 1).trim();
    switch (key) {
      case 'GSTIN':
        result.gstin = val;
        break;
      case 'INV':
        result.invoiceNumber = val;
        break;
      case 'DT':
        result.date = val;
        break;
      case 'TAXABLE':
        result.taxable = Number(val);
        break;
      case 'AMT':
        result.amount = Number(val);
        break;
      case 'CGST':
        result.cgst = Number(val);
        break;
      case 'SGST':
        result.sgst = Number(val);
        break;
      case 'IGST':
        result.igst = Number(val);
        break;
      case 'BUYERGSTIN':
        result.buyerGstin = val;
        break;
      case 'BUYER':
        result.buyer = val;
        break;
      case 'PAY':
        result.pay = val;
        break;
      case 'IRN':
        result.irn = val;
        break;
      default:
        break;
    }
  }
  return result;
}

/** Builds a minimal, crisp SVG string directly from QRCode.create()'s public BitMatrix API —
    synchronous and dependency-free (no `canvas` native binding, no network call). */
function renderQrSvg(payload: string, size: number): string {
  const qr = QRCode.create(payload, { errorCorrectionLevel: 'M' });
  const modules = qr.modules;
  const dimension = modules.size;
  let cells = '';
  for (let row = 0; row < dimension; row++) {
    for (let col = 0; col < dimension; col++) {
      if (modules.get(row, col)) {
        cells += `M${col},${row}h1v1h-1z`;
      }
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${dimension} ${dimension}" width="${size}" height="${size}" shape-rendering="crispEdges"><rect width="${dimension}" height="${dimension}" fill="#fff"/><path d="${cells}" fill="#000"/></svg>`;
}

/**
 * Renders the QR entirely locally (no third-party API call). This matters beyond convenience: the
 * payload here can be a real, government-signed NIC e-invoice SignedQRCode once a tenant goes live
 * with e-invoicing — sending that to an outside server on every print/preview would leak signed
 * invoice data. Also removes the only network dependency a QR ever had, so it renders offline.
 *
 * `payload` may already be a rendered image (a stored NIC SignedQR that happens to be an image
 * URL/data-URI) rather than text to encode — that case is passed through unchanged instead of
 * being wrapped in a second QR.
 */
export function invoiceQrImageUrl(payload: string, size = 200): string {
  if (/^https?:\/\//i.test(payload) || /^data:image\//i.test(payload)) return payload;
  return encodeTextAsQrImage(payload, size);
}

/** Encodes `text` as a QR image unconditionally — unlike {@link invoiceQrImageUrl}, an
    `http(s)://` string here is content to encode (e.g. a public invoice-view link), not an
    already-rendered image to pass through. */
export function encodeTextAsQrImage(text: string, size = 200): string {
  const svg = renderQrSvg(text, size);
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}
