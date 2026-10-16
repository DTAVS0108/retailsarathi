'use client';
import { AppLoader } from '@/app/_components/app-loader';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button, Card, formatINR } from '@retail-sarathi/ui';
import { apiWithAuth } from '@/lib/helpers';
import { pageShellClassName,
  inputClassName,
  MessageBanner,
  PageHeader,
  parseError,
  tableCellClassName,
  tableHeaderClassName,
  toNumber,
} from '../_components/dashboard-ui';
import { BarChart, ChartCard, DonutChart, HorizontalBarList, RevenueTreemap, type BarDatum } from '../_components/charts';
import { ExportDropdown, fetchAndApplyExport, type ExportFormat } from '../_components/export-dropdown';
import { DrilldownModal, type DrilldownColumn } from '../_components/drilldown-modal';
import { RevenueTrendCard } from '../_components/revenue-trend-card';
import { KpiCard } from '../_components/kpi-card';
import { PeakHoursHeatmap } from '../_components/peak-hours-heatmap';
import { TopPerformersCard } from '../_components/top-performers-card';
import { SalespersonPerformanceCard } from '../_components/salesperson-performance-card';
import { ExecutiveOverview, type ExecutiveSummary } from '../_components/executive-overview';
import { ServiceForecastCard } from '../_components/service-forecast-card';

async function settled<T>(promise: Promise<T>, fallback: T): Promise<{ data: T; error?: string }> {
  try {
    return { data: await promise };
  } catch (err) {
    return { data: fallback, error: parseError(err) };
  }
}

const DAY_PRESETS: Array<{ id: number; label: string }> = [
  { id: 7, label: '7 days' },
  { id: 30, label: '30 days' },
  { id: 90, label: '90 days' },
  { id: 365, label: '1 year' },
];

function chipClass(active: boolean) {
  return active
    ? 'bg-slate-900 text-white'
    : 'bg-slate-100 text-slate-600 hover:bg-slate-200';
}

