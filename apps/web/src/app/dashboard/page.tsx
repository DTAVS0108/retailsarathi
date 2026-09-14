'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Card } from '@retail-sarathi/ui';
import { apiWithAuth, fmtINR } from '@/lib/helpers';
import {
  MessageBanner,
  ModuleLinkCard,
  PageHeader,
  StatCard,
  parseError,
} from './_components/dashboard-ui';
import { NAV_SECTIONS } from './_components/nav-sections';
import { NavIcon } from './_components/nav-icons';
import { BarChart, ChartCard, DonutChart, HorizontalBarList } from './_components/charts';

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

type Salesperson = Array<{ name?: string; userName?: string; revenue: number; invoiceCount: number }>;

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [monthly, setMonthly] = useState<Monthly | null>(null);
  const [sales, setSales] = useState<SaleLedger | null>(null);
  const [stock, setStock] = useState<StockFlow | null>(null);
  const [reps, setReps] = useState<Salesperson>([]);
  const [error, setError] = useState('');

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
          apiWithAuth<Salesperson>('/analytics/salesperson?days=30'),
        ]);

        if (settled[0].status === 'fulfilled') setMonthly(settled[0].value);
        if (settled[1].status === 'fulfilled') setSales(settled[1].value);
        if (settled[2].status === 'fulfilled') setStock(settled[2].value);
        if (settled[3].status === 'fulfilled') {
          const people = settled[3].value;
          setReps(Array.isArray(people) ? people.slice(0, 6) : []);
        }

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

  const cards = stats
    ? [
        { label: "Today's Revenue", value: fmtINR(stats.todayRevenue), hint: 'Finalized invoices today', href: '/dashboard/invoices?status=FINALIZED' },
        { label: "Today's Invoices", value: String(stats.todayInvoices), hint: 'Bills generated today', href: '/dashboard/invoices' },
        { label: 'Products', value: String(stats.totalProducts), hint: 'Active catalog items', href: '/dashboard/products' },
        { label: 'Low Stock Items', value: String(stats.lowStockCount), hint: 'Needs restocking soon', href: '/dashboard/products?filter=low' },
        { label: 'Open Repairs', value: String(stats.openRepairs), hint: 'Jobs still in progress', href: '/dashboard/repairs' },
        { label: 'Customers', value: String(stats.totalCustomers), hint: 'Tracked customers in CRM', href: '/dashboard/customers' },
      ]
    : [];

  const monthBars =
    monthly?.months.map((m) => ({
      label: m.label.replace(/ \d{4}$/, ''),
      value: m.revenue,
      secondary: m.invoices * (monthly.summary.avgMonthlyRevenue / Math.max(monthly.summary.totalRevenue / 6, 1) / 50),
    })) ?? [];

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

  const repBars = reps.map((r) => ({
    label: String(r.name ?? r.userName ?? 'Staff'),
    value: Number(r.revenue ?? 0),
  }));

  return (
    <div className="space-y-8 p-4 sm:p-6 lg:p-8">
      <PageHeader
        title="Overview"
        description="Live shop stats and trends — revenue, payments, stock movement, and staff."
        actions={
          <Link
            href="/dashboard/pos"
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-teal-200 bg-teal-50 px-4 text-sm font-semibold text-brand transition hover:bg-teal-100"
          >
            Open POS
          </Link>
        }
      />

      {error ? <MessageBanner tone="error">{error}</MessageBanner> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {cards.length
          ? cards.map((card) => (
              <StatCard
                key={card.label}
                label={card.label}
                value={card.value}
                hint={card.hint}
                href={card.href}
              />
            ))
          : Array.from({ length: 6 }).map((_, index) => (
              <Card key={index} className="border-slate-200">
                <div className="animate-pulse space-y-3">
                  <div className="h-4 w-28 rounded bg-slate-200" />
                  <div className="h-8 w-36 rounded bg-slate-200" />
                </div>
              </Card>
            ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <ChartCard
          title="Revenue by month"
          subtitle={
            monthly
              ? `6 months · best ${monthly.summary.bestMonth ?? '—'} · avg ${fmtINR(monthly.summary.avgMonthlyRevenue)}`
              : 'Loading…'
          }
        >
          <BarChart data={monthBars} />
        </ChartCard>
        <ChartCard title="Payment mix (30 days)" subtitle="How customers paid">
          <DonutChart data={paymentDonut} />
        </ChartCard>
        <ChartCard title="Stock movements (30 days)" subtitle="By ledger type (qty absolute)">
          <HorizontalBarList data={stockBars} valueFormat={(n) => `${Math.round(n)} units`} />
        </ChartCard>
        <ChartCard title="Staff sales (30 days)" subtitle="Top performers">
          {repBars.length ? (
            <HorizontalBarList data={repBars} />
          ) : (
            <p className="py-8 text-center text-sm text-slate-500">No salesperson data yet</p>
          )}
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
        <ChartCard title="Sales volume" subtitle="Invoices per month">
          <BarChart
            data={(monthly?.months ?? []).map((m) => ({
              label: m.label.replace(/ \d{4}$/, ''),
              value: m.invoices,
            }))}
            valueFormat={(n) => `${Math.round(n)} bills`}
          />
        </ChartCard>
      </section>

      <div className="flex justify-end">
        <Link href="/dashboard/analytics" className="text-sm font-medium text-teal-700 underline">
          Open full analytics →
        </Link>
      </div>

      {NAV_SECTIONS.map((section) => (
        <section key={section.id} className="space-y-4">
          <div className="flex items-start gap-3 border-b border-slate-200 pb-3">
            <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-brand">
              <NavIcon name={section.icon} className="h-5 w-5" />
            </span>
            <div className="min-w-0 space-y-1">
              <h2 className="text-xl font-semibold text-slate-900">{section.title}</h2>
              <p className="text-sm text-slate-500">{section.description}</p>
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {section.items.map((item) => (
              <ModuleLinkCard
                key={item.href}
                href={item.href}
                title={item.label}
                description={item.description ?? section.description}
                icon={item.icon}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
