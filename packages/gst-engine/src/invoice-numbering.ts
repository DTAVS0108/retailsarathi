/** Document number reset period (Indian retail / GST context). */
export type NumberResetPeriod = 'financial_year' | 'calendar_year' | 'month' | 'never';

export interface DocumentNumberingConfig {
  prefix: string;
  /** Pattern tokens: {PREFIX} {FY} {YEAR} {MONTH} {SEQ} */
  pattern: string;
  padLength: number;
  resetPeriod: NumberResetPeriod;
  /** First number when a new period starts (default 1). */
  startFrom?: number;
}

export interface TenantNumberingSettings {
  taxInvoice: DocumentNumberingConfig;
  creditNote: DocumentNumberingConfig;
}

export interface LedgerSettings {
  /** Auto journal entry when a tax invoice is finalized. */
  autoPostSales: boolean;
  /** Auto reverse journal when a credit note is issued or invoice cancelled. */
  autoPostCreditNotes: boolean;
  /** Create default chart of accounts on first sale if missing. */
  seedAccountsOnFirstSale: boolean;
  /** Auto journal for customer collections (Dr Cash · Cr AR) and voids. */
  autoPostCollections: boolean;
  /** Auto journal for supplier payments (Dr AP · Cr Cash) and voids/bounces. */
  autoPostPayables: boolean;
  /** Optional bank statement feed URL (CSV or JSON) for reconcile sync. */
  bankFeedUrl?: string;
}

export const DEFAULT_TAX_INVOICE_NUMBERING: DocumentNumberingConfig = {
  prefix: 'INV',
  pattern: '{PREFIX}-{FY}-{SEQ}',
  padLength: 5,
  resetPeriod: 'financial_year',
  startFrom: 1,
};

export const DEFAULT_CREDIT_NOTE_NUMBERING: DocumentNumberingConfig = {
  prefix: 'CN',
  pattern: '{PREFIX}-{FY}-{SEQ}',
  padLength: 5,
  resetPeriod: 'financial_year',
  startFrom: 1,
};

export const DEFAULT_LEDGER_SETTINGS: LedgerSettings = {
  autoPostSales: true,
  autoPostCreditNotes: true,
  seedAccountsOnFirstSale: true,
  autoPostCollections: true,
  autoPostPayables: true,
};

export const NUMBERING_PATTERN_PRESETS: Array<{
  id: string;
  label: string;
  pattern: string;
  example: string;
}> = [
  { id: 'fy', label: 'FY series (recommended)', pattern: '{PREFIX}-{FY}-{SEQ}', example: 'INV-25-26-00001' },
  { id: 'year', label: 'Calendar year', pattern: '{PREFIX}-{YEAR}-{SEQ}', example: 'INV-2026-00001' },
  { id: 'slash', label: 'Slash format', pattern: '{PREFIX}/{FY}/{SEQ}', example: 'INV/25-26/00001' },
  { id: 'compact', label: 'Compact', pattern: '{PREFIX}{SEQ}', example: 'INV00001' },
  { id: 'fy-compact', label: 'FY compact', pattern: '{FY}{SEQ}', example: '252600001' },
];

export function getIndianFinancialYear(date = new Date()): {
  key: string;
  shortKey: string;
  label: string;
  startYear: number;
  endYear: number;
} {
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  const startYear = month >= 4 ? year : year - 1;
  const endYear = startYear + 1;
  const shortKey = `${String(startYear).slice(-2)}-${String(endYear).slice(-2)}`;
  return {
    key: `${startYear}-${endYear}`,
    shortKey,
    label: `FY ${startYear}–${String(endYear).slice(-2)}`,
    startYear,
    endYear,
  };
}

