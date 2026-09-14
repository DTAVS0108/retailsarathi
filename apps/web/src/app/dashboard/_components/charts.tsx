'use client';

import type { ReactNode } from 'react';
import { formatINR } from '@retail-sarathi/ui';

const TEAL = '#0f766e';
const AMBER = '#d97706';
const SLATE = '#64748b';
const COLORS = ['#0f766e', '#d97706', '#2563eb', '#db2777', '#7c3aed', '#059669', '#ea580c'];

export type BarDatum = { label: string; value: number; secondary?: number };

function toFiniteNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'bigint') return Number(value);
  if (typeof value === 'string') {
    return Number(value.replace(/,/g, '').trim());
  }
  if (value != null && typeof value === 'object') {
    const maybe = value as { toNumber?: () => number; toString?: () => string };
    if (typeof maybe.toNumber === 'function') {
      const n = maybe.toNumber();
      if (Number.isFinite(n)) return n;
    }
    if (typeof maybe.toString === 'function') {
      const n = Number(maybe.toString());
      if (Number.isFinite(n)) return n;
    }
  }
  return Number.NaN;
}

/** Normalize chart points — accepts label/value or method/amount (sale-ledger). */
export function toBarData(
  rows: Array<Partial<BarDatum> & { method?: string; amount?: number | string }> | null | undefined,
): BarDatum[] {
  const list = Array.isArray(rows) ? rows : [];
  const merged = new Map<string, BarDatum>();
  for (const row of list) {
    if (!row || typeof row !== 'object') continue;
    const label = String(row.label ?? row.method ?? '').trim();
    const value = toFiniteNumber(row.value ?? row.amount);
    if (!label || !Number.isFinite(value) || value <= 0) continue;
    const existing = merged.get(label);
    if (existing) {
      existing.value += value;
      if (row.secondary != null) {
        const sec = toFiniteNumber(row.secondary);
        if (Number.isFinite(sec)) {
          existing.secondary = (existing.secondary ?? 0) + sec;
        }
      }
    } else {
      const secondary = row.secondary != null ? toFiniteNumber(row.secondary) : undefined;
      merged.set(label, {
        label,
        value,
        secondary: secondary != null && Number.isFinite(secondary) ? secondary : undefined,
      });
    }
  }
  return [...merged.values()];
}

