'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart as RBarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { apiWithAuth } from '@/lib/helpers';
import { formatINR } from '@retail-sarathi/ui';
import { parseError } from './dashboard-ui';
import { ChartCard, chartColors, type BarDatum } from './charts';
import { ExportDropdown, fetchAndApplyExport, type ExportFormat } from './export-dropdown';
import { readPref, writePref } from './chart-prefs';

type TrendPoint = { key: string; label: string; from: string; to: string; revenue: number; invoices: number };
type Granularity = 'week' | 'month' | 'year';
type ChartType = 'bar' | 'line' | 'area';
type Row = { label: string; actual?: number; forecast?: number; compare?: number; raw?: TrendPoint };

const GRANULARITIES: Array<{ id: Granularity; label: string; count: number }> = [
  { id: 'week', label: 'Weekly', count: 8 },
  { id: 'month', label: 'Monthly', count: 6 },
  { id: 'year', label: 'Yearly', count: 5 },
];
const CHART_TYPES: Array<{ id: ChartType; label: string }> = [
  { id: 'bar', label: 'Bar' },
  { id: 'line', label: 'Line' },
  { id: 'area', label: 'Area' },
];
const COMPARE_COLOR = '#94a3b8'; // slate-400 — deliberately muted, never competes with the main series

// Shared across every RevenueTrendCard instance (Dashboard + Analytics) so the choice stays
// consistent app-wide, not just within one page's session.
const GRANULARITY_STORAGE_KEY = 'rs_revenue_trend_granularity';
const CHART_TYPE_STORAGE_KEY = 'rs_revenue_trend_chart_type';
const COMPARE_STORAGE_KEY = 'rs_revenue_trend_compare';

function toggleClass(active: boolean) {
  return active
    ? 'bg-slate-900 text-white'
    : 'bg-slate-100 text-slate-600 hover:bg-slate-200';
}

