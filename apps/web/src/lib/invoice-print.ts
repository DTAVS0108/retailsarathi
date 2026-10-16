import {
  combinePrintDocuments,
  generateA4InvoiceHtml,
  generateCreditAcknowledgementBothCopiesHtml,
  generateCreditAcknowledgementHtml,
  type CreditAcknowledgementData,
  type InvoiceCopyKind,
  type PrintInvoiceData,
} from '@retail-sarathi/ui';
import { formatDate, toNumber } from '@/app/dashboard/_components/dashboard-ui';

export type { InvoiceCopyKind };

export interface InvoicePrintSource {
  id: string;
  invoiceNumber: string;
  createdAt: string;
  grandTotal: number;
  status?: string;
  /** TAX_INVOICE (default) or CREDIT_NOTE — drives which download action InvoicePrintPanel shows. */
  documentType?: 'TAX_INVOICE' | 'CREDIT_NOTE';
  notes?: string | null;
  payments?: Array<{ method: string; amount: number; reference?: string | null }>;
  lines?: Array<{
    productName: string;
    quantity: number;
    total: number;
    serialNumbers?: string[];
  }>;
  customer?: {
    name?: string | null;
    phone?: string | null;
    gstin?: string | null;
    address?: string | null;
  } | null;
}

export interface CreditSummary {
  creditPending: number;
  amountPaid: number;
  grandTotal: number;
}

export type InvoicePrintAction =
  | { kind: 'invoice'; copy: InvoiceCopyKind; includeAcknowledgement: boolean }
  | { kind: 'acknowledgement' };

export const INVOICE_COPY_OPTIONS: Array<{
  copy: InvoiceCopyKind;
  label: string;
  shortLabel: string;
  hint: string;
  icon: string;
}> = [
  {
    copy: 'original',
    label: 'Original copy',
    shortLabel: 'Original',
    hint: 'For customer / recipient',
    icon: '👤',
  },
  {
    copy: 'duplicate',
    label: 'Duplicate copy',
    shortLabel: 'Duplicate',
    hint: 'For transporter / delivery',
    icon: '🚚',
  },
  {
    copy: 'triplicate',
    label: 'Triplicate copy',
    shortLabel: 'Triplicate',
    hint: 'For your shop records',
    icon: '📁',
  },
];

export function getCreditSummary(invoice: InvoicePrintSource): CreditSummary | null {
  const payments = invoice.payments ?? [];
  const creditPending = payments
    .filter((p) => p.method === 'CREDIT')
    .reduce((s, p) => s + toNumber(p.amount), 0);
  if (creditPending <= 0.009) return null;
  const amountPaid = payments
    .filter((p) => p.method !== 'CREDIT')
    .reduce((s, p) => s + toNumber(p.amount), 0);
  return { creditPending, amountPaid, grandTotal: toNumber(invoice.grandTotal) };
}

export function buildAcknowledgementData(
  invoice: InvoicePrintSource,
  printData: PrintInvoiceData,
  creditSummary: CreditSummary,
): Omit<CreditAcknowledgementData, 'copyLabel'> {
  return {
    shopName: printData.shopName,
    shopAddress: printData.shopAddress,
    gstin: printData.gstin,
    shopPhone: printData.shopPhone,
    shopEmail: printData.shopEmail,
    invoiceNumber: invoice.invoiceNumber,
    date: printData.date || formatDate(invoice.createdAt),
    customerName: invoice.customer?.name ?? printData.customerName,
    customerPhone: invoice.customer?.phone ?? printData.customerPhone,
    customerGstin: invoice.customer?.gstin ?? undefined,
    customerAddress: invoice.customer?.address ?? printData.customerAddress,
    grandTotal: creditSummary.grandTotal,
    amountPaid: creditSummary.amountPaid,
    amountPending: creditSummary.creditPending,
    payments: (invoice.payments ?? []).map((p) => ({
      method: p.method,
      amount: toNumber(p.amount),
      reference: p.reference ?? undefined,
    })),
    lines: (invoice.lines ?? []).map((l) => ({
      name: l.productName,
      qty: toNumber(l.quantity),
      amount: toNumber(l.total),
      serialNumbers: l.serialNumbers,
    })),
    notes: invoice.notes ?? undefined,
  };
}

export function buildInvoicePrintHtml(
  printData: PrintInvoiceData,
  invoice: InvoicePrintSource,
  action: InvoicePrintAction,
): string {
  if (action.kind === 'acknowledgement') {
    const creditSummary = getCreditSummary(invoice);
    if (!creditSummary) {
      throw new Error('This invoice has no credit balance for acknowledgement.');
    }
    return generateCreditAcknowledgementBothCopiesHtml(
      buildAcknowledgementData(invoice, printData, creditSummary),
    );
  }

  const invoiceHtml = generateA4InvoiceHtml(printData, printData.templateId ?? 'classic');
  if (!action.includeAcknowledgement) return invoiceHtml;

  const creditSummary = getCreditSummary(invoice);
  if (!creditSummary) return invoiceHtml;

  const ackData = buildAcknowledgementData(invoice, printData, creditSummary);
  return combinePrintDocuments([
    invoiceHtml,
    generateCreditAcknowledgementHtml({ ...ackData, copyLabel: 'Original Copy' }),
    generateCreditAcknowledgementHtml({ ...ackData, copyLabel: 'Customer Copy' }),
  ]);
}

export function openPrintWindow(html: string): string | null {
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const preview = window.open(url, '_blank', 'width=1000,height=900');
  if (!preview) {
    URL.revokeObjectURL(url);
    return 'Unable to open print preview. Please allow pop-ups and try again.';
  }
  preview.addEventListener('load', () => {
    preview.focus();
    preview.print();
    URL.revokeObjectURL(url);
  });
  return null;
}
