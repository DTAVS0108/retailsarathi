'use client';

import type { ReactNode } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart as RBarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Tooltip,
  Treemap,
  XAxis,
  YAxis,
} from 'recharts';
import { formatINR } from '@retail-sarathi/ui';

const TEAL = '#0f766e';
const AMBER = '#d97706';
const SLATE = '#64748b';
/**
 * Validated categorical palette (dataviz skill default) — fixed slot order, not cycled
 * arbitrarily: this exact ordering clears CVD-separation and normal-vision-floor checks on
 * every adjacent pair. Three slots (aqua/yellow/magenta) sit below 3:1 contrast on a light
 * surface by design — the "relief" requirement (direct labels/legends) is met everywhere these
 * are used, since every chart below shows a value label or legend text next to each color.
 */
const COLORS = [
  '#2a78d6', // blue
  '#eb6834', // orange
  '#1baf7a', // aqua
  '#eda100', // yellow
  '#e87ba4', // magenta
  '#008300', // green
  '#4a3aa7', // violet
  '#e34948', // red
];
const SURFACE = '#f8fafc';
const GRIDLINE = '#e2e8f0';
const MUTED = '#64748b';

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export type BarDatum = { label: string; value: number; secondary?: number; raw?: unknown };

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
        raw: row.raw ?? row.method,
      });
    }
  }
  return [...merged.values()];
}

function abbreviate(n: number) {
  if (!Number.isFinite(n)) return '0';
  if (n >= 10000000) return `${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000) return `${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

/**
 * Recharts' default category-axis tick has no truncation — a label wider than the reserved
 * axis width overflows past x=0 and gets clipped on the LEFT (cutting off the first letters),
 * since right-aligned text grows leftward. A foreignObject with real CSS text-overflow:ellipsis
 * is the only reliable single-line truncation for SVG text; the full label is still available
 * via the native title tooltip on hover.
 */
function makeTruncatedYAxisTick(maxWidth: number) {
  function YAxisTick({
    x,
    y,
    payload,
  }: {
    x?: string | number;
    y?: string | number;
    payload?: { value?: unknown };
  }) {
    const w = maxWidth - 10;
    const cx = toFiniteNumber(x) || 0;
    const cy = toFiniteNumber(y) || 0;
    const label = String(payload?.value ?? '');
    return (
      <foreignObject x={cx - w - 6} y={cy - 9} width={w} height={18}>
        <div
          title={label}
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: '#334155',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            textAlign: 'right',
            lineHeight: '18px',
          }}
        >
          {label}
        </div>
      </foreignObject>
    );
  }
  return YAxisTick;
}

function ChartTooltip({
  active,
  payload,
  valueFormat,
}: {
  active?: boolean;
  payload?: Array<{ payload: BarDatum; value?: number; name?: string }>;
  valueFormat: (n: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-slate-800">{point.label}</p>
      <p className="text-slate-500">{valueFormat(toFiniteNumber(point.value))}</p>
    </div>
  );
}

export function BarChart({
  data,
  height = 220,
  valueFormat = (n: number) => formatINR(n),
  showSecondary = false,
  secondaryLabel,
  onBarClick,
}: {
  data: BarDatum[];
  height?: number;
  valueFormat?: (n: number) => string;
  showSecondary?: boolean;
  secondaryLabel?: string;
  onBarClick?: (datum: BarDatum) => void;
}) {
  const points = Array.isArray(data) ? data : [];
  if (!points.length) {
    return <p className="py-8 text-center text-sm text-slate-500">No data for this period</p>;
  }

  return (
    <div className="rounded-xl border border-slate-100 px-2 pb-2 pt-4" style={{ background: SURFACE }}>
      <ResponsiveContainer width="100%" height={height}>
        <RBarChart data={points} margin={{ top: 8, right: 12, left: 12, bottom: 4 }} barCategoryGap="24%">
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: MUTED }}
            axisLine={{ stroke: GRIDLINE }}
            tickLine={false}
          />
          <YAxis hide domain={[0, (max: number) => max * 1.15]} />
          <Tooltip
            cursor={{ fill: 'rgba(15,23,42,0.04)' }}
            content={<ChartTooltip valueFormat={valueFormat} />}
          />
          <Bar
            dataKey="value"
            radius={[6, 6, 0, 0]}
            maxBarSize={44}
            onClick={
              onBarClick ? (entry: { payload?: BarDatum }) => entry.payload && onBarClick(entry.payload) : undefined
            }
            cursor={onBarClick ? 'pointer' : undefined}
            label={{
              position: 'top',
              fontSize: 11,
              fontWeight: 600,
              fill: '#334155',
              formatter: (v: unknown) => {
                const n = toFiniteNumber(v);
                return n > 0 ? abbreviate(n) : '';
              },
            }}
          >
            {points.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} />
            ))}
          </Bar>
          {showSecondary ? (
            <Bar
              dataKey="secondary"
              radius={[6, 6, 0, 0]}
              maxBarSize={44}
              fill={AMBER}
              name={secondaryLabel}
            />
          ) : null}
        </RBarChart>
      </ResponsiveContainer>
    </div>
  );
}