function abbreviate(n: number) {
  if (!Number.isFinite(n)) return '0';
  if (n >= 10000000) return `${(n / 10000000).toFixed(1)}Cr`;
  if (n >= 100000) return `${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(Math.round(n));
}

function RowTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Row }> }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const isForecast = row.forecast != null && row.actual == null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-slate-800">
        {row.label} {isForecast ? <span className="font-normal text-slate-400">· Projected</span> : null}
      </p>
      {row.actual != null ? <p className="text-slate-600">{formatINR(row.actual)}</p> : null}
      {row.forecast != null && isForecast ? <p className="text-slate-400">{formatINR(row.forecast)}</p> : null}
      {row.compare != null ? <p className="text-slate-400">Previous period: {formatINR(row.compare)}</p> : null}
    </div>
  );
}

/**
 * Revenue trend widget: bar/line/area toggle, weekly/monthly/yearly granularity, an optional
 * "compare to previous period" overlay, and a always-on 2-step forward forecast (dashed/muted —
 * see AnalyticsService.projectRevenueGrowth for the method, deliberately not a claim of ML
 * accuracy). Fetches its own data since granularity changes what's on the x-axis entirely, not
 * just how existing data is filtered.
 */
export function RevenueTrendCard({
  onPointClick,
  exportPath,
}: {
  onPointClick?: (point: { label: string; from: string; to: string }) => void;
  exportPath?: string;
}) {
  // Rendered with fixed defaults on the first (server + client) pass to avoid a hydration
  // mismatch, then synced from localStorage right after mount — the fetch effect below waits
  // for that sync so it never fires twice (once with the default, once with the real pref).
  const [granularity, setGranularityState] = useState<Granularity>('month');
  const [chartType, setChartTypeState] = useState<ChartType>('bar');
  const [compare, setCompareState] = useState(false);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [points, setPoints] = useState<TrendPoint[]>([]);
  const [comparePoints, setComparePoints] = useState<TrendPoint[]>([]);
  const [forecastPoints, setForecastPoints] = useState<TrendPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);
  const [exportNote, setExportNote] = useState('');

  useEffect(() => {
    setGranularityState(readPref(GRANULARITY_STORAGE_KEY, ['week', 'month', 'year'] as const, 'month'));
    setChartTypeState(readPref(CHART_TYPE_STORAGE_KEY, ['bar', 'line', 'area'] as const, 'bar'));
    setCompareState(readPref(COMPARE_STORAGE_KEY, ['on', 'off'] as const, 'off') === 'on');
    setPrefsLoaded(true);
  }, []);

  function setGranularity(next: Granularity) {
    setGranularityState(next);
    writePref(GRANULARITY_STORAGE_KEY, next);
  }

  function setChartType(next: ChartType) {
    setChartTypeState(next);
    writePref(CHART_TYPE_STORAGE_KEY, next);
  }

  function setCompare(next: boolean) {
    setCompareState(next);
    writePref(COMPARE_STORAGE_KEY, next ? 'on' : 'off');
  }

  useEffect(() => {
    if (!prefsLoaded) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError('');
      try {
        const count = GRANULARITIES.find((g) => g.id === granularity)?.count ?? 6;
        const res = await apiWithAuth<{ points: TrendPoint[]; comparePoints?: TrendPoint[]; forecast?: TrendPoint[] }>(
          `/analytics/revenue-trend?granularity=${granularity}&count=${count}&forecast=2&compare=${compare}`,
        );
        if (cancelled) return;
        setPoints(Array.isArray(res.points) ? res.points : []);
        setComparePoints(Array.isArray(res.comparePoints) ? res.comparePoints : []);
        setForecastPoints(Array.isArray(res.forecast) ? res.forecast : []);
      } catch (e) {
        if (!cancelled) setError(parseError(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [granularity, compare, prefsLoaded]);

  async function handleExport(format: ExportFormat) {
    if (!exportPath) return;
    setExporting(true);
    setError('');
    try {
      const note = await fetchAndApplyExport(exportPath, format);
      setExportNote(note);
    } catch (e) {
      setError(parseError(e));
    } finally {
      setExporting(false);
    }
  }

  const rows: Row[] = useMemo(() => {
    const base: Row[] = points.map((p, i) => ({
      label: p.label,
      actual: p.revenue,
      compare: compare ? comparePoints[i]?.revenue : undefined,
      raw: p,
    }));
    if (!forecastPoints.length) return base;
    // For line/area, duplicate the last actual value into the forecast series so the dashed
    // continuation visually connects instead of floating disconnected from the solid line.
    if (chartType !== 'bar' && base.length) {
      base[base.length - 1] = { ...base[base.length - 1]!, forecast: base[base.length - 1]!.actual };
    }
    return [...base, ...forecastPoints.map((f) => ({ label: f.label, forecast: f.revenue }))];
  }, [points, comparePoints, forecastPoints, compare, chartType]);

  const colors = chartColors.COLORS;

  function actualDot(dotProps: { cx?: number; cy?: number; payload?: Row; index?: number }, radius: number) {
    const { cx, cy, payload, index } = dotProps;
    if (payload?.actual == null) return <circle key={index} r={0} cx={cx} cy={cy} />; // forecast-only row on this series — nothing to draw
    return (
      <circle
        key={index}
        cx={cx}
        cy={cy}
        r={radius}
        fill={colors[0]}
        style={onPointClick ? { cursor: 'pointer' } : undefined}
        onClick={onPointClick && payload.raw ? () => onPointClick(payload.raw!) : undefined}
      />
    );
  }

  return (
    <ChartCard
      title="Revenue trend"
      subtitle={GRANULARITIES.find((g) => g.id === granularity)?.label}
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex gap-1 rounded-full bg-slate-100 p-0.5">
            {GRANULARITIES.map((g) => (
              <button
                key={g.id}
                type="button"
                onClick={() => setGranularity(g.id)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${toggleClass(granularity === g.id)}`}
              >
                {g.label}
              </button>
            ))}
          </div>
          <div className="flex gap-1 rounded-full bg-slate-100 p-0.5">
            {CHART_TYPES.map((t) => (
              <button
                key={t.id}
                type="button"
                aria-label={`${t.label} chart`}
                onClick={() => setChartType(t.id)}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${toggleClass(chartType === t.id)}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setCompare(!compare)}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${toggleClass(compare)}`}
          >
            Compare to previous
          </button>
          {exportPath ? <ExportDropdown exporting={exporting} onExport={(f) => void handleExport(f)} /> : null}
        </div>
      }
    >
      {error ? <p className="mb-2 text-xs text-red-600">{error}</p> : null}
      {exportNote ? <p className="mb-2 text-xs text-emerald-600">{exportNote}</p> : null}
      {loading ? (
        <p className="py-8 text-center text-sm text-slate-500">Loading…</p>
      ) : !rows.length ? (
        <p className="py-8 text-center text-sm text-slate-500">No data for this period</p>
      ) : (
        <>
          <div className="rounded-xl border border-slate-100 px-2 pb-2 pt-4" style={{ background: '#f8fafc' }}>
            <ResponsiveContainer width="100%" height={240}>
              {chartType === 'bar' ? (
                <RBarChart data={rows} margin={{ top: 8, right: 12, left: 12, bottom: 4 }} barCategoryGap="24%">
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                  <YAxis hide domain={[0, (max: number) => max * 1.15]} />
                  <Tooltip cursor={{ fill: 'rgba(15,23,42,0.04)' }} content={<RowTooltip />} />
                  {compare ? <Bar dataKey="compare" fill={COMPARE_COLOR} radius={[6, 6, 0, 0]} maxBarSize={44} /> : null}
                  <Bar
                    dataKey="actual"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={44}
                    cursor={onPointClick ? 'pointer' : undefined}
                    onClick={
                      onPointClick
                        ? (entry: { payload?: Row }) => entry.payload?.raw && onPointClick(entry.payload.raw)
                        : undefined
                    }
                  >
                    {rows.map((_, i) => (
                      <Cell key={i} fill={colors[i % colors.length]} />
                    ))}
                  </Bar>
                  <Bar dataKey="forecast" radius={[6, 6, 0, 0]} maxBarSize={44} fill={colors[0]} fillOpacity={0.3} stroke={colors[0]} strokeDasharray="4 3" />
                </RBarChart>
              ) : chartType === 'line' ? (
                <LineChart data={rows} margin={{ top: 16, right: 16, left: 12, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                  <YAxis hide domain={[0, (max: number) => max * 1.15]} />
                  <Tooltip cursor={{ stroke: '#cbd5e1' }} content={<RowTooltip />} />
                  {compare ? (
                    <Line type="monotone" dataKey="compare" stroke={COMPARE_COLOR} strokeWidth={2} strokeDasharray="4 3" dot={{ r: 3, fill: COMPARE_COLOR }} />
                  ) : null}
                  <Line
                    type="monotone"
                    dataKey="actual"
                    stroke={colors[0]}
                    strokeWidth={2.5}
                    dot={(p: { cx?: number; cy?: number; payload?: Row; index?: number }) => actualDot(p, 4)}
                    activeDot={(p: { cx?: number; cy?: number; payload?: Row; index?: number }) => actualDot(p, 6)}
                    connectNulls={false}
                  />
                  <Line type="monotone" dataKey="forecast" stroke={colors[0]} strokeWidth={2.5} strokeDasharray="6 4" dot={{ r: 4, fill: colors[0], fillOpacity: 0.5 }} connectNulls />
                </LineChart>
              ) : (
                <AreaChart data={rows} margin={{ top: 16, right: 16, left: 12, bottom: 4 }}>
                  <defs>
                    <linearGradient id="revenue-trend-area-fill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={colors[0]} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={colors[0]} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
                  <YAxis hide domain={[0, (max: number) => max * 1.15]} />
                  <Tooltip cursor={{ stroke: '#cbd5e1' }} content={<RowTooltip />} />
                  {compare ? (
                    <Area type="monotone" dataKey="compare" stroke={COMPARE_COLOR} strokeWidth={2} strokeDasharray="4 3" fill="transparent" />
                  ) : null}
                  <Area
                    type="monotone"
                    dataKey="actual"
                    stroke={colors[0]}
                    strokeWidth={2.5}
                    fill="url(#revenue-trend-area-fill)"
                    dot={(p: { cx?: number; cy?: number; payload?: Row; index?: number }) => actualDot(p, 4)}
                    activeDot={(p: { cx?: number; cy?: number; payload?: Row; index?: number }) => actualDot(p, 6)}
                    connectNulls={false}
                  />
                  <Area type="monotone" dataKey="forecast" stroke={colors[0]} strokeWidth={2.5} strokeDasharray="6 4" fill="url(#revenue-trend-area-fill)" fillOpacity={0.5} connectNulls />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </div>
          {forecastPoints.length ? (
            <p className="mt-2 text-xs text-slate-400">
              Dashed segment is a projected estimate based on the recent trend — not a guarantee.
            </p>
          ) : null}
        </>
      )}
    </ChartCard>
  );
}
