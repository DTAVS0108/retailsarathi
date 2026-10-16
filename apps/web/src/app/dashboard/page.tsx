'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Card, formatINR } from '@retail-sarathi/ui';
import { apiWithAuth, fmtINR } from '@/lib/helpers';
import { MessageBanner, PageHeader, parseError, toNumber } from './_components/dashboard-ui';
import { BarChart, BarOrLineChart, ChartCard, DonutChart, HorizontalBarList, RevenueTreemap } from './_components/charts';
import { RevenueTrendCard } from './_components/revenue-trend-card';
import { readPref, writePref } from './_components/chart-prefs';
import { WelcomeCard } from './_components/welcome-card';
import { DailySummaryStrip } from './_components/daily-summary-strip';
import { QuickActionsRow } from './_components/quick-actions-row';
import { KpiCard } from './_components/kpi-card';
import { AlertsFeed } from './_components/alerts-feed';
import { ActivityFeed } from './_components/activity-feed';
import { TopPerformersCard } from './_components/top-performers-card';
import { PeakHoursHeatmap } from './_components/peak-hours-heatmap';

const SALES_VOLUME_CHART_TYPE_KEY = 'rs_sales_volume_chart_type';

interface DashboardStats {
  todayRevenue: number;
  todayInvoices: number;
  totalProducts: number;
  lowStockCount: number;
  openRepairs: number;
  totalCustomers: number;
}

type Monthly = {
  months: Array<{ label: string; revenue: number; invoices: number; tax: number }>;
  summary: { totalRevenue: number; avgMonthlyRevenue: number; bestMonth: string | null };
};

type SaleLedger = {
  summary: {
    totalSales: number;
    byPayment: Array<{ method: string; amount: number }>;
  };
};

type StockFlow = {
  summary: { stockInQty: number; stockOutQty: number };
  byType: Array<{ type: string; qtyIn: number; qtyOut: number; count: number }>;
};

type KpiTrend = {
  weeks: Array<{ label: string; retailRevenue: number; repairRevenue: number; totalRevenue: number; invoiceCount: number }>;
};

type Overview = {
  retailRevenue: number;
  repairRevenue: number;
  totalRevenue: number;
  invoiceCount: number;
  deltas: { retailRevenue: number | null; repairRevenue: number | null; totalRevenue: number | null; invoiceCount: number | null };
};