export function BarChart({
  data,
  height = 200,
  valueFormat = (n: number) => formatINR(n),
  showSecondary = false,
  secondaryLabel,
}: {
  data: BarDatum[];
  height?: number;
  valueFormat?: (n: number) => string;
  showSecondary?: boolean;
  secondaryLabel?: string;
}) {
  const points = Array.isArray(data) ? data : [];
  const max = Math.max(
    1,
    ...points.map((d) => Math.max(toFiniteNumber(d.value) || 0, toFiniteNumber(d.secondary) || 0)),
  );
  if (!points.length) {
    return <p className="py-8 text-center text-sm text-slate-500">No data for this period</p>;
  }
  return (
    <div className="space-y-3">
      <div className="flex items-end gap-2" style={{ height }}>
        {points.map((d, i) => {
          const value = toFiniteNumber(d.value) || 0;
          const secondary = d.secondary != null ? toFiniteNumber(d.secondary) || 0 : null;
          const h = Math.max(4, (value / max) * (height - 28));
          const h2 = secondary != null ? Math.max(4, (secondary / max) * (height - 28)) : 0;
          return (
            <div key={`bar-${i}`} className="flex min-w-0 flex-1 flex-col items-center justify-end gap-1">
              <span className="truncate text-[10px] font-medium text-slate-600" title={valueFormat(value)}>
                {value > 0 ? abbreviate(value) : ''}
              </span>
              <div className="flex w-full items-end justify-center gap-0.5" style={{ height: height - 28 }}>
                <div
                  className="w-full max-w-[28px] rounded-t-md bg-teal-600 transition-all"
                  style={{ height: h }}
                  title={valueFormat(value)}
                />
                {showSecondary && secondary != null ? (
                  <div
                    className="w-full max-w-[28px] rounded-t-md bg-amber-500/80 transition-all"
                    style={{ height: h2 }}
                    title={
                      secondaryLabel ? `${secondaryLabel}: ${valueFormat(secondary)}` : valueFormat(secondary)
                    }
                  />
                ) : null}
              </div>
              <span className="w-full truncate text-center text-[10px] text-slate-500">{d.label}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function HorizontalBarList({
  data,
  valueFormat = (n: number) => formatINR(n),
}: {
  data: Array<Partial<BarDatum> & { method?: string; amount?: number | string }>;
  valueFormat?: (n: number) => string;
}) {
  const points = toBarData(data);
  const rows =
    points.length > 0
      ? points
      : (Array.isArray(data) ? data : [])
          .map((d, i) => ({
            label: String(d.label ?? d.method ?? `Item ${i + 1}`).trim() || `Item ${i + 1}`,
            value: toFiniteNumber(d.value ?? d.amount) || 0,
          }))
          .filter((d) => d.label && Number.isFinite(d.value));
  const max = Math.max(1, ...rows.map((d) => d.value));
  if (!rows.length) {
    return <p className="py-6 text-center text-sm text-slate-500">No data</p>;
  }
  return (
    <ul className="space-y-3">
      {rows.map((d, i) => (
        <li key={`hbar-${i}`}>
          <div className="mb-1 flex items-center justify-between gap-2 text-xs">
            <span className="truncate font-medium text-slate-700">{d.label}</span>
            <span className="shrink-0 text-slate-500">{valueFormat(d.value)}</span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${Math.max(2, (d.value / max) * 100)}%`,
                backgroundColor: COLORS[i % COLORS.length],
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function DonutChart({
  data,
  size = 160,
  valueFormat = (n: number) => formatINR(n),
}: {
  data: Array<Partial<BarDatum> & { method?: string; amount?: number | string }> | null | undefined;
  size?: number;
  valueFormat?: (n: number) => string;
}) {
  const points = toBarData(data);
  const total = points.reduce((s, d) => s + d.value, 0);
  if (!points.length || !Number.isFinite(total) || total <= 0) {
    return <p className="py-8 text-center text-sm text-slate-500">No payment mix yet</p>;
  }

  let cursor = 0;
  const stops: string[] = [];
  const legend = points.map((d, i) => {
    const pct = (d.value / total) * 100;
    const start = cursor;
    const end = cursor + pct;
    cursor = end;
    const color = COLORS[i % COLORS.length];
    stops.push(`${color} ${start.toFixed(3)}% ${end.toFixed(3)}%`);
    return {
      id: `pay-${i}`,
      label: d.label,
      value: d.value,
      color,
      pct: Math.round(pct),
    };
  });

  const hole = Math.round(size * 0.58);
  const gradient = `conic-gradient(from -90deg, ${stops.join(', ')})`;

  return (
    <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
      <div
        className="relative shrink-0 rounded-full"
        style={{ width: size, height: size, background: gradient }}
        role="img"
        aria-label={`Payment mix total ${abbreviate(total)}`}
      >
        <div
          className="absolute inset-0 m-auto flex flex-col items-center justify-center rounded-full bg-white"
          style={{ width: hole, height: hole }}
        >
          <span className="text-[10px] text-slate-500">Total</span>
          <span className="text-xs font-semibold text-slate-800">{abbreviate(total)}</span>
        </div>
      </div>
      <ul className="w-full space-y-2 text-sm">
        {legend.map((item) => (
          <li key={item.id} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 truncate">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: item.color }} />
              {item.label}
            </span>
            <span className="shrink-0 text-slate-600">
              {valueFormat(item.value)} · {item.pct}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ChartCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        {subtitle ? <p className="text-xs text-slate-500">{subtitle}</p> : null}
      </div>
      {children}
    </div>
  );
}

function abbreviate(n: number) {
  if (!Number.isFinite(n)) return '0';
  if (n >= 10000000) return `${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000) return `${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

export const chartColors = { TEAL, AMBER, SLATE, COLORS };
