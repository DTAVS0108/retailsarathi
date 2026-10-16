'use client';

import Link from 'next/link';
import { Area, AreaChart, ResponsiveContainer } from 'recharts';
import { Card } from '@retail-sarathi/ui';
import { DeltaChip } from './dashboard-ui';
import { NavIcon } from './nav-icons';

const TONE_CLASSES: Record<string, string> = {
  teal: 'bg-teal-50 text-teal-700',
  indigo: 'bg-indigo-50 text-indigo-700',
  sky: 'bg-sky-50 text-sky-700',
  violet: 'bg-violet-50 text-violet-700',
  amber: 'bg-amber-50 text-amber-700',
  emerald: 'bg-emerald-50 text-emerald-700',
  rose: 'bg-rose-50 text-rose-700',
};

// A left accent bar + a sparkline that matches the icon's tone, instead of every card defaulting
// to the same blue — small touch, but it's the difference between a wall of identical white cards
// and a set of cards that each read as their own thing at a glance.
const ACCENT_BAR_CLASSES: Record<string, string> = {
  teal: 'bg-teal-400',
  indigo: 'bg-indigo-400',
  sky: 'bg-sky-400',
  violet: 'bg-violet-400',
  amber: 'bg-amber-400',
  emerald: 'bg-emerald-400',
  rose: 'bg-rose-400',
};
const TONE_HEX: Record<string, string> = {
  teal: '#0d9488',
  indigo: '#4f46e5',
  sky: '#0284c7',
  violet: '#7c3aed',
  amber: '#d97706',
  emerald: '#059669',
  rose: '#e11d48',
};

/**
 * The enterprise-dashboard stat-card look: an icon chip (same soft-tinted-background language as
 * ModuleLinkCard/StatCardWithDelta elsewhere in the app — not a plain text-only card), a compact
 * embedded trend line, a period-over-period delta badge, and the value/hint. Kept as its own
 * component rather than extending StatCard, since StatCard is used across many pages that don't
 * have (or need) this data.
 */
export function KpiCard({
  label,
  value,
  hint,
  delta,
  invert,
  sparklineData,
  href,
  icon,
  tone = 'teal',
}: {
  label: string;
  value: string;
  hint?: string;
  delta?: number | null;
  invert?: boolean;
  sparklineData?: Array<{ value: number }>;
  href?: string;
  icon?: string;
  tone?: keyof typeof TONE_CLASSES;
}) {
  const color = TONE_HEX[tone] ?? TONE_HEX.teal;
  const gradientId = `kpi-spark-${label.replace(/\s+/g, '-')}`;
  const content = (
    <div className="space-y-3 p-1">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-3">
          {icon ? (
            <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${TONE_CLASSES[tone]}`}>
              <NavIcon name={icon} className="h-5 w-5" />
            </span>
          ) : null}
          <p className="text-sm font-medium text-rs-muted">{label}</p>
        </div>
        {sparklineData && sparklineData.length > 1 ? (
          <div className="h-9 w-16 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={sparklineData} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.35} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone"
                  dataKey="value"
                  stroke={color}
                  strokeWidth={1.75}
                  fill={`url(#${gradientId})`}
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        ) : null}
      </div>
      <p className="break-words text-2xl font-semibold leading-tight tracking-tight text-rs-ink sm:text-3xl">{value}</p>
      <div className="flex items-center justify-between gap-2">
        {hint ? <p className="text-xs text-rs-muted">{hint}</p> : <span />}
        {delta !== undefined ? <DeltaChip value={delta} invert={invert} /> : null}
      </div>
    </div>
  );

  const accentBar = <span className={`absolute inset-y-0 left-0 w-1 ${ACCENT_BAR_CLASSES[tone] ?? ACCENT_BAR_CLASSES.teal}`} />;

  if (href) {
    return (
      <Link href={href} className="group relative block overflow-hidden rounded-xl transition hover:-translate-y-0.5">
        {accentBar}
        <Card className="border-rs-border group-hover:border-brand group-hover:shadow-md">{content}</Card>
      </Link>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-xl">
      {accentBar}
      <Card className="border-rs-border">{content}</Card>
    </div>
  );
}
