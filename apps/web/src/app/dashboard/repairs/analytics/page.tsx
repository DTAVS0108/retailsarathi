'use client';
import { AppLoader } from '@/app/_components/app-loader';

import { useMemo, useEffect, useState } from 'react';
import { Card, formatINR } from '@retail-sarathi/ui';
import { apiWithAuth } from '@/lib/helpers';
import { pageShellClassName,
  DeltaChip,
  EmptyState,
  MessageBanner,
  PageHeader,
  parseError,
  SegmentedToggle,
  tableCellClassName,
  tableHeaderClassName,
} from '../../_components/dashboard-ui';
import { BarOrLineChart, ChartCard, DonutChart } from '../../_components/charts';
import { readPref, writePref } from '../../_components/chart-prefs';

interface RepairAnalytics {
  periodDays: number;
  totalDelivered: number;
  avgTurnaroundDays: number;
  totalRevenue: number;
  loanerUsageRate: number;
  previousPeriod: { totalDelivered: number; avgTurnaroundDays: number; totalRevenue: number };
  deltas: { totalDelivered: number | null; totalRevenue: number | null; avgTurnaroundDays: number | null };
  trend: Array<{ label: string; jobCount: number; revenue: number }>;
  byServiceType: Array<{ name: string; jobCount: number; avgTurnaroundDays: number; revenue: number }>;
  byTechnician: Array<{ name: string; jobCount: number; avgTurnaroundDays: number; revenue: number }>;
}

const STAT_ICONS = {
  delivered: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-5 w-5">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  ),
  turnaround: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-5 w-5">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </svg>
  ),
  revenue: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-5 w-5">
      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  ),
  loaner: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" className="h-5 w-5">
      <rect x="7" y="2" width="10" height="20" rx="2" />
      <path d="M11 18h2" />
    </svg>
  ),
};

const STAT_COLORS = {
  teal: { bg: 'bg-teal-50', fg: 'text-teal-700' },
  indigo: { bg: 'bg-indigo-50', fg: 'text-indigo-700' },
  emerald: { bg: 'bg-emerald-50', fg: 'text-emerald-700' },
  amber: { bg: 'bg-amber-50', fg: 'text-amber-700' },
};

