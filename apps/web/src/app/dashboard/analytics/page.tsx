'use client';
import { AppLoader } from '@/app/_components/app-loader';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button, Card, formatINR } from '@retail-sarathi/ui';
import { apiWithAuth } from '@/lib/helpers';
import { pageShellClassName,
  MessageBanner,
  PageHeader,
  StatCard,
  parseError,
  tableCellClassName,
  tableHeaderClassName,
  toNumber,
} from '../_components/dashboard-ui';
import { BarChart, ChartCard, DonutChart, HorizontalBarList } from '../_components/charts';

async function settled<T>(promise: Promise<T>, fallback: T): Promise<{ data: T; error?: string }> {
  try {
    return { data: await promise };
  } catch (err) {
    return { data: fallback, error: parseError(err) };
  }
}

export default function AnalyticsPage() {
  const [overview, setOverview] = useState<Record<string, unknown> | null>(null);
  const [abc, setAbc] = useState<Array<Record<string, unknown>>>([]);
  const [deadStock, setDeadStock] = useState<Array<Record<string, unknown>>>([]);
  const [margins, setMargins] = useState<Array<Record<string, unknown>>>([]);
  const [monthly, setMonthly] = useState<{
    months: Array<{ label: string; revenue: number; invoices: number }>;
  } | null>(null);
  const [sales, setSales] = useState<{
    summary: { byPayment: Array<{ method: string; amount: number }> };
  } | null>(null);
  const [stock, setStock] = useState<{
    byType: Array<{ type: string; qtyIn: number; qtyOut: number }>;
  } | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshingAbc, setRefreshingAbc] = useState(false);
  const [abcRefreshNote, setAbcRefreshNote] = useState('');

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError('');
      const [ov, abcRes, dead, margin, mon, sale, flow] = await Promise.all([
        settled<Record<string, unknown> | null>(
          apiWithAuth<Record<string, unknown>>('/analytics/overview'),
          null,
        ),
        settled(apiWithAuth<Array<Record<string, unknown>>>('/analytics/abc'), []),
        settled(apiWithAuth<Array<Record<string, unknown>>>('/analytics/dead-stock'), []),
        settled(apiWithAuth<Array<Record<string, unknown>>>('/analytics/margin-by-sku'), []),
        settled(
          apiWithAuth<{ months: Array<{ label: string; revenue: number; invoices: number }> }>(
            '/analytics/monthly?months=6',
          ),
          { months: [] },
        ),
        settled(
          apiWithAuth<{ summary: { byPayment: Array<{ method: string; amount: number }> } }>(
            '/analytics/sale-ledger?days=30',
          ),
          { summary: { byPayment: [] } },
        ),
        settled(
          apiWithAuth<{ byType: Array<{ type: string; qtyIn: number; qtyOut: number }> }>(
            '/analytics/stock-flow?days=30',
          ),
          { byType: [] },
        ),
      ]);

      setOverview(ov.data);
      setAbc(Array.isArray(abcRes.data) ? abcRes.data.slice(0, 15) : []);
      setDeadStock(Array.isArray(dead.data) ? dead.data.slice(0, 10) : []);
      setMargins(Array.isArray(margin.data) ? margin.data.slice(0, 15) : []);
      setMonthly(mon.data);
      setSales(sale.data);
      setStock(flow.data);

      const failures = [ov, abcRes, dead, margin, mon, sale, flow]
        .map((r) => r.error)
        .filter(Boolean) as string[];
      if (failures.length === 7) {
        setError(failures[0] || 'Internal Server Error');
      } else if (failures.length) {
        setError(`Some charts failed to load: ${failures[0]}`);
      }
      setLoading(false);
    })();
  }, []);

  const gradeBars = ['A', 'B', 'C'].map((g) => ({
    label: `Grade ${g}`,
    value: abc.filter((r) => String(r.grade) === g).length,
  }));

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
      {abcRefreshNote ? <MessageBanner tone="success">{abcRefreshNote}</MessageBanner> : null}
      {error ? <MessageBanner tone="error">{error}</MessageBanner> : null}
      {loading ? <AppLoader label="Loading analytics…" /> : null}
      {overview ? (
        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Retail revenue" value={formatINR(toNumber(overview.retailRevenue))} />
          <StatCard label="Repair revenue" value={formatINR(toNumber(overview.repairRevenue))} />
          <StatCard label="Total revenue" value={formatINR(toNumber(overview.totalRevenue))} />
          <StatCard label="Invoices" value={String(overview.invoiceCount ?? 0)} />
        </section>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-2">
        <ChartCard title="Monthly revenue" subtitle="Last 6 months">
          <BarChart
            data={(monthly?.months ?? []).map((m) => ({
              label: m.label.replace(/ \d{4}$/, ''),
              value: m.revenue,
            }))}
          />
        </ChartCard>
        <ChartCard title="Payment mix" subtitle="Last 30 days">
          <DonutChart data={Array.isArray(sales?.summary?.byPayment) ? sales.summary.byPayment : []} />
        </ChartCard>
        <ChartCard title="Stock flow by type" subtitle="In + out quantity">
          <HorizontalBarList
            data={(stock?.byType ?? []).map((t) => ({
              label: t.type.replace(/_/g, ' '),
              value: Math.abs(t.qtyIn) + Math.abs(t.qtyOut),
            }))}
            valueFormat={(n) => `${Math.round(n)} units`}
          />
        </ChartCard>
        <ChartCard title="ABC grade mix" subtitle="SKU count by grade">
          <BarChart data={gradeBars} valueFormat={(n) => `${n} SKUs`} height={160} />
        </ChartCard>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card className="overflow-x-auto border-slate-200 p-4">
          <h3 className="mb-3 text-lg font-semibold">ABC analysis (top SKUs)</h3>
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
          <h3 className="mb-3 text-lg font-semibold">Dead stock (60+ days no sale)</h3>
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
      <Card className="overflow-x-auto border-slate-200 p-4">
        <h3 className="mb-3 text-lg font-semibold">Margin by SKU (30 days)</h3>
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
    </div>
  );
}