export function getPeriodKey(resetPeriod: NumberResetPeriod, date = new Date()): string {
  if (resetPeriod === 'never') return 'all';
  if (resetPeriod === 'financial_year') return getIndianFinancialYear(date).shortKey;
  if (resetPeriod === 'calendar_year') return String(date.getFullYear());
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function getPeriodDateRange(
  resetPeriod: NumberResetPeriod,
  date = new Date(),
): { from: Date; to: Date } | null {
  if (resetPeriod === 'never') return null;
  if (resetPeriod === 'financial_year') {
    const fy = getIndianFinancialYear(date);
    return {
      from: new Date(fy.startYear, 3, 1, 0, 0, 0, 0),
      to: new Date(fy.endYear, 2, 31, 23, 59, 59, 999),
    };
  }
  if (resetPeriod === 'calendar_year') {
    const y = date.getFullYear();
    return {
      from: new Date(y, 0, 1),
      to: new Date(y, 11, 31, 23, 59, 59, 999),
    };
  }
  const y = date.getFullYear();
  const m = date.getMonth();
  return {
    from: new Date(y, m, 1),
    to: new Date(y, m + 1, 0, 23, 59, 59, 999),
  };
}

export function mergeDocumentNumberingConfig(
  base: DocumentNumberingConfig,
  patch?: Partial<DocumentNumberingConfig> | null,
): DocumentNumberingConfig {
  if (!patch) return { ...base };
  return {
    prefix: sanitizePrefix(patch.prefix ?? base.prefix),
    pattern: String(patch.pattern ?? base.pattern).trim() || base.pattern,
    padLength: clampInt(patch.padLength ?? base.padLength, 3, 8),
    resetPeriod: isResetPeriod(patch.resetPeriod) ? patch.resetPeriod : base.resetPeriod,
    startFrom: clampInt(patch.startFrom ?? base.startFrom ?? 1, 1, 999999),
  };
}

export function mergeNumberingSettings(raw?: unknown): TenantNumberingSettings {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const tax = obj.taxInvoice && typeof obj.taxInvoice === 'object' ? obj.taxInvoice : {};
  const cn = obj.creditNote && typeof obj.creditNote === 'object' ? obj.creditNote : {};
  return {
    taxInvoice: mergeDocumentNumberingConfig(DEFAULT_TAX_INVOICE_NUMBERING, tax as Partial<DocumentNumberingConfig>),
    creditNote: mergeDocumentNumberingConfig(DEFAULT_CREDIT_NOTE_NUMBERING, cn as Partial<DocumentNumberingConfig>),
  };
}

export function mergeLedgerSettings(raw?: unknown): LedgerSettings {
  const obj = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const bankFeedUrl =
    typeof obj.bankFeedUrl === 'string' && obj.bankFeedUrl.trim()
      ? obj.bankFeedUrl.trim()
      : undefined;
  return {
    autoPostSales: obj.autoPostSales !== false,
    autoPostCreditNotes: obj.autoPostCreditNotes !== false,
    seedAccountsOnFirstSale: obj.seedAccountsOnFirstSale !== false,
    autoPostCollections: obj.autoPostCollections !== false,
    autoPostPayables: obj.autoPostPayables !== false,
    ...(bankFeedUrl ? { bankFeedUrl } : {}),
  };
}

export function formatDocumentNumber(
  config: DocumentNumberingConfig,
  opts: { seq: number; date?: Date },
): string {
  const date = opts.date ?? new Date();
  const fy = getIndianFinancialYear(date);
  const seq = String(opts.seq).padStart(config.padLength, '0');
  const prefix = sanitizePrefix(config.prefix);

  return config.pattern
    .replace(/\{PREFIX\}/g, prefix)
    .replace(/\{FY\}/g, fy.shortKey)
    .replace(/\{YEAR\}/g, String(date.getFullYear()))
    .replace(/\{MONTH\}/g, String(date.getMonth() + 1).padStart(2, '0'))
    .replace(/\{SEQ\}/g, seq);
}

export function previewNextDocumentNumber(
  config: DocumentNumberingConfig,
  currentSeq: number,
  date = new Date(),
): string {
  const next = currentSeq > 0 ? currentSeq + 1 : config.startFrom ?? 1;
  return formatDocumentNumber(config, { seq: next, date });
}

export function parseTrailingSequence(invoiceNumber: string): number | null {
  const match = invoiceNumber.trim().match(/(\d+)\s*$/);
  if (!match) return null;
  const n = parseInt(match[1], 10);
  return Number.isFinite(n) ? n : null;
}

export function describeResetPeriod(period: NumberResetPeriod): string {
  switch (period) {
    case 'financial_year':
      return 'Resets every Indian financial year (1 Apr – 31 Mar)';
    case 'calendar_year':
      return 'Resets every calendar year (1 Jan)';
    case 'month':
      return 'Resets every month';
    default:
      return 'Continuous sequence — never resets';
  }
}

function sanitizePrefix(prefix: string): string {
  return String(prefix || 'INV')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 12) || 'INV';
}

function isResetPeriod(v: unknown): v is NumberResetPeriod {
  return v === 'financial_year' || v === 'calendar_year' || v === 'month' || v === 'never';
}

function clampInt(n: number, min: number, max: number): number {
  const v = Math.floor(Number(n));
  if (!Number.isFinite(v)) return min;
  return Math.min(max, Math.max(min, v));
}
