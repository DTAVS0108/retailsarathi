import { getIndianFinancialYear, getPeriodDateRange } from '@retail-sarathi/gst-engine';

export type ReportPeriod = {
  from: Date;
  to: Date;
  label: string;
  fyKey: string | null;
  quarter: number | null;
};

/** Parse FY keys like `2025-2026`, `2025-26`, `25-26`. */
export function parseFyKey(fy: string): { startYear: number; endYear: number; key: string } | null {
  const raw = fy.trim();
  const full = raw.match(/^(\d{4})-(\d{4})$/);
  if (full) {
    const startYear = Number(full[1]);
    const endYear = Number(full[2]);
    if (endYear !== startYear + 1) return null;
    return { startYear, endYear, key: `${startYear}-${endYear}` };
  }
  const short = raw.match(/^(\d{2,4})-(\d{2})$/);
  if (short) {
    let startYear = Number(short[1]);
    if (startYear < 100) startYear += 2000;
    const endYear = startYear + 1;
    const endShort = Number(short[2]);
    if (endShort !== endYear % 100) return null;
    return { startYear, endYear, key: `${startYear}-${endYear}` };
  }
  return null;
}

export function fyDateRange(startYear: number): { from: Date; to: Date } {
  return {
    from: new Date(startYear, 3, 1, 0, 0, 0, 0),
    to: new Date(startYear + 1, 2, 31, 23, 59, 59, 999),
  };
}

/** Indian FY quarters: Q1 Apr–Jun … Q4 Jan–Mar. */
export function quarterDateRange(
  startYear: number,
  quarter: number,
): { from: Date; to: Date; label: string } {
  if (![1, 2, 3, 4].includes(quarter)) {
    throw new Error('quarter must be 1–4 (Indian FY)');
  }
  const ranges: Record<number, { fromM: number; fromD: number; toYOffset: number; toM: number; toD: number; short: string }> = {
    1: { fromM: 3, fromD: 1, toYOffset: 0, toM: 5, toD: 30, short: 'Apr–Jun' },
    2: { fromM: 6, fromD: 1, toYOffset: 0, toM: 8, toD: 30, short: 'Jul–Sep' },
    3: { fromM: 9, fromD: 1, toYOffset: 0, toM: 11, toD: 31, short: 'Oct–Dec' },
    4: { fromM: 0, fromD: 1, toYOffset: 1, toM: 2, toD: 31, short: 'Jan–Mar' },
  };
  const r = ranges[quarter];
  const fromYear = quarter === 4 ? startYear + 1 : startYear;
  const toYear = startYear + r.toYOffset;
  return {
    from: new Date(fromYear, r.fromM, r.fromD, 0, 0, 0, 0),
    to: new Date(toYear, r.toM, r.toD, 23, 59, 59, 999),
    label: `Q${quarter} ${r.short}`,
  };
}

/**
 * Resolve report window from `quarter`(+`fy`) | `fy` | `from`/`to` | `days` | default current Indian FY.
 */
export function resolveReportPeriod(opts: {
  from?: string;
  to?: string;
  fy?: string;
  days?: number;
  quarter?: number;
}): ReportPeriod {
  const quarterRaw = opts.quarter != null ? Number(opts.quarter) : undefined;
  const hasQuarter = quarterRaw != null && Number.isFinite(quarterRaw);

  if (hasQuarter) {
    const q = quarterRaw!;
    if (![1, 2, 3, 4].includes(q)) {
      throw new Error('quarter must be 1, 2, 3, or 4');
    }
    const parsed = opts.fy?.trim()
      ? parseFyKey(opts.fy)
      : (() => {
          const fy = getIndianFinancialYear();
          return { startYear: fy.startYear, endYear: fy.endYear, key: fy.key };
        })();
    if (!parsed) {
      throw new Error(`Invalid fy "${opts.fy}". Use 2025-2026 or 25-26.`);
    }
    const range = quarterDateRange(parsed.startYear, q);
    return {
      from: range.from,
      to: range.to,
      label: `FY ${parsed.startYear}–${String(parsed.endYear).slice(-2)} ${range.label}`,
      fyKey: parsed.key,
      quarter: q,
    };
  }

  if (opts.fy?.trim()) {
    const parsed = parseFyKey(opts.fy);
    if (!parsed) {
      throw new Error(`Invalid fy "${opts.fy}". Use 2025-2026 or 25-26.`);
    }
    const range = fyDateRange(parsed.startYear);
    return {
      ...range,
      label: `FY ${parsed.startYear}–${String(parsed.endYear).slice(-2)}`,
      fyKey: parsed.key,
      quarter: null,
    };
  }

  if (opts.from || opts.to) {
    const from = opts.from ? startOfDay(new Date(opts.from)) : new Date(0);
    const to = opts.to ? endOfDay(new Date(opts.to)) : endOfDay(new Date());
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
      throw new Error('Invalid from/to date');
    }
    return {
      from,
      to,
      label: `${fmtDate(from)} – ${fmtDate(to)}`,
      fyKey: null,
      quarter: null,
    };
  }

  if (opts.days && opts.days > 0) {
    const to = endOfDay(new Date());
    const from = startOfDay(new Date(Date.now() - (opts.days - 1) * 86400000));
    return {
      from,
      to,
      label: `Last ${opts.days} days`,
      fyKey: null,
      quarter: null,
    };
  }

  const fy = getIndianFinancialYear();
  const range = getPeriodDateRange('financial_year');
  if (!range) {
    const fallback = fyDateRange(fy.startYear);
    return { ...fallback, label: fy.label, fyKey: fy.key, quarter: null };
  }
  return { from: range.from, to: range.to, label: fy.label, fyKey: fy.key, quarter: null };
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0);
}

export function endOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

export function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function slugPeriod(period: ReportPeriod): string {
  if (period.fyKey && period.quarter) return `FY${period.fyKey}_Q${period.quarter}`;
  if (period.fyKey) return `FY${period.fyKey}`;
  const a = period.from.toISOString().slice(0, 10);
  const b = period.to.toISOString().slice(0, 10);
  return `${a}_to_${b}`;
}
