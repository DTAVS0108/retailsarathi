'use client';

import { Card, formatINR } from '@retail-sarathi/ui';
import { ChartCard, DonutChart, GaugeChart } from './charts';
import { tableCellClassName, tableHeaderClassName } from './dashboard-ui';

export type ExecutiveSummary = {
  stockHealthPct: number;
  activeProductCount: number;
  healthyProductCount: number;
  repairs: {
    total: number;
    delivered: number;
    cancelled: number;
    byStatus: Array<{ status: string; count: number }>;
  };
  purchaseOrders: {
    total: number;
    totalOrderedValue: number;
    byStatus: Array<{ status: string; count: number }>;
    recent: Array<{
      id: string;
      poNumber: string;
      supplierName: string;
      status: string;
      createdAt: string;
      orderedValue: number;
    }>;
  };
};

function titleCase(s: string) {
  return s
    .toLowerCase()
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/** The Analytics page's "executive" band — revenue-by-branch, repair-status mix, and a purchase-
    order status+value summary, styled to sit alongside the gauge KPI tile. Takes `byBranch` as a
    prop (already fetched by the page via `/analytics/overview`) and `summary` (already fetched by
    the page via `/analytics/executive-summary`) rather than fetching either itself, so the two
    consumers of `executive-summary` (this component and the gauge KPI tile) share one request. */
export function ExecutiveOverview({
  rangeLabel,
  byBranch,
  summary,
}: {
  rangeLabel: string;
  byBranch: Array<{ name: string; revenue: number }>;
  summary: ExecutiveSummary | null;
}) {
  if (!summary) return null;

  const repairDonutData = summary.repairs.byStatus.map((r) => ({ label: titleCase(r.status), value: r.count }));
  const poDonutData = summary.purchaseOrders.byStatus.map((p) => ({ label: titleCase(p.status), value: p.count }));

  return (
    <div className="space-y-4">
      <section className="grid gap-4 xl:grid-cols-3">
        <ChartCard title="Stock health" subtitle={`${summary.healthyProductCount} of ${summary.activeProductCount} active SKUs above threshold`}>
          <div className="flex items-center justify-center py-2">
            <GaugeChart value={summary.stockHealthPct} label="Healthy stock" size={188} />
          </div>
        </ChartCard>
        <ChartCard title="Revenue by branch" subtitle={rangeLabel}>
          <DonutChart data={byBranch.map((b) => ({ label: b.name, value: b.revenue }))} />
        </ChartCard>
        <ChartCard title="Repair jobs by status" subtitle={rangeLabel}>
          <DonutChart data={repairDonutData} valueFormat={(n) => String(n)} />
          <p className="mt-3 text-center text-sm text-slate-600">
            <span className="font-semibold text-slate-800">{summary.repairs.delivered}</span> closed ·{' '}
            <span className="font-semibold text-slate-800">{summary.repairs.cancelled}</span> cancelled
          </p>
        </ChartCard>
      </section>

      <Card className="overflow-x-auto border-slate-200 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold">Purchase orders ({rangeLabel.toLowerCase()})</h3>
            <p className="text-xs text-slate-500">
              {summary.purchaseOrders.total} orders · {formatINR(summary.purchaseOrders.totalOrderedValue)} ordered value
            </p>
          </div>
        </div>
        <div className="space-y-4">
          {/* Stacked, not side-by-side: DonutChart's circle+legend layout switches to a row from
              the 640px *viewport* breakpoint regardless of its actual container width, so forcing
              it into a narrow fixed column (as this was previously) squeezes the legend to just a
              few px wide. Giving it the full card width to lay out in avoids that entirely. */}
          <DonutChart data={poDonutData} valueFormat={(n) => String(n)} />
          <div className="min-w-0 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr>
                  <th className={tableHeaderClassName}>PO Number</th>
                  <th className={tableHeaderClassName}>Supplier</th>
                  <th className={tableHeaderClassName}>Value</th>
                  <th className={tableHeaderClassName}>Status</th>
                  <th className={tableHeaderClassName}>Date</th>
                </tr>
              </thead>
              <tbody>
                {summary.purchaseOrders.recent.length ? (
                  summary.purchaseOrders.recent.map((po) => (
                    <tr key={po.id}>
                      <td className={tableCellClassName}>{po.poNumber}</td>
                      <td className={tableCellClassName}>{po.supplierName}</td>
                      <td className={tableCellClassName}>{formatINR(po.orderedValue)}</td>
                      <td className={tableCellClassName}>{titleCase(po.status)}</td>
                      <td className={tableCellClassName}>{new Date(po.createdAt).toLocaleDateString('en-IN')}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">
                      No purchase orders in this window
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </Card>
    </div>
  );
}