/**
 * Same data, either a colorful bar chart or a single-color trend line — the shape a viewer
 * reaches for depends on whether they want to compare discrete periods (bar) or read a
 * trajectory (line). Shared by every "toggle chart type" widget so the visual language — colors,
 * tooltip, label formatting — never drifts between them.
 */
export function BarOrLineChart({
  data,
  chartType,
  height = 220,
  valueFormat = (n: number) => formatINR(n),
  onPointClick,
}: {
  data: BarDatum[];
  chartType: 'bar' | 'line' | 'area';
  height?: number;
  valueFormat?: (n: number) => string;
  onPointClick?: (datum: BarDatum) => void;
}) {
  const points = Array.isArray(data) ? data : [];
  if (!points.length) {
    return <p className="py-8 text-center text-sm text-slate-500">No data for this period</p>;
  }

  function pointDot(dotProps: { cx?: number; cy?: number; payload?: BarDatum; index?: number }, radius: number) {
    const { cx, cy, payload, index } = dotProps;
    return (
      <circle
        key={index}
        cx={cx}
        cy={cy}
        r={radius}
        fill={COLORS[0]}
        style={onPointClick ? { cursor: 'pointer' } : undefined}
        onClick={onPointClick && payload ? () => onPointClick(payload) : undefined}
      />
    );
  }

  const labelProps = {
    position: 'top' as const,
    fontSize: 11,
    fontWeight: 600,
    fill: '#334155',
    formatter: (v: unknown) => {
      const n = toFiniteNumber(v);
      return n > 0 ? abbreviate(n) : '';
    },
  };

  return (
    <div className="rounded-xl border border-slate-100 px-2 pb-2 pt-4" style={{ background: SURFACE }}>
      <ResponsiveContainer width="100%" height={height}>
        {chartType === 'bar' ? (
          <RBarChart data={points} margin={{ top: 8, right: 12, left: 12, bottom: 4 }} barCategoryGap="24%">
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: MUTED }} axisLine={{ stroke: GRIDLINE }} tickLine={false} />
            <YAxis hide domain={[0, (max: number) => max * 1.15]} />
            <Tooltip cursor={{ fill: 'rgba(15,23,42,0.04)' }} content={<ChartTooltip valueFormat={valueFormat} />} />
            <Bar
              dataKey="value"
              radius={[6, 6, 0, 0]}
              maxBarSize={44}
              cursor={onPointClick ? 'pointer' : undefined}
              onClick={
                onPointClick
                  ? (entry: { payload?: BarDatum }) => entry.payload && onPointClick(entry.payload)
                  : undefined
              }
              label={labelProps}
            >
              {points.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Bar>
          </RBarChart>
        ) : chartType === 'line' ? (
          <LineChart data={points} margin={{ top: 16, right: 16, left: 12, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRIDLINE} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: MUTED }} axisLine={{ stroke: GRIDLINE }} tickLine={false} />
            <YAxis hide domain={[0, (max: number) => max * 1.15]} />
            <Tooltip cursor={{ stroke: '#cbd5e1' }} content={<ChartTooltip valueFormat={valueFormat} />} />
            <Line
              type="monotone"
              dataKey="value"
              stroke={COLORS[0]}
              strokeWidth={2.5}
              dot={(p: { cx?: number; cy?: number; payload?: BarDatum; index?: number }) => pointDot(p, 4)}
              activeDot={(p: { cx?: number; cy?: number; payload?: BarDatum; index?: number }) => pointDot(p, 6)}
              label={labelProps}
            />
          </LineChart>
        ) : (
          <AreaChart data={points} margin={{ top: 16, right: 16, left: 12, bottom: 4 }}>
            <defs>
              <linearGradient id="bar-or-line-area-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={COLORS[0]} stopOpacity={0.35} />
                <stop offset="100%" stopColor={COLORS[0]} stopOpacity={0.02} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={GRIDLINE} />
            <XAxis dataKey="label" tick={{ fontSize: 11, fill: MUTED }} axisLine={{ stroke: GRIDLINE }} tickLine={false} />
            <YAxis hide domain={[0, (max: number) => max * 1.15]} />
            <Tooltip cursor={{ stroke: '#cbd5e1' }} content={<ChartTooltip valueFormat={valueFormat} />} />
            <Area
              type="monotone"
              dataKey="value"
              stroke={COLORS[0]}
              strokeWidth={2.5}
              fill="url(#bar-or-line-area-fill)"
              dot={(p: { cx?: number; cy?: number; payload?: BarDatum; index?: number }) => pointDot(p, 4)}
              activeDot={(p: { cx?: number; cy?: number; payload?: BarDatum; index?: number }) => pointDot(p, 6)}
              label={labelProps}
            />
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

export function HorizontalBarList({
  data,
  valueFormat = (n: number) => formatINR(n),
  onItemClick,
}: {
  data: Array<Partial<BarDatum> & { method?: string; amount?: number | string }>;
  valueFormat?: (n: number) => string;
  onItemClick?: (datum: BarDatum) => void;
}) {
  const points = toBarData(data);
  const rows: BarDatum[] =
    points.length > 0
      ? points
      : (Array.isArray(data) ? data : [])
          .map((d, i) => ({
            label: String(d.label ?? d.method ?? `Item ${i + 1}`).trim() || `Item ${i + 1}`,
            value: toFiniteNumber(d.value ?? d.amount) || 0,
          }))
          .filter((d) => d.label && Number.isFinite(d.value));
  if (!rows.length) {
    return <p className="py-6 text-center text-sm text-slate-500">No data</p>;
  }
  const height = Math.max(120, rows.length * 40);
  const yAxisWidth = 140;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <RBarChart
        data={rows}
        layout="vertical"
        margin={{ top: 4, right: 76, left: 4, bottom: 4 }}
        barCategoryGap="28%"
      >
        <XAxis type="number" hide domain={[0, (max: number) => max * 1.12]} />
        <YAxis
          type="category"
          dataKey="label"
          width={yAxisWidth}
          tick={makeTruncatedYAxisTick(yAxisWidth)}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip cursor={{ fill: 'rgba(15,23,42,0.04)' }} content={<ChartTooltip valueFormat={valueFormat} />} />
        <Bar
          dataKey="value"
          radius={[0, 6, 6, 0]}
          barSize={12}
          onClick={
            onItemClick ? (entry: { payload?: BarDatum }) => entry.payload && onItemClick(entry.payload) : undefined
          }
          cursor={onItemClick ? 'pointer' : undefined}
          label={{
            position: 'right',
            fontSize: 10,
            fill: MUTED,
            formatter: (v: unknown) => valueFormat(toFiniteNumber(v)),
          }}
        >
          {rows.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Bar>
      </RBarChart>
    </ResponsiveContainer>
  );
}

export function DonutChart({
  data,
  size = 168,
  valueFormat = (n: number) => formatINR(n),
  onSegmentClick,
}: {
  data: Array<Partial<BarDatum> & { method?: string; amount?: number | string }> | null | undefined;
  size?: number;
  valueFormat?: (n: number) => string;
  onSegmentClick?: (datum: BarDatum) => void;
}) {
  const points = toBarData(data);
  const total = points.reduce((s, d) => s + d.value, 0);
  if (!points.length || !Number.isFinite(total) || total <= 0) {
    return <p className="py-8 text-center text-sm text-slate-500">No payment mix yet</p>;
  }

  const legend = points.map((d, i) => ({
    id: `pay-${i}`,
    label: d.label,
    value: d.value,
    color: COLORS[i % COLORS.length],
    pct: (d.value / total) * 100,
    raw: d.raw,
  }));

  return (
    <div className="flex flex-col items-center gap-6 rounded-xl border border-slate-100 p-4 sm:flex-row sm:items-center" style={{ background: SURFACE }}>
      <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`Composition total ${abbreviate(total)}`}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={points}
              dataKey="value"
              nameKey="label"
              innerRadius={size * 0.3}
              outerRadius={size * 0.48}
              paddingAngle={points.length > 1 ? 2 : 0}
              stroke={SURFACE}
              strokeWidth={2}
              onClick={
                onSegmentClick
                  ? (entry: { payload?: BarDatum } & Partial<BarDatum>) =>
                      onSegmentClick(entry.payload ?? (entry as BarDatum))
                  : undefined
              }
              cursor={onSegmentClick ? 'pointer' : undefined}
            >
              {points.map((_, i) => (
                <Cell key={i} fill={COLORS[i % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip valueFormat={valueFormat} />} />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-[10px] font-medium text-slate-400">Total</span>
          <span className="text-sm font-bold text-slate-800">{abbreviate(total)}</span>
        </div>
      </div>
      <ul className="w-full min-w-0 max-w-md space-y-3">
        {legend.map((item) => (
          <li
            key={item.id}
            className={cn(onSegmentClick && 'cursor-pointer rounded-lg hover:bg-slate-50')}
            onClick={
              onSegmentClick
                ? () => onSegmentClick({ label: item.label, value: item.value, raw: item.raw })
                : undefined
            }
            role={onSegmentClick ? 'button' : undefined}
            tabIndex={onSegmentClick ? 0 : undefined}
          >
            <div className="mb-1 flex items-center justify-between gap-3 text-sm">
              <span className="flex min-w-0 items-center gap-2 font-medium text-slate-700">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: item.color }} />
                <span className="truncate">{item.label}</span>
              </span>
              <span className="shrink-0 whitespace-nowrap text-xs font-semibold text-slate-600">
                {valueFormat(item.value)} <span className="text-slate-400">· {Math.round(item.pct)}%</span>
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-200/70">
              <div
                className="h-full rounded-full transition-all"
                style={{ width: `${Math.max(2, item.pct)}%`, backgroundColor: item.color }}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** ABC grade → one of the first 3 validated categorical slots — matches the coloring already
    used for the "ABC grade mix" bar chart elsewhere on the Analytics page, so grade A/B/C mean
    the same color everywhere, not just within this one chart. */
const GRADE_COLORS: Record<string, string> = { A: COLORS[0], B: COLORS[1], C: COLORS[2] };

type TreemapNodeProps = {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  revenue?: number;
  grade?: string;
};

function TreemapContent({ x = 0, y = 0, width = 0, height = 0, name, revenue, grade }: TreemapNodeProps) {
  const color = (grade && GRADE_COLORS[grade]) || MUTED;
  const showLabel = width > 64 && height > 32;
  const label = name && name.length > 20 ? `${name.slice(0, 18)}…` : name;
  return (
    <g>
      <rect x={x} y={y} width={width} height={height} style={{ fill: color, stroke: SURFACE, strokeWidth: 2 }} />
      {showLabel ? (
        <>
          <text x={x + 6} y={y + 16} fontSize={11} fontWeight={700} fill="#fff">
            {label}
          </text>
          <text x={x + 6} y={y + 30} fontSize={10} fill="rgba(255,255,255,0.85)">
            {formatINR(revenue ?? 0)}
          </text>
        </>
      ) : null}
    </g>
  );
}

function TreemapTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: { name: string; revenue: number; grade?: string } }>;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload;
  if (!p) return null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-slate-800">{p.name}</p>
      <p className="text-slate-500">
        {formatINR(p.revenue)}
        {p.grade ? ` · Grade ${p.grade}` : ''}
      </p>
    </div>
  );
}

/** Revenue share by SKU, sized by revenue and colored by ABC grade — a hierarchical composition
    view that a bar chart can't show at a glance (relative share, not just rank). Additive to the
    existing ABC bar+table, not a replacement. */
export function RevenueTreemap({ data }: { data: Array<{ name: string; revenue: number; grade?: string }> }) {
  const rows = (Array.isArray(data) ? data : []).filter((d) => d.revenue > 0);
  if (!rows.length) {
    return <p className="py-8 text-center text-sm text-slate-500">No revenue data for this period</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={320}>
      <Treemap data={rows} dataKey="revenue" nameKey="name" stroke={SURFACE} content={<TreemapContent />} isAnimationActive={false}>
        <Tooltip content={<TreemapTooltip />} />
      </Treemap>
    </ResponsiveContainer>
  );
}

/** A single magnitude value (0-100) as a ring gauge — one hue light-track/dark-fill per the
    dataviz skill's sequential rule, never the categorical rainbow, since this represents one
    measurement, not several identities. */
export function GaugeChart({
  value,
  label,
  sublabel,
  size = 168,
}: {
  value: number;
  label: string;
  sublabel?: string;
  size?: number;
}) {
  const pct = Math.max(0, Math.min(100, value));
  const data = [{ value: pct, fill: COLORS[0] }];
  return (
    <div
      className="relative mx-auto flex flex-col items-center justify-center rounded-xl border border-slate-100 p-4"
      style={{ background: SURFACE, width: size, height: size }}
    >
      <ResponsiveContainer width="100%" height="100%">
        <RadialBarChart
          data={data}
          startAngle={90}
          endAngle={-270}
          innerRadius="70%"
          outerRadius="100%"
          barSize={size * 0.14}
        >
          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} axisLine={false} />
          <RadialBar dataKey="value" cornerRadius={999} background={{ fill: GRIDLINE }} isAnimationActive={false} />
        </RadialBarChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-2xl font-bold text-slate-800">{Math.round(pct)}%</span>
        <span className="mt-1 max-w-[80%] text-center text-[11px] font-medium text-slate-500">{label}</span>
        {sublabel ? <span className="text-[10px] text-slate-400">{sublabel}</span> : null}
      </div>
    </div>
  );
}

export function ChartCard({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          {subtitle ? <p className="text-xs text-slate-500">{subtitle}</p> : null}
        </div>
        {actions ? <div className="shrink-0">{actions}</div> : null}
      </div>
      {children}
    </div>
  );
}

export const chartColors = { TEAL, AMBER, SLATE, COLORS };
