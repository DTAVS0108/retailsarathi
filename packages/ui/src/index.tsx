import type { ButtonHTMLAttributes, ReactNode } from 'react';

/** Shared control heights — keep buttons aligned with inputs (44px default). */
export const controlHeight = {
  sm: 'min-h-9',
  md: 'min-h-11',
  lg: 'min-h-12',
} as const;

const base =
  'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none';

const variants = {
  primary:
    'bg-[color:var(--rs-accent,#0f766e)] text-[color:var(--rs-on-accent,#ffffff)] hover:bg-[color:var(--rs-accent-hover,#0d5f59)] focus:ring-[color:var(--rs-accent,#0f766e)]',
  secondary:
    'bg-[color:var(--rs-surface-2,#f3f4f6)] text-[color:var(--rs-ink,#111827)] hover:opacity-90 focus:ring-[color:var(--rs-border,#d1d5db)] border border-[color:var(--rs-border,#e5e7eb)]',
  danger: 'bg-red-600 text-white hover:bg-red-700 focus:ring-red-500',
  ghost:
    'bg-transparent text-[color:var(--rs-ink,#374151)] hover:bg-[color:var(--rs-surface-2,#f3f4f6)]',
};

const sizes = {
  sm: `${controlHeight.sm} px-3 text-sm`,
  md: `${controlHeight.md} px-4 text-sm`,
  lg: `${controlHeight.lg} px-5 text-base`,
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: keyof typeof variants;
  size?: keyof typeof sizes;
  children: ReactNode;
}

export function Button({
  variant = 'primary',
  size = 'md',
  className = '',
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Card({
  children,
  className = '',
  title,
}: {
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  return (
    <div
      className={`rounded-xl border shadow-sm ${className}`}
      style={{
        borderColor: 'var(--rs-border, #e5e7eb)',
        background: 'var(--rs-surface, #ffffff)',
        color: 'var(--rs-ink, #111827)',
        boxShadow: 'var(--rs-shadow, 0 1px 2px rgb(0 0 0 / 0.05))',
      }}
    >
      {title && (
        <div
          className="border-b px-4 py-3 font-semibold"
          style={{
            borderColor: 'var(--rs-border, #f3f4f6)',
            color: 'var(--rs-ink, #111827)',
          }}
        >
          {title}
        </div>
      )}
      <div className="p-4 sm:p-5">{children}</div>
    </div>
  );
}

export function Badge({
  children,
  color = 'gray',
}: {
  children: ReactNode;
  color?: 'gray' | 'green' | 'amber' | 'red' | 'teal';
}) {
  const colors = {
    gray: 'bg-[color:var(--rs-surface-2,#f3f4f6)] text-[color:var(--rs-ink,#374151)]',
    green: 'bg-green-100 text-green-800',
    amber: 'bg-amber-100 text-amber-800',
    red: 'bg-red-100 text-red-800',
    teal: 'bg-[color:var(--rs-accent-soft,#ccfbf1)] text-[color:var(--rs-accent,#0f766e)]',
  };
  return (
    <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${colors[color]}`}>
      {children}
    </span>
  );
}

export function formatINR(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(amount);
}

export { generateThermalReceipt, generateA4InvoiceHtml, combinePrintDocuments, resolveInvoiceCopyLabel } from './print';
export {
  generateCreditAcknowledgementHtml,
  generateCreditAcknowledgementBothCopiesHtml,
  type CreditAcknowledgementData,
} from './credit-acknowledgement';
export { BILLING_TEMPLATES, renderInvoiceHtml, invoicePreviewImage, type BillingTemplateMeta } from './invoice-templates';
export type { PrintInvoiceData, InvoiceCopyKind } from './print';
export { renderBarcodeSvg, generateBarcodeLabelsHtml, type BarcodeLabelItem, type BarcodeLabelOptions } from './barcode';
