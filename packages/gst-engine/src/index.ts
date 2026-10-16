import type { SupplyType } from '@retail-sarathi/types';
import { mapUnitToUqc } from './uqc';

export interface LineItemInput {
  quantity: number;
  unitPrice: number;
  discount?: number;
  gstRate: number;
  hsnCode: string;
  productName: string;
  productId?: string;
}

export interface CalculatedLine {
  productId?: string;
  productName: string;
  hsnCode: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxableAmount: number;
  gstRate: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

export interface InvoiceTotals {
  subtotal: number;
  totalDiscount: number;
  totalCgst: number;
  totalSgst: number;
  totalIgst: number;
  grandTotal: number;
  supplyType: SupplyType;
  lines: CalculatedLine[];
}

export function determineSupplyType(
  sellerStateCode: string,
  buyerStateCode?: string,
): SupplyType {
  if (!buyerStateCode || sellerStateCode === buyerStateCode) {
    return 'INTRA_STATE';
  }
  return 'INTER_STATE';
}

export function calculateLineTax(
  item: LineItemInput,
  supplyType: SupplyType,
): CalculatedLine {
  const discount = item.discount ?? 0;
  const gross = item.quantity * item.unitPrice;
  const taxableAmount = Math.max(0, gross - discount);
  const taxAmount = (taxableAmount * item.gstRate) / 100;

  let cgst = 0;
  let sgst = 0;
  let igst = 0;

  if (supplyType === 'INTRA_STATE') {
    cgst = taxAmount / 2;
    sgst = taxAmount / 2;
  } else {
    igst = taxAmount;
  }

  return {
    productId: item.productId,
    productName: item.productName,
    hsnCode: item.hsnCode,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    discount,
    taxableAmount: round2(taxableAmount),
    gstRate: item.gstRate,
    cgst: round2(cgst),
    sgst: round2(sgst),
    igst: round2(igst),
    total: round2(taxableAmount + cgst + sgst + igst),
  };
}

export function calculateInvoice(
  items: LineItemInput[],
  sellerStateCode: string,
  buyerStateCode?: string,
): InvoiceTotals {
  const supplyType = determineSupplyType(sellerStateCode, buyerStateCode);
  const lines = items.map((item) => calculateLineTax(item, supplyType));

  const subtotal = round2(lines.reduce((s, l) => s + l.quantity * l.unitPrice, 0));
  const totalDiscount = round2(lines.reduce((s, l) => s + l.discount, 0));
  const totalCgst = round2(lines.reduce((s, l) => s + l.cgst, 0));
  const totalSgst = round2(lines.reduce((s, l) => s + l.sgst, 0));
  const totalIgst = round2(lines.reduce((s, l) => s + l.igst, 0));
  const grandTotal = round2(lines.reduce((s, l) => s + l.total, 0));

  return {
    subtotal,
    totalDiscount,
    totalCgst,
    totalSgst,
    totalIgst,
    grandTotal,
    supplyType,
    lines,
  };
}

export function validateGstin(gstin: string): boolean {
  const pattern =
    /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  return pattern.test(gstin.toUpperCase());
}

export interface HsnSummaryRow {
  hsnCode: string;
  description: string;
  uqc: string;
  totalQuantity: number;
  totalValue: number;
  taxableValue: number;
  igst: number;
  cgst: number;
  sgst: number;
}

export function buildHsnSummary(
  lines: Array<CalculatedLine & { unit?: string | null }>,
): HsnSummaryRow[] {
  const map = new Map<string, HsnSummaryRow>();

  for (const line of lines) {
    const uqc = mapUnitToUqc(line.unit);
    const existing = map.get(line.hsnCode);
    if (existing) {
      existing.totalQuantity += line.quantity;
      existing.totalValue += line.total;
      existing.taxableValue += line.taxableAmount;
      existing.igst += line.igst;
      existing.cgst += line.cgst;
      existing.sgst += line.sgst;
    } else {
      map.set(line.hsnCode, {
        hsnCode: line.hsnCode,
        description: line.productName,
        uqc,
        totalQuantity: line.quantity,
        totalValue: line.total,
        taxableValue: line.taxableAmount,
        igst: line.igst,
        cgst: line.cgst,
        sgst: line.sgst,
      });
    }
  }

  return Array.from(map.values()).map((row) => ({
    ...row,
    totalValue: round2(row.totalValue),
    taxableValue: round2(row.taxableValue),
    igst: round2(row.igst),
    cgst: round2(row.cgst),
    sgst: round2(row.sgst),
  }));
}

export interface Gstr3bSummary {
  outwardTaxable: number;
  outwardIgst: number;
  outwardCgst: number;
  outwardSgst: number;
  totalTaxPayable: number;
}

export function buildGstr3bSummary(lines: CalculatedLine[]): Gstr3bSummary {
  const outwardTaxable = round2(lines.reduce((s, l) => s + l.taxableAmount, 0));
  const outwardIgst = round2(lines.reduce((s, l) => s + l.igst, 0));
  const outwardCgst = round2(lines.reduce((s, l) => s + l.cgst, 0));
  const outwardSgst = round2(lines.reduce((s, l) => s + l.sgst, 0));

  return {
    outwardTaxable,
    outwardIgst,
    outwardCgst,
    outwardSgst,
    totalTaxPayable: round2(outwardIgst + outwardCgst + outwardSgst),
  };
}

export function buildGstr1Payload(
  gstin: string,
  fp: string,
  invoices: Array<{
    invoiceNumber: string;
    date: string;
    customerGstin?: string;
    customerName: string;
    placeOfSupply: string;
    lines: CalculatedLine[];
    grandTotal: number;
  }>,
) {
  const b2b: unknown[] = [];
  // GSTR-1 b2cs is a monthly aggregate by (place of supply, rate, supply type) —
  // not one row per invoice — so accumulate across every B2C invoice's lines here.
  const b2csAgg = new Map<
    string,
    { sply_ty: 'INTER' | 'INTRA'; rt: number; pos: string; txval: number; iamt: number; camt: number; samt: number }
  >();

  for (const inv of invoices) {
    const items = inv.lines.map((l) => ({
      num: 1,
      hsn_sc: l.hsnCode,
      qty: l.quantity,
      rt: l.gstRate,
      txval: l.taxableAmount,
      iamt: l.igst,
      camt: l.cgst,
      samt: l.sgst,
    }));

    if (inv.customerGstin) {
      b2b.push({
        ctin: inv.customerGstin,
        inv: [
          {
            inum: inv.invoiceNumber,
            idt: inv.date,
            val: inv.grandTotal,
            pos: inv.placeOfSupply,
            itms: items,
          },
        ],
      });
    } else {
      // A single invoice always has one supply type (seller/buyer state pair is fixed),
      // so any line carrying IGST means the whole invoice is inter-state.
      const sply_ty: 'INTER' | 'INTRA' = inv.lines.some((l) => l.igst > 0) ? 'INTER' : 'INTRA';
      for (const l of inv.lines) {
        const key = `${inv.placeOfSupply}|${l.gstRate}|${sply_ty}`;
        const row = b2csAgg.get(key) ?? {
          sply_ty,
          rt: l.gstRate,
          pos: inv.placeOfSupply,
          txval: 0,
          iamt: 0,
          camt: 0,
          samt: 0,
        };
        row.txval += l.taxableAmount;
        row.iamt += l.igst;
        row.camt += l.cgst;
        row.samt += l.sgst;
        b2csAgg.set(key, row);
      }
    }
  }

  const b2cs = [...b2csAgg.values()].map((row) => ({ ...row, typ: 'OE' }));

  return {
    gstin,
    fp,
    version: 'GST3.1.8',
    hash: 'hash',
    b2b,
    b2cl: [],
    b2cs,
    hsn: { data: buildHsnSummary(invoices.flatMap((i) => i.lines)) },
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Indian GST rate slabs for product / invoice UIs.
 * GST 2.0 (from 22 Sep 2025): main slabs are 0%, 5%, 18%, 40%.
 * Special rates: 0.25% (rough precious stones), 3% (gold/jewellery).
 * Legacy 12% and 28% kept for older stock / supplier invoices still in books.
 */
export const GST_SLABS = [
  { value: 0, label: '0% — Exempt / Nil', group: 'current' as const },
  { value: 5, label: '5% — Merit / essentials', group: 'current' as const },
  { value: 18, label: '18% — Standard', group: 'current' as const },
  { value: 40, label: '40% — Luxury / sin', group: 'current' as const },
  { value: 0.25, label: '0.25% — Rough stones', group: 'special' as const },
  { value: 3, label: '3% — Gold / jewellery', group: 'special' as const },
  { value: 12, label: '12% — Legacy (pre–GST 2.0)', group: 'legacy' as const },
  { value: 28, label: '28% — Legacy (pre–GST 2.0)', group: 'legacy' as const },
] as const;

export type GstSlabValue = (typeof GST_SLABS)[number]['value'];

export const GST_SLAB_VALUES: number[] = GST_SLABS.map((s) => s.value);

/** Snap an OCR/freeform rate to the nearest known slab when close. */
export function nearestGstSlab(rate: number, tolerance = 0.6): number {
  if (!Number.isFinite(rate)) return 18;
  let best = GST_SLAB_VALUES[0];
  let bestDiff = Math.abs(rate - best);
  for (const slab of GST_SLAB_VALUES) {
    const diff = Math.abs(rate - slab);
    if (diff < bestDiff) {
      best = slab;
      bestDiff = diff;
    }
  }
  return bestDiff <= tolerance ? best : rate;
}

export function isKnownGstSlab(rate: number): boolean {
  return GST_SLAB_VALUES.some((s) => Math.abs(s - rate) < 0.001);
}

export {
  buildInvoiceQrPayload,
  parseInvoiceQrPayload,
  invoiceQrImageUrl,
  encodeTextAsQrImage,
  type InvoiceQrInput,
  type ParsedInvoiceQr,
} from './invoice-qr';

export {
  buildUpiPaymentUri,
  upiQrImageUrl,
  isValidUpiId,
  type UpiPaymentInput,
} from './upi';

export {
  DEFAULT_INVOICE_DISPLAY_OPTIONS,
  INVOICE_DISPLAY_FIELDS,
  mergeInvoiceDisplayOptions,
  resolveEffectiveDisplayOptions,
  isEinvoiceComplianceConfigured,
  isLiveIrn,
  type InvoiceDisplayOptions,
} from './invoice-display';

export { mapUnitToUqc, formatUnitLabel } from './uqc';

export {
  DEFAULT_TAX_INVOICE_NUMBERING,
  DEFAULT_CREDIT_NOTE_NUMBERING,
  DEFAULT_LEDGER_SETTINGS,
  NUMBERING_PATTERN_PRESETS,
  mergeNumberingSettings,
  mergeLedgerSettings,
  mergeDocumentNumberingConfig,
  formatDocumentNumber,
  previewNextDocumentNumber,
  getIndianFinancialYear,
  getPeriodKey,
  getPeriodDateRange,
  parseTrailingSequence,
  describeResetPeriod,
  type NumberResetPeriod,
  type DocumentNumberingConfig,
  type TenantNumberingSettings,
  type LedgerSettings,
} from './invoice-numbering';

export {
  INDIAN_STATE_CODES,
  INDIAN_STATE_OPTIONS,
  formatIndianAddress,
  parseAddressPayload,
  normalizeCountry,
  normalizePincode,
  isValidIndianPincode,
  isValidGstStateCode,
  getGstStatesForPincode,
  pincodeMatchesState,
  assertPincodeMatchesState,
  assertAddressLine,
  assertCity,
  assertIndianPincode,
  assertGstStateCode,
  assertCountry,
  type StructuredAddress,
} from './address';