export default function AnalyticsPage() {
  const [overview, setOverview] = useState<Record<string, unknown> | null>(null);
  const [abc, setAbc] = useState<Array<Record<string, unknown>>>([]);
  const [deadStock, setDeadStock] = useState<Array<Record<string, unknown>>>([]);
  const [margins, setMargins] = useState<Array<Record<string, unknown>>>([]);
  const [sales, setSales] = useState<{
    summary: { byPayment: Array<{ method: string; amount: number }> };
    entries: Array<Record<string, unknown>>;
  } | null>(null);
  const [stock, setStock] = useState<{
    byType: Array<{ type: string; qtyIn: number; qtyOut: number }>;
    recent: Array<Record<string, unknown>>;
  } | null>(null);
  const [kpiTrend, setKpiTrend] = useState<{
    weeks: Array<{ label: string; retailRevenue: number; repairRevenue: number; totalRevenue: number; invoiceCount: number }>;
  } | null>(null);
  const [peakHours, setPeakHours] = useState<{
    grid: Array<{ day: number; hour: number; revenue: number; invoiceCount: number }>;
  } | null>(null);
  const [executiveSummary, setExecutiveSummary] = useState<ExecutiveSummary | null>(null);
  const [drilldown, setDrilldown] = useState<{
    title: string;
    subtitle?: string;
    columns: DrilldownColumn[];
    rows: Array<Record<string, unknown>>;
  } | null>(null);
  const [drilldownLoading, setDrilldownLoading] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshingAbc, setRefreshingAbc] = useState(false);
  const [abcRefreshNote, setAbcRefreshNote] = useState('');
  const [exportingKey, setExportingKey] = useState<string | null>(null);
  const [exportNote, setExportNote] = useState('');

  const [rangeDays, setRangeDays] = useState<number>(30);
  const [customRange, setCustomRange] = useState(false);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  const rangeQuery =
    customRange && customFrom && customTo
      ? `from=${customFrom}&to=${customTo}`
      : `days=${rangeDays}`;
  const rangeLabel =
    customRange && customFrom && customTo ? `${customFrom} → ${customTo}` : `Last ${rangeDays} days`;

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError('');
      const [ov, abcRes, dead, margin, sale, flow, kpi, peak, execSummary] = await Promise.all([
        settled<Record<string, unknown> | null>(
          apiWithAuth<Record<string, unknown>>(`/analytics/overview?${rangeQuery}`),
          null,
        ),
        settled(apiWithAuth<Array<Record<string, unknown>>>(`/analytics/abc?${rangeQuery}`), []),
        settled(apiWithAuth<Array<Record<string, unknown>>>(`/analytics/dead-stock?${rangeQuery}`), []),
        settled(apiWithAuth<Array<Record<string, unknown>>>(`/analytics/margin-by-sku?${rangeQuery}`), []),
        settled(
          apiWithAuth<{
            summary: { byPayment: Array<{ method: string; amount: number }> };
            entries: Array<Record<string, unknown>>;
          }>(`/analytics/sale-ledger?${rangeQuery}`),
          { summary: { byPayment: [] }, entries: [] },
        ),
        settled(
          apiWithAuth<{
            byType: Array<{ type: string; qtyIn: number; qtyOut: number }>;
            recent: Array<Record<string, unknown>>;
          }>(`/analytics/stock-flow?${rangeQuery}`),
          { byType: [], recent: [] },
        ),
        settled(
          apiWithAuth<{
            weeks: Array<{ label: string; retailRevenue: number; repairRevenue: number; totalRevenue: number; invoiceCount: number }>;
          }>('/analytics/kpi-trend?weeks=8'),
          { weeks: [] },
        ),
        settled(
          apiWithAuth<{ grid: Array<{ day: number; hour: number; revenue: number; invoiceCount: number }> }>(
            `/analytics/peak-hours?${rangeQuery}`,
          ),
          { grid: [] },
        ),
        settled<ExecutiveSummary | null>(apiWithAuth<ExecutiveSummary>(`/analytics/executive-summary?${rangeQuery}`), null),
      ]);

      setOverview(ov.data);
      setAbc(Array.isArray(abcRes.data) ? abcRes.data.slice(0, 15) : []);
      setDeadStock(Array.isArray(dead.data) ? dead.data.slice(0, 10) : []);
      setMargins(Array.isArray(margin.data) ? margin.data.slice(0, 15) : []);
      setSales(sale.data);
      setStock(flow.data);
      setKpiTrend(kpi.data);
      setPeakHours(peak.data);
      setExecutiveSummary(execSummary.data);

      const failures = [ov, abcRes, dead, margin, sale, flow]
        .map((r) => r.error)
        .filter(Boolean) as string[];
      if (failures.length === 6) {
        setError(failures[0] || 'Internal Server Error');
      } else if (failures.length) {
        setError(`Some charts failed to load: ${failures[0]}`);
      }
      setLoading(false);
    })();
  }, [rangeQuery]);

  const gradeBars = ['A', 'B', 'C'].map((g) => ({
    label: `Grade ${g}`,
    value: abc.filter((r) => String(r.grade) === g).length,
    raw: g,
  }));

  async function handleExport(key: string, path: string, format: ExportFormat) {
    setExportingKey(key);
    setError('');
    setExportNote('');
    try {
      const note = await fetchAndApplyExport(path, format);
      setExportNote(note);
    } catch (e) {
      setError(parseError(e));
    } finally {
      setExportingKey(null);
    }
  }

  function handleGradeClick(datum: BarDatum) {
    const grade = String(datum.raw ?? '');
    setDrilldown({
      title: `Grade ${grade} SKUs`,
      subtitle: `${abc.filter((r) => String(r.grade) === grade).length} product(s)`,
      columns: [
        { key: 'name', label: 'Product' },
        { key: 'revenue', label: 'Revenue', format: 'currency' },
        { key: 'qty', label: 'Qty', format: 'number' },
      ],
      rows: abc.filter((r) => String(r.grade) === grade),
    });
  }

  function handleStockTypeClick(datum: BarDatum) {
    const rawType = String(datum.raw ?? '');
    const rows = (stock?.recent ?? []).filter((m) => String(m.type) === rawType);
    setDrilldown({
      title: `Stock movements — ${rawType.replace(/_/g, ' ')}`,
      subtitle: rangeLabel,
      columns: [
        { key: 'createdAt', label: 'Date', format: 'date' },
        { key: 'productName', label: 'Product' },
        { key: 'quantity', label: 'Qty', format: 'number' },
        { key: 'notes', label: 'Notes' },
      ],
      rows,
    });
  }

  function handlePaymentClick(datum: BarDatum) {
    const method = String(datum.raw ?? datum.label);
    const rows = (sales?.entries ?? []).filter(
      (e) => Array.isArray(e.payments) && e.payments.some((p: { method?: string }) => p?.method === method),
    );
    setDrilldown({
      title: `Invoices paid via ${method}`,
      subtitle: rangeLabel,
      columns: [
        { key: 'invoiceNumber', label: 'Invoice #' },
        { key: 'customerName', label: 'Customer' },
        { key: 'amount', label: 'Amount', format: 'currency' },
      ],
      rows,
    });
  }

  async function handleTrendPointClick(point: { label: string; from: string; to: string }) {
    const from = point.from.slice(0, 10);
    const to = new Date(new Date(point.to).getTime() - 86400000).toISOString().slice(0, 10); // `to` is exclusive
    setDrilldown({
      title: `Invoices — ${point.label}`,
      subtitle: `${from} → ${to}`,
      columns: [
        { key: 'invoiceNumber', label: 'Invoice #' },
        { key: 'customerName', label: 'Customer' },
        { key: 'amount', label: 'Amount', format: 'currency' },
      ],
      rows: [],
    });
    setDrilldownLoading(true);
    try {
      const res = await apiWithAuth<{ entries: Array<Record<string, unknown>> }>(
        `/analytics/sale-ledger?from=${from}&to=${to}`,
      );
      setDrilldown((prev) => (prev ? { ...prev, rows: res.entries ?? [] } : prev));
    } catch (e) {
      setError(parseError(e));
    } finally {
      setDrilldownLoading(false);
    }
  }

  async function refreshAbcGrades() {
    setRefreshingAbc(true);
    setAbcRefreshNote('');
    setError('');
    try {
      const result = await apiWithAuth<{ updated?: number; message?: string }>('/analytics/abc/refresh', {
        method: 'POST',
      });
      setAbcRefreshNote(result.message ?? `Refreshed ${result.updated ?? 0} SKU grade(s).`);
      const fresh = await apiWithAuth<Array<Record<string, unknown>>>('/analytics/abc');
      setAbc(Array.isArray(fresh) ? fresh.slice(0, 15) : []);
    } catch (e) {
      setError(parseError(e));
    } finally {
      setRefreshingAbc(false);
    }
  }

  return (
    <div className={pageShellClassName}>
      <PageHeader
        title="Analytics"
        description="Charts for revenue, payments, stock, ABC grades — plus tables for SKU detail."
        actions={
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" disabled={refreshingAbc} onClick={() => void refreshAbcGrades()}>
              {refreshingAbc ? 'Refreshing…' : 'Refresh ABC grades'}
            </Button>
            <Link href="/dashboard/stock-take">
              <Button type="button" variant="secondary">
                Start cycle count
              </Button>
            </Link>
          </div>
        }
      />
      <Card className="border-slate-200 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-sm font-medium text-slate-600">Date range:</span>
          <div className="flex flex-wrap gap-2">
            {DAY_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => {
                  setCustomRange(false);
                  setRangeDays(p.id);
                }}
                className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${chipClass(!customRange && rangeDays === p.id)}`}
              >
                {p.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setCustomRange(true)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition ${chipClass(customRange)}`}
            >
              Custom
            </button>
          </div>
          {customRange ? (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="date"
                className={inputClassName}
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
              />
              <span className="text-sm text-slate-400">to</span>
              <input
                type="date"
                className={inputClassName}
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
              />
            </div>
          ) : null}
        </div>
      </Card>
      {abcRefreshNote ? <MessageBanner tone="success">{abcRefreshNote}</MessageBanner> : null}
      {exportNote ? <MessageBanner tone="success">{exportNote}</MessageBanner> : null}
      {error ? <MessageBanner tone="error">{error}</MessageBanner> : null}
      {loading ? <AppLoader label="Loading analytics…" /> : null}
      {overview ? (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {(() => {
            const deltas = (overview.deltas ?? {}) as Record<string, number | null>;
            const weeks = kpiTrend?.weeks ?? [];
            const spark = (key: 'retailRevenue' | 'repairRevenue' | 'totalRevenue' | 'invoiceCount') =>
              weeks.map((w) => ({ value: w[key] }));
            return (
              <>
                <KpiCard
                  label="Retail revenue"
                  value={formatINR(toNumber(overview.retailRevenue))}
                  hint={rangeLabel}
                  delta={deltas.retailRevenue}
                  sparklineData={spark('retailRevenue')}
                />
                <KpiCard
                  label="Repair revenue"
                  value={formatINR(toNumber(overview.repairRevenue))}
                  hint={rangeLabel}
                  delta={deltas.repairRevenue}
                  sparklineData={spark('repairRevenue')}
                />
                <KpiCard
                  label="Total revenue"
                  value={formatINR(toNumber(overview.totalRevenue))}
                  hint={rangeLabel}
                  delta={deltas.totalRevenue}
                  sparklineData={spark('totalRevenue')}
                />
                <KpiCard
                  label="Invoices"
                  value={String(overview.invoiceCount ?? 0)}
                  hint={rangeLabel}
                  delta={deltas.invoiceCount}
                  sparklineData={spark('invoiceCount')}
                />
              </>
            );
          })()}
        </section>
      ) : null}

      {executiveSummary ? (
        <ExecutiveOverview
          rangeLabel={rangeLabel}
          byBranch={
            Array.isArray(overview?.byBranch)
              ? (overview!.byBranch as Array<{ name: string; revenue: number }>)
              : []
          }
          summary={executiveSummary}
        />
      ) : null}

      <section className="grid gap-4 xl:grid-cols-2">
        <RevenueTrendCard onPointClick={(p) => void handleTrendPointClick(p)} exportPath="/analytics/monthly?months=6" />
        <ChartCard title="Payment mix" subtitle={rangeLabel}>
          <DonutChart
            data={Array.isArray(sales?.summary?.byPayment) ? sales.summary.byPayment : []}
            onSegmentClick={handlePaymentClick}
          />
        </ChartCard>
        <ChartCard
          title="Stock flow by type"
          subtitle={`In + out quantity · ${rangeLabel}`}
          actions={
            <ExportDropdown
              exporting={exportingKey === 'stock-flow'}
              onExport={(f) => void handleExport('stock-flow', `/analytics/stock-flow?${rangeQuery}`, f)}
            />
          }
        >
          <HorizontalBarList
            data={(stock?.byType ?? []).map((t) => ({
              label: t.type.replace(/_/g, ' '),
              value: Math.abs(t.qtyIn) + Math.abs(t.qtyOut),
              raw: t.type,
            }))}
            valueFormat={(n) => `${Math.round(n)} units`}
            onItemClick={handleStockTypeClick}
          />
        </ChartCard>
        <ChartCard title="ABC grade mix" subtitle="SKU count by grade">
          <BarChart
            data={gradeBars}
            valueFormat={(n) => `${n} SKUs`}
            height={160}
            onBarClick={handleGradeClick}
          />
        </ChartCard>
      </section>

      <ServiceForecastCard />

      <section className="grid gap-4 xl:grid-cols-2">
        <Card className="overflow-x-auto border-slate-200 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-semibold">ABC analysis (top SKUs)</h3>
            <ExportDropdown
              exporting={exportingKey === 'abc'}
              onExport={(f) => void handleExport('abc', `/analytics/abc?${rangeQuery}`, f)}
            />
          </div>
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                <th className={tableHeaderClassName}>Product</th>
                <th className={tableHeaderClassName}>Grade</th>
                <th className={tableHeaderClassName}>Revenue</th>
              </tr>
            </thead>
            <tbody>
              {abc.length ? (
                abc.map((r) => (
                  <tr key={String(r.productId)}>
                    <td className={tableCellClassName}>{String(r.name)}</td>
                    <td className={tableCellClassName}>{String(r.grade)}</td>
                    <td className={tableCellClassName}>{formatINR(toNumber(r.revenue))}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-sm text-slate-500">
                    No ABC data yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
        <Card className="overflow-x-auto border-slate-200 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-semibold">Dead stock (no sale in {rangeLabel.toLowerCase()})</h3>
            <ExportDropdown
              exporting={exportingKey === 'dead-stock'}
              onExport={(f) => void handleExport('dead-stock', `/analytics/dead-stock?${rangeQuery}`, f)}
            />
          </div>
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                <th className={tableHeaderClassName}>Product</th>
                <th className={tableHeaderClassName}>Qty</th>
                <th className={tableHeaderClassName}>Value</th>
              </tr>
            </thead>
            <tbody>
              {deadStock.length ? (
                deadStock.map((r) => (
                  <tr key={String(r.id)}>
                    <td className={tableCellClassName}>{String(r.name)}</td>
                    <td className={tableCellClassName}>{toNumber(r.stockQty)}</td>
                    <td className={tableCellClassName}>{formatINR(toNumber(r.valueAtCost))}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={3} className="px-4 py-8 text-center text-sm text-slate-500">
                    No dead stock in this window
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <TopPerformersCard days={rangeDays} />
        <SalespersonPerformanceCard rangeQuery={rangeQuery} rangeLabel={rangeLabel} />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Revenue share by SKU" subtitle={`Sized by revenue, colored by ABC grade · ${rangeLabel.toLowerCase()}`}>
          <RevenueTreemap data={abc.map((r) => ({ name: String(r.name), revenue: toNumber(r.revenue), grade: String(r.grade ?? '') }))} />
        </ChartCard>
        <ChartCard title="Peak hours" subtitle="When customers shop — day of week × hour">
          <PeakHoursHeatmap grid={peakHours?.grid ?? []} />
        </ChartCard>
      </section>

      <Card className="overflow-x-auto border-slate-200 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-lg font-semibold">Margin by SKU ({rangeLabel.toLowerCase()})</h3>
          <ExportDropdown
            exporting={exportingKey === 'margin'}
            onExport={(f) => void handleExport('margin', `/analytics/margin-by-sku?${rangeQuery}`, f)}
          />
        </div>
        <div className="mb-4">
          <HorizontalBarList
            data={margins.slice(0, 8).map((r) => ({
              label: String(r.name),
              value: toNumber(r.margin),
            }))}
          />
        </div>
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              <th className={tableHeaderClassName}>Product</th>
              <th className={tableHeaderClassName}>Margin</th>
              <th className={tableHeaderClassName}>%</th>
              <th className={tableHeaderClassName}>Qty sold</th>
            </tr>
          </thead>
          <tbody>
            {margins.length ? (
              margins.map((r) => (
                <tr key={String(r.productId)}>
                  <td className={tableCellClassName}>{String(r.name)}</td>
                  <td className={tableCellClassName}>{formatINR(toNumber(r.margin))}</td>
                  <td className={tableCellClassName}>{toNumber(r.marginPct)}%</td>
                  <td className={tableCellClassName}>{toNumber(r.qty)}</td>
                </tr>
              ))
            ) : (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">
                  No margin data yet
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>
      <DrilldownModal
        open={drilldown != null}
        title={drilldown?.title ?? ''}
        subtitle={drilldown?.subtitle}
        columns={drilldown?.columns ?? []}
        rows={drilldown?.rows ?? []}
        loading={drilldownLoading}
        onClose={() => setDrilldown(null)}
      />
    </div>
  );
}
