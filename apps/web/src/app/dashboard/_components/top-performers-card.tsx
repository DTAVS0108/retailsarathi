'use client';

import { useEffect, useState } from 'react';
import { apiWithAuth } from '@/lib/helpers';
import { formatINR } from '@retail-sarathi/ui';
import { ChartCard, chartColors } from './charts';
import { SegmentedToggle } from './dashboard-ui';

type Performer = { id: string; name: string; revenue: number; secondaryMetric: number };
type Tab = 'products' | 'customers' | 'staff';

const TABS: Array<{ value: Tab; label: string; secondaryLabel: string }> = [
  { value: 'products', label: 'Products', secondaryLabel: 'units' },
  { value: 'customers', label: 'Customers', secondaryLabel: 'invoices' },
  { value: 'staff', label: 'Staff', secondaryLabel: 'invoices' },
];

/** "Who's winning" — top products, customers, and staff by revenue for the selected period, one
    ranked list per tab. Powered by the new /analytics/top-performers endpoint. */
export function TopPerformersCard({ days = 30 }: { days?: number }) {
  const [tab, setTab] = useState<Tab>('products');
  const [data, setData] = useState<Record<Tab, Performer[]>>({ products: [], customers: [], staff: [] });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const res = await apiWithAuth<Record<Tab, Performer[]>>(`/analytics/top-performers?days=${days}&limit=5`);
        if (!cancelled) {
          setData({
            products: Array.isArray(res.products) ? res.products : [],
            customers: Array.isArray(res.customers) ? res.customers : [],
            staff: Array.isArray(res.staff) ? res.staff : [],
          });
        }
      } catch {
        if (!cancelled) setData({ products: [], customers: [], staff: [] });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [days]);

  const rows = data[tab];
  const activeTab = TABS.find((t) => t.value === tab)!;
  const max = Math.max(1, ...rows.map((r) => r.revenue));

  return (
    <ChartCard
      title="Top performers"
      subtitle={`Last ${days} days`}
      actions={<SegmentedToggle value={tab} onChange={setTab} options={TABS.map((t) => ({ value: t.value, label: t.label }))} />}
    >
      {loading ? (
        <p className="py-6 text-center text-sm text-slate-500">Loading…</p>
      ) : !rows.length ? (
        <p className="py-6 text-center text-sm text-slate-500">No data for this period yet.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((r, i) => (
            <li key={r.id}>
              <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-2 font-medium text-slate-700">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-500">
                    {i + 1}
                  </span>
                  <span className="truncate">{r.name}</span>
                </span>
                <span className="shrink-0 whitespace-nowrap text-xs text-slate-500">
                  {formatINR(r.revenue)} · {r.secondaryMetric} {activeTab.secondaryLabel}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${Math.max(2, (r.revenue / max) * 100)}%`, backgroundColor: chartColors.COLORS[i % chartColors.COLORS.length] }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </ChartCard>
  );
}