type PeakHours = { grid: Array<{ day: number; hour: number; revenue: number; invoiceCount: number }> };
type AbcRow = { name: string; revenue: number; grade?: string };

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [monthly, setMonthly] = useState<Monthly | null>(null);
  const [sales, setSales] = useState<SaleLedger | null>(null);
  const [stock, setStock] = useState<StockFlow | null>(null);
  const [kpiTrend, setKpiTrend] = useState<KpiTrend | null>(null);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [peakHours, setPeakHours] = useState<PeakHours | null>(null);
  const [abc, setAbc] = useState<AbcRow[]>([]);
  const [error, setError] = useState('');
  const [salesVolumeChartType, setSalesVolumeChartTypeState] = useState<'bar' | 'line'>('bar');

  useEffect(() => {
    setSalesVolumeChartTypeState(readPref(SALES_VOLUME_CHART_TYPE_KEY, ['bar', 'line'] as const, 'bar'));
  }, []);

  function setSalesVolumeChartType(next: 'bar' | 'line') {
    setSalesVolumeChartTypeState(next);
    writePref(SALES_VOLUME_CHART_TYPE_KEY, next);
  }

  useEffect(() => {
    void (async () => {
      try {
        setError('');
        // Load core KPIs first so one analytics failure cannot blank the whole page.
        const dash = await apiWithAuth<DashboardStats>('/tenants/dashboard');
        setStats(dash);

        const settled = await Promise.allSettled([
          apiWithAuth<Monthly>('/analytics/monthly?months=6'),
          apiWithAuth<SaleLedger>('/analytics/sale-ledger?days=30'),
          apiWithAuth<StockFlow>('/analytics/stock-flow?days=30'),
          apiWithAuth<KpiTrend>('/analytics/kpi-trend?weeks=8'),
          apiWithAuth<Overview>('/analytics/overview?days=30'),
          apiWithAuth<PeakHours>('/analytics/peak-hours?days=30'),
          apiWithAuth<AbcRow[]>('/analytics/abc?days=30'),
        ]);

        if (settled[0].status === 'fulfilled') setMonthly(settled[0].value);
        if (settled[1].status === 'fulfilled') setSales(settled[1].value);
        if (settled[2].status === 'fulfilled') setStock(settled[2].value);
        if (settled[3].status === 'fulfilled') setKpiTrend(settled[3].value);
        if (settled[4].status === 'fulfilled') setOverview(settled[4].value);
        if (settled[5].status === 'fulfilled') setPeakHours(settled[5].value);
        if (settled[6].status === 'fulfilled' && Array.isArray(settled[6].value)) setAbc(settled[6].value.slice(0, 8));

        const failed = settled.filter((r) => r.status === 'rejected');
        if (failed.length === settled.length) {
          setError('Charts could not load. Core shop stats are still shown below.');
        }
      } catch (err) {
        const msg = parseError(err);
        setError(msg);
        // Stale/invalid session → force re-login instead of a blank zero dashboard.
        if (/not signed in|unauthorized|jwt|invalid token|401/i.test(msg)) {
          try {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
          } catch {
            /* ignore */
          }
          window.location.href = '/login';
          return;
        }
        setStats({
          todayRevenue: 0,
          todayInvoices: 0,
          totalProducts: 0,
          lowStockCount: 0,
          openRepairs: 0,
          totalCustomers: 0,
        });
      }
    })();
  }, []);

  const weeks = kpiTrend?.weeks ?? [];
  const spark = (key: 'retailRevenue' | 'repairRevenue' | 'totalRevenue' | 'invoiceCount') =>
    weeks.map((w) => ({ value: w[key] }));

  const paymentDonut = Array.isArray(sales?.summary?.byPayment)
    ? sales.summary.byPayment.map((p) => ({
        label: String(p.method ?? 'OTHER'),
        value: Number(p.amount) || 0,
      }))
    : [];

  const stockBars =
    stock?.byType.map((t) => ({
      label: t.type,
      value: Math.abs(t.qtyIn) + Math.abs(t.qtyOut),
    })) ?? [];

  return (
    <div className="space-y-8 p-4 sm:p-6 lg:p-8">
      <PageHeader title="Overview" description="Live shop stats and trends — revenue, payments, stock movement, and staff." />

      <WelcomeCard />
      <DailySummaryStrip />
      <QuickActionsRow />

      {error ? <MessageBanner tone="error">{error}</MessageBanner> : null}

      <section className="space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">Today</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {stats ? (
            <>
              <KpiCard
                icon="pos"
                tone="teal"
                label="Today's Revenue"
                value={fmtINR(stats.todayRevenue)}
                hint="Finalized invoices today"
                href="/dashboard/invoices?status=FINALIZED"
                sparklineData={spark('retailRevenue')}
              />
              <KpiCard
                icon="invoices"
                tone="indigo"
                label="Today's Invoices"
                value={String(stats.todayInvoices)}
                hint="Bills generated today"
                href="/dashboard/invoices"
                sparklineData={spark('invoiceCount')}
              />
              <KpiCard icon="products" tone="violet" label="Products" value={String(stats.totalProducts)} hint="Active catalog items" href="/dashboard/products" />
              <KpiCard icon="stock" tone="amber" label="Low Stock Items" value={String(stats.lowStockCount)} hint="Needs restocking soon" href="/dashboard/products?filter=low" />
              <KpiCard icon="repairs" tone="rose" label="Open Repairs" value={String(stats.openRepairs)} hint="Jobs still in progress" href="/dashboard/repairs" />
              <KpiCard icon="customers" tone="emerald" label="Customers" value={String(stats.totalCustomers)} hint="Tracked customers in CRM" href="/dashboard/customers" />
            </>
          ) : (
            Array.from({ length: 6 }).map((_, index) => (
              <Card key={index} className="border-slate-200">
                <div className="animate-pulse space-y-3">
                  <div className="h-4 w-28 rounded bg-slate-200" />
                  <div className="h-8 w-36 rounded bg-slate-200" />
                </div>
              </Card>
            ))
          )}
        </div>
      </section>

      {overview ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">This month</h2>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              icon="pos"
              tone="teal"
              label="Retail revenue"
              value={formatINR(toNumber(overview.retailRevenue))}
              delta={overview.deltas.retailRevenue}
              sparklineData={spark('retailRevenue')}
            />
            <KpiCard
              icon="repairs"
              tone="indigo"
              label="Repair revenue"
              value={formatINR(toNumber(overview.repairRevenue))}
              delta={overview.deltas.repairRevenue}
              sparklineData={spark('repairRevenue')}
            />
            <KpiCard
              icon="analytics"
              tone="violet"
              label="Total revenue"
              value={formatINR(toNumber(overview.totalRevenue))}
              delta={overview.deltas.totalRevenue}
              sparklineData={spark('totalRevenue')}
            />
            <KpiCard
              icon="invoices"
              tone="emerald"
              label="Invoices"
              value={String(overview.invoiceCount ?? 0)}
              delta={overview.deltas.invoiceCount}
              sparklineData={spark('invoiceCount')}
            />
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-2">
        <RevenueTrendCard />
        <TopPerformersCard days={30} />
        <ChartCard title="Payment mix (30 days)" subtitle="How customers paid">
          <DonutChart data={paymentDonut} />
        </ChartCard>
        <ChartCard title="Stock movements (30 days)" subtitle="By ledger type (qty absolute)">
          <HorizontalBarList data={stockBars} valueFormat={(n) => `${Math.round(n)} units`} />
        </ChartCard>
        <ChartCard title="In vs out stock" subtitle="Units · last 30 days">
          <BarChart
            data={[
              { label: 'In', value: stock?.summary.stockInQty ?? 0 },
              { label: 'Out', value: stock?.summary.stockOutQty ?? 0 },
            ]}
            valueFormat={(n) => `${Math.round(n)} units`}
          />
        </ChartCard>
        <ChartCard
          title="Sales volume"
          subtitle="Invoices per month"
          actions={
            <div className="flex gap-1 rounded-full bg-slate-100 p-0.5">
              <button
                type="button"
                onClick={() => setSalesVolumeChartType('bar')}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                  salesVolumeChartType === 'bar' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                Bar
              </button>
              <button
                type="button"
                onClick={() => setSalesVolumeChartType('line')}
                className={`rounded-full px-2.5 py-1 text-xs font-medium transition ${
                  salesVolumeChartType === 'line' ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-200'
                }`}
              >
                Line
              </button>
            </div>
          }
        >
          <BarOrLineChart
            chartType={salesVolumeChartType}
            data={(monthly?.months ?? []).map((m) => ({
              label: m.label.replace(/ \d{4}$/, ''),
              value: m.invoices,
            }))}
            valueFormat={(n) => `${Math.round(n)} bills`}
          />
        </ChartCard>
        <ChartCard title="Revenue share by SKU" subtitle="Sized by revenue, colored by ABC grade · last 30 days">
          <RevenueTreemap data={abc.map((r) => ({ name: r.name, revenue: toNumber(r.revenue), grade: r.grade }))} />
        </ChartCard>
        <ChartCard title="Peak hours" subtitle="When customers shop — day of week × hour">
          <PeakHoursHeatmap grid={peakHours?.grid ?? []} />
        </ChartCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <AlertsFeed />
        <ActivityFeed />
      </section>

      <div className="flex justify-end">
        <Link href="/dashboard/analytics" className="text-sm font-medium text-teal-700 underline">
          Open full analytics →
        </Link>
      </div>
    </div>
  );
}
