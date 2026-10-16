'use client';

import { useEffect, useState } from 'react';
import { Card, formatINR } from '@retail-sarathi/ui';
import { apiWithAuth } from '@/lib/helpers';
import { HorizontalBarList } from './charts';
import { tableCellClassName, tableHeaderClassName } from './dashboard-ui';

type SalespersonRow = { userId: string; name: string; role: string; revenue: number; invoiceCount: number };

/** Staff revenue leaderboard — surfaces the already-built `/analytics/salesperson` endpoint, which
    had no frontend consumer anywhere in the app before this. Mirrors the page's own Margin-by-SKU
    section shape (ranked bar list + full table) rather than inventing a new layout. */
export function SalespersonPerformanceCard({ rangeQuery, rangeLabel }: { rangeQuery: string; rangeLabel: string }) {
  const [rows, setRows] = useState<SalespersonRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const res = await apiWithAuth<SalespersonRow[]>(`/analytics/salesperson?${rangeQuery}`);
        if (!cancelled) setRows(Array.isArray(res) ? res : []);
      } catch {
        if (!cancelled) setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rangeQuery]);

  return (
    <Card className="overflow-x-auto border-slate-200 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-lg font-semibold">Salesperson performance ({rangeLabel.toLowerCase()})</h3>
      </div>
      {loading ? (
        <p className="py-6 text-center text-sm text-slate-500">Loading…</p>
      ) : (
        <>
          <div className="mb-4">
            <HorizontalBarList data={rows.slice(0, 8).map((r) => ({ label: r.name, value: r.revenue }))} />
          </div>
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                <th className={tableHeaderClassName}>Staff</th>
                <th className={tableHeaderClassName}>Role</th>
                <th className={tableHeaderClassName}>Revenue</th>
                <th className={tableHeaderClassName}>Invoices</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((r) => (
                  <tr key={r.userId}>
                    <td className={tableCellClassName}>{r.name}</td>
                    <td className={tableCellClassName}>{r.role}</td>
                    <td className={tableCellClassName}>{formatINR(r.revenue)}</td>
                    <td className={tableCellClassName}>{r.invoiceCount}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">
                    No sales attributed to staff yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </>
      )}
    </Card>
  );
}