function StatCardWithDelta({
  label,
  value,
  hint,
  delta,
  invert,
  icon,
  color,
}: {
  label: string;
  value: string;
  hint?: string;
  delta?: number | null;
  invert?: boolean;
  icon: keyof typeof STAT_ICONS;
  color: keyof typeof STAT_COLORS;
}) {
  const palette = STAT_COLORS[color];
  return (
    <Card className="border-rs-border">
      <div className="space-y-3 p-1">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-rs-muted">{label}</p>
          <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${palette.bg} ${palette.fg}`}>
            {STAT_ICONS[icon]}
          </span>
        </div>
        <p className="text-2xl font-semibold tracking-tight text-rs-ink sm:text-3xl">{value}</p>
        <div className="flex items-center justify-between gap-2">
          {hint ? <p className="text-xs text-rs-muted">{hint}</p> : <span />}
          {delta !== undefined ? <DeltaChip value={delta} invert={invert} /> : null}
        </div>
      </div>
    </Card>
  );
}

const TREND_METRIC_KEY = 'rs_repair_trend_metric';
const TREND_CHART_TYPE_KEY = 'rs_repair_trend_chart_type';
const COMPOSITION_BY_KEY = 'rs_repair_composition_by';
const COMPOSITION_METRIC_KEY = 'rs_repair_composition_metric';

export default function RepairAnalyticsPage() {
  const [data, setData] = useState<RepairAnalytics | null>(null);
  const [days, setDays] = useState('90');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [trendMetric, setTrendMetricState] = useState<'jobs' | 'revenue'>('revenue');
  const [trendChartType, setTrendChartTypeState] = useState<'bar' | 'line'>('bar');
  const [compositionBy, setCompositionByState] = useState<'service' | 'technician'>('service');
  const [compositionMetric, setCompositionMetricState] = useState<'revenue' | 'jobs'>('revenue');

  // Rendered with fixed defaults on first paint (avoids a hydration mismatch), then synced from
  // localStorage right after mount — same pattern as RevenueTrendCard, shared via chart-prefs.
  useEffect(() => {
    setTrendMetricState(readPref(TREND_METRIC_KEY, ['jobs', 'revenue'] as const, 'revenue'));
    setTrendChartTypeState(readPref(TREND_CHART_TYPE_KEY, ['bar', 'line'] as const, 'bar'));
    setCompositionByState(readPref(COMPOSITION_BY_KEY, ['service', 'technician'] as const, 'service'));
    setCompositionMetricState(readPref(COMPOSITION_METRIC_KEY, ['revenue', 'jobs'] as const, 'revenue'));
  }, []);

  function setTrendMetric(next: 'jobs' | 'revenue') {
    setTrendMetricState(next);
    writePref(TREND_METRIC_KEY, next);
  }

  function setTrendChartType(next: 'bar' | 'line') {
    setTrendChartTypeState(next);
    writePref(TREND_CHART_TYPE_KEY, next);
  }

  function setCompositionBy(next: 'service' | 'technician') {
    setCompositionByState(next);
    writePref(COMPOSITION_BY_KEY, next);
  }

  function setCompositionMetric(next: 'revenue' | 'jobs') {
    setCompositionMetricState(next);
    writePref(COMPOSITION_METRIC_KEY, next);
  }

  async function load(period = days) {
    try {
      setLoading(true);
      setError('');
      setData(await apiWithAuth<RepairAnalytics>(`/analytics/repairs?days=${period}`));
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const compositionRows = useMemo(() => {
    if (!data) return [];
    const source = compositionBy === 'service' ? data.byServiceType : data.byTechnician;
    return source.map((row) => ({
      label: row.name,
      value: compositionMetric === 'revenue' ? row.revenue : row.jobCount,
    }));
  }, [data, compositionBy, compositionMetric]);

  return (
    <div className={pageShellClassName}>
      <PageHeader
        title="Repair Analytics"
        description="Turnaround time, technician throughput, and revenue for completed repairs."
      />

      {error ? <MessageBanner tone="error">{error}</MessageBanner> : null}

      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-slate-600">Period:</span>
        {['30', '90', '180'].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => {
              setDays(d);
              void load(d);
            }}
            className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
              days === d ? 'border-teal-500 bg-teal-50 text-brand' : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            {d} days
          </button>
        ))}
      </div>

      {loading ? (
        <AppLoader label="Loading…" />
      ) : data && data.totalDelivered === 0 ? (
        <EmptyState
          title="No completed repairs in this period"
          description="Analytics fill in as jobs move to Delivered — try a longer period, or check back once repairs are completed."
        />
      ) : data ? (
        <>
          <section className="grid gap-4 md:grid-cols-4">
            <StatCardWithDelta
              label="Repairs delivered"
              value={String(data.totalDelivered)}
              hint={`Last ${data.periodDays} days`}
              delta={data.deltas.totalDelivered}
              icon="delivered"
              color="teal"
            />
            <StatCardWithDelta
              label="Avg turnaround"
              value={`${data.avgTurnaroundDays} days`}
              hint="Receipt to delivery"
              delta={data.deltas.avgTurnaroundDays}
              invert
              icon="turnaround"
              color="indigo"
            />
            <StatCardWithDelta
              label="Revenue from repairs"
              value={formatINR(data.totalRevenue)}
              hint="Linked invoice totals"
              delta={data.deltas.totalRevenue}
              icon="revenue"
              color="emerald"
            />
            <StatCardWithDelta
              label="Loaner usage"
              value={`${Math.round(data.loanerUsageRate * 100)}%`}
              hint="Jobs that used a loaner device"
              icon="loaner"
              color="amber"
            />
          </section>

          <section className="grid gap-4 lg:grid-cols-2">
            <ChartCard title="Trend" subtitle="Weekly volume or revenue over the selected period">
              <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
                <SegmentedToggle
                  value={trendMetric}
                  onChange={setTrendMetric}
                  options={[
                    { value: 'revenue', label: 'Revenue' },
                    { value: 'jobs', label: 'Jobs' },
                  ]}
                />
                <SegmentedToggle
                  value={trendChartType}
                  onChange={setTrendChartType}
                  options={[
                    { value: 'bar', label: 'Bar' },
                    { value: 'line', label: 'Line' },
                  ]}
                />
              </div>
              <BarOrLineChart
                height={220}
                chartType={trendChartType}
                data={data.trend.map((w) => ({
                  label: w.label,
                  value: trendMetric === 'revenue' ? w.revenue : w.jobCount,
                }))}
                valueFormat={trendMetric === 'revenue' ? (n) => formatINR(n) : (n) => `${n} job${n === 1 ? '' : 's'}`}
              />
            </ChartCard>

            <ChartCard title="Composition" subtitle="Share of revenue or job volume by service or technician">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <SegmentedToggle
                  value={compositionBy}
                  onChange={setCompositionBy}
                  options={[
                    { value: 'service', label: 'By service' },
                    { value: 'technician', label: 'By technician' },
                  ]}
                />
                <SegmentedToggle
                  value={compositionMetric}
                  onChange={setCompositionMetric}
                  options={[
                    { value: 'revenue', label: 'Revenue' },
                    { value: 'jobs', label: 'Jobs' },
                  ]}
                />
              </div>
              <DonutChart
                data={compositionRows}
                valueFormat={compositionMetric === 'revenue' ? (n) => formatINR(n) : (n) => `${n} job${n === 1 ? '' : 's'}`}
              />
            </ChartCard>
          </section>

          <ChartCard title="By service type" subtitle="Volume, speed, and revenue per service">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead>
                  <tr>
                    <th className={tableHeaderClassName}>Service</th>
                    <th className={tableHeaderClassName}>Jobs</th>
                    <th className={tableHeaderClassName}>Avg turnaround</th>
                    <th className={tableHeaderClassName}>Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.byServiceType.map((s) => (
                    <tr key={s.name}>
                      <td className={tableCellClassName}>{s.name}</td>
                      <td className={tableCellClassName}>{s.jobCount}</td>
                      <td className={tableCellClassName}>{s.avgTurnaroundDays} days</td>
                      <td className={tableCellClassName}>{formatINR(s.revenue)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </ChartCard>

          <ChartCard title="By technician" subtitle="Throughput, speed, and revenue per technician">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead>
                  <tr>
                    <th className={tableHeaderClassName}>Technician</th>
                    <th className={tableHeaderClassName}>Jobs delivered</th>
                    <th className={tableHeaderClassName}>Avg turnaround</th>
                    <th className={tableHeaderClassName}>Revenue</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.byTechnician.length ? (
                    data.byTechnician.map((t) => (
                      <tr key={t.name}>
                        <td className={tableCellClassName}>{t.name}</td>
                        <td className={tableCellClassName}>{t.jobCount}</td>
                        <td className={tableCellClassName}>{t.avgTurnaroundDays} days</td>
                        <td className={tableCellClassName}>{formatINR(t.revenue)}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">
                        No technician-assigned jobs delivered in this period.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </ChartCard>
        </>
      ) : null}
    </div>
  );
}
