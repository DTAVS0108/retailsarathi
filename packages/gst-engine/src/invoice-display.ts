export interface InvoiceDisplayOptions {
  /** Shop verification QR — off by default until Compliance+ credentials are configured. */
  showQr: boolean;
  /** IRN block — only when live e-invoice IRN exists or Compliance+ is configured and enabled. */
  showIrn: boolean;
  showEwayBill: boolean;
  showHsnColumn: boolean;
  showLineTaxBreakup: boolean;
  showHsnSummaryTable: boolean;
  showAmountInWords: boolean;
  showPayments: boolean;
  showSignatures: boolean;
  showBankDetails: boolean;
  showPlaceOfSupply: boolean;
  showLegalFooter: boolean;
  showCustomerPhone: boolean;
  showCustomerGstin: boolean;
  showShopPhone: boolean;
  /** Show thermal receipt action on invoice detail / print UI. */
  showThermalPrint: boolean;
  /** Show WhatsApp bill action on invoice detail / print UI. */
  showWhatsAppBill: boolean;
  customFooterNote: string;
}

export const DEFAULT_INVOICE_DISPLAY_OPTIONS: InvoiceDisplayOptions = {
  showQr: false,
  showIrn: false,
  showEwayBill: false,
  showHsnColumn: true,
  showLineTaxBreakup: true,
  showHsnSummaryTable: true,
  showAmountInWords: true,
  showPayments: true,
  showSignatures: true,
  showBankDetails: false,
  showPlaceOfSupply: true,
  showLegalFooter: true,
  showCustomerPhone: true,
  showCustomerGstin: true,
  showShopPhone: true,
  showThermalPrint: false,
  showWhatsAppBill: false,
  customFooterNote: '',
};

export const INVOICE_DISPLAY_FIELDS: Array<{
  key: keyof InvoiceDisplayOptions;
  label: string;
  hint: string;
  group: 'compliance' | 'tax' | 'party' | 'footer';
  requiresCompliance?: boolean;
}> = [
  {
    key: 'showQr',
    label: 'Invoice QR code',
    hint: 'Shop verification QR (pipe payload). Live NIC SignedQR appears automatically when a real IRN exists — that is not the same as shop QR.',
    group: 'compliance',
  },
  {
    key: 'showIrn',
    label: 'E-invoice IRN',
    hint: 'Shows IRN when Compliance+ GSP credentials are configured. A live NIC IRN always prints when present (demo IRN-DEMO-* does not).',
    group: 'compliance',
    requiresCompliance: true,
  },
  {
    key: 'showEwayBill',
    label: 'E-way bill / vehicle',
    hint: 'Show e-way bill no. and vehicle no. when captured on the invoice (Compliance or invoice detail).',
    group: 'compliance',
  },
  {
    key: 'showHsnColumn',
    label: 'HSN/SAC column',
    hint: 'HSN code column in the line-item table.',
    group: 'tax',
  },
  {
    key: 'showLineTaxBreakup',
    label: 'Line CGST / SGST / IGST',
    hint: 'Per-line tax columns in detailed templates.',
    group: 'tax',
  },
  {
    key: 'showHsnSummaryTable',
    label: 'HSN tax summary table',
    hint: 'Bottom HSN-wise taxable value and tax breakup (Tally-style).',
    group: 'tax',
  },
  {
    key: 'showAmountInWords',
    label: 'Amount in words',
    hint: 'Grand total written in words.',
    group: 'footer',
  },
  {
    key: 'showPayments',
    label: 'Payment received',
    hint: 'Payment method and amount block.',
    group: 'footer',
  },
  {
    key: 'showSignatures',
    label: 'Signature blocks',
    hint: 'Customer and authorised signatory areas.',
    group: 'footer',
  },
  {
    key: 'showBankDetails',
    label: 'Bank details',
    hint: 'Shop bank name, account, and IFSC on the bill.',
    group: 'footer',
  },
  {
    key: 'showPlaceOfSupply',
    label: 'Place of supply',
    hint: 'State / place of supply on the invoice header.',
    group: 'party',
  },
  {
    key: 'showCustomerPhone',
    label: 'Customer phone',
    hint: 'Buyer phone on the bill.',
    group: 'party',
  },
  {
    key: 'showCustomerGstin',
    label: 'Customer GSTIN',
    hint: 'Buyer GSTIN on the bill.',
    group: 'party',
  },
  {
    key: 'showShopPhone',
    label: 'Shop phone',
    hint: 'Your shop contact number on the bill.',
    group: 'party',
  },
  {
    key: 'showThermalPrint',
    label: 'Thermal receipt action',
    hint: 'Show “Thermal” on invoice detail for 58mm counter print.',
    group: 'footer',
  },
  {
    key: 'showWhatsAppBill',
    label: 'WhatsApp bill action',
    hint: 'Show “WhatsApp” on invoice detail to share the bill (customer opt-in still required to send).',
    group: 'footer',
  },
  {
    key: 'showLegalFooter',
    label: 'Legal / Rule 46 footer',
    hint: 'Reverse charge note and computer-generated invoice disclaimer.',
    group: 'footer',
  },
];

export function isEinvoiceComplianceConfigured(): boolean {
  const token = process.env.EINVOICE_GSP_AUTH_TOKEN?.trim() ?? '';
  const gstin = process.env.EINVOICE_GSP_GSTIN?.trim() ?? '';
  return Boolean(token && gstin);
}

export function isLiveIrn(irn?: string | null): boolean {
  return Boolean(irn && !irn.startsWith('IRN-DEMO'));
}

export function mergeInvoiceDisplayOptions(
  raw?: Partial<InvoiceDisplayOptions> | Record<string, unknown> | null,
): InvoiceDisplayOptions {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_INVOICE_DISPLAY_OPTIONS };
  const merged = { ...DEFAULT_INVOICE_DISPLAY_OPTIONS };
  for (const key of Object.keys(DEFAULT_INVOICE_DISPLAY_OPTIONS) as Array<
    keyof InvoiceDisplayOptions
  >) {
    const value = (raw as Record<string, unknown>)[key];
    if (key === 'customFooterNote') {
      merged.customFooterNote = typeof value === 'string' ? value : '';
    } else if (typeof value === 'boolean') {
      merged[key] = value;
    }
  }
  return merged;
}

export function resolveEffectiveDisplayOptions(
  options: InvoiceDisplayOptions,
  ctx: { complianceLive: boolean; irn?: string | null },
): InvoiceDisplayOptions {
  const liveIrn = isLiveIrn(ctx.irn);
  return {
    ...options,
    showIrn: liveIrn || (ctx.complianceLive && options.showIrn),
    showQr: liveIrn || options.showQr,
    showEwayBill: options.showEwayBill,
  };
}
