'use client';

import { useEffect, useState } from 'react';
import { Card } from '@retail-sarathi/ui';
import { apiWithAuth } from '@/lib/helpers';
import { inputClassName, parseError, toNumber } from '../../_components/dashboard-ui';
import { ChartCard, GaugeChart, BarOrLineChart } from '../../_components/charts';
import { PaginationFooter, SortHeader, stickyTheadClassName, zebraRowClassName } from './table-shared';

type ReorderRow = {
  productId: string;
  productName: string;
  dailyAverage: number;
  currentStock: number;
  stockCoverDays: number;
  suggestedReorderQty: number;
  recommendation: string;
};

type ReorderResponse = { items: ReorderRow[]; total: number; page: number; pageSize: number };

type ProductForecast = {
  productId: string;
  productName: string;
  periodDays: number;
  unitsSold: number;
  dailyAverage: number;
  currentStock: number;
  stockCoverDays: number;
  suggestedReorderQty: number;
  recommendation: string;
  series: Array<{ date: string; qty: number }>;
};

const URGENCY_STYLE: Record<string, string> = {
  REORDER_NOW: 'border-red-200 bg-red-50 text-red-800',
  REORDER_SOON: 'border-amber-200 bg-amber-50 text-amber-900',
};
const URGENCY_LABEL: Record<string, string> = {
  REORDER_NOW: 'Reorder now',
  REORDER_SOON: 'Reorder soon',
};

function StockCoverCell({ days }: { days: number }) {
  const pct = Math.max(4, Math.min(100, (days / 21) * 100));
  const color = days <= 3 ? 'bg-red-500' : days <= 7 ? 'bg-amber-500' : 'bg-teal-500';
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="whitespace-nowrap text-xs font-medium text-slate-600">{days}d</span>
    </div>
  );
}

export function ReorderTab() {
  const [rows, setRows] = useState<ReorderRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [search, setSearch] = useState('');
  const [urgency, setUrgency] = useState<'all' | 'REORDER_NOW' | 'REORDER_SOON'>('all');
  const [sortBy, setSortBy] = useState('stockCoverDays');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [forecastProductId, setForecastProductId] = useState('');
  const [forecast, setForecast] = useState<ProductForecast | null>(null);
  const [forecastLoading, setForecastLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      void (async () => {
        setLoading(true);
        setError('');
        try {
          const q = new URLSearchParams();
          q.set('page', String(page));
          q.set('pageSize', String(pageSize));
          if (search.trim()) q.set('search', search.trim());
          if (urgency !== 'all') q.set('urgency', urgency);
          q.set('sortBy', sortBy);
          q.set('sortDir', sortDir);
          const res = await apiWithAuth<ReorderResponse>(`/ai/reorder?${q.toString()}`);
          if (cancelled) return;
          setRows(res.items);
          setTotal(res.total);
          if (res.items.length && !res.items.some((r) => r.productId === forecastProductId) && page === 1) {
            setForecastProductId(res.items[0]!.productId);
          }
        } catch (err) {
          if (!cancelled) setError(parseError(err));
        } finally {
          if (!cancelled) setLoading(false);
        }
      })();
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize, search, urgency, sortBy, sortDir]);

  useEffect(() => {
    if (!forecastProductId) {
      setForecast(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      setForecastLoading(true);
      try {
        const res = await apiWithAuth<ProductForecast>(`/ai/forecast/${forecastProductId}`);
        if (!cancelled) setForecast(res);
      } catch {
        if (!cancelled) setForecast(null);
      } finally {
        if (!cancelled) setForecastLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [forecastProductId]);

  function toggleSort(field: string) {
    if (sortBy === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDir('asc');
    }
    setPage(1);
  }

  return (
    <div className="space-y-4">
      <Card className="border-slate-200">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-lg font-semibold">Reorder list</h3>
            <p className="text-xs text-slate-500">
              Recency + weekday-weighted sales average with a trend adjustment — not a predictive model.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setPage(1);
              }}
              placeholder="Search product…"
              className={`${inputClassName} w-48`}
            />
            {(['all', 'REORDER_NOW', 'REORDER_SOON'] as const).map((u) => (
              <button
                key={u}
                type="button"
                onClick={() => {
                  setUrgency(u);
                  setPage(1);
                }}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition ${
                  urgency === u ? 'bg-teal-700 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {u === 'all' ? 'All' : URGENCY_LABEL[u]}
              </button>
            ))}
          </div>
        </div>
        {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}
        {!loading && !rows.length ? (
          <p className="py-8 text-center text-sm text-slate-500">
            {search || urgency !== 'all' ? 'No products match these filters.' : 'Stock levels look healthy.'}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className={stickyTheadClassName}>
                <tr>
                  <SortHeader label="Product" field="productName" activeField={sortBy} dir={sortDir} onSort={toggleSort} className="px-4 py-2 text-left text-xs" />
                  <SortHeader label="Daily avg" field="dailyAverage" activeField={sortBy} dir={sortDir} onSort={toggleSort} className="px-4 py-2 text-left text-xs" />
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">Current stock</th>
                  <SortHeader label="Stock cover" field="stockCoverDays" activeField={sortBy} dir={sortDir} onSort={toggleSort} className="px-4 py-2 text-left text-xs" />
                  <SortHeader label="Suggested reorder" field="suggestedReorderQty" activeField={sortBy} dir={sortDir} onSort={toggleSort} className="px-4 py-2 text-left text-xs" />
                  <th className="px-4 py-2 text-left text-xs font-semibold text-slate-500">Urgency</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.productId}
                    onClick={() => setForecastProductId(r.productId)}
                    className={`${zebraRowClassName} cursor-pointer ${forecastProductId === r.productId ? 'bg-teal-50/70' : ''}`}
                  >
                    <td className="px-4 py-2.5 font-medium text-slate-800">{r.productName}</td>
                    <td className="px-4 py-2.5 text-slate-600">{r.dailyAverage}</td>
                    <td className="px-4 py-2.5 text-slate-600">{toNumber(r.currentStock)}</td>
                    <td className="px-4 py-2.5">
                      <StockCoverCell days={r.stockCoverDays} />
                    </td>
                    <td className="px-4 py-2.5 text-slate-600">{toNumber(r.suggestedReorderQty)}</td>
                    <td className="px-4 py-2.5">
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${URGENCY_STYLE[r.recommendation] ?? 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                        {URGENCY_LABEL[r.recommendation] ?? r.recommendation}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <PaginationFooter
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
          onPageSizeChange={(n) => {
            setPageSize(n);
            setPage(1);
          }}
        />
      </Card>

      <ChartCard title="Demand forecast" subtitle="Click a row above to inspect its forecast, or pick a product below">
        {rows.length || forecastProductId ? (
          <div className="space-y-4">
            {forecastLoading ? (
              <p className="py-6 text-center text-sm text-slate-500">Loading forecast…</p>
            ) : forecast ? (
              <>
                <div className="grid gap-4 sm:grid-cols-[188px_1fr]">
                  <GaugeChart value={Math.min(100, forecast.stockCoverDays * 4)} label="Stock cover" sublabel={`${forecast.stockCoverDays} days`} size={188} />
                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Daily average</p>
                      <p className="text-lg font-semibold text-slate-800">{forecast.dailyAverage} units</p>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Current stock</p>
                      <p className="text-lg font-semibold text-slate-800">{forecast.currentStock} units</p>
                    </div>
                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-3">
                      <p className="text-xs text-slate-500">Suggested reorder</p>
                      <p className="text-lg font-semibold text-slate-800">{forecast.suggestedReorderQty} units</p>
                    </div>
                    <div className={`rounded-xl border p-3 ${URGENCY_STYLE[forecast.recommendation] ?? 'border-slate-200 bg-slate-50 text-slate-700'}`}>
                      <p className="text-xs opacity-80">Recommendation</p>
                      <p className="text-lg font-semibold">{URGENCY_LABEL[forecast.recommendation] ?? forecast.recommendation}</p>
                    </div>
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold text-slate-500">Daily units sold — last {forecast.periodDays} days</p>
                  <BarOrLineChart
                    chartType="area"
                    data={forecast.series.map((s) => ({ label: s.date.slice(5), value: s.qty }))}
                    valueFormat={(n) => `${n} units`}
                    height={180}
                  />
                </div>
              </>
            ) : (
              <p className="text-sm text-slate-500">No forecast available for this product.</p>
            )}
          </div>
        ) : (
          <p className="py-6 text-center text-sm text-slate-500">No products currently need attention.</p>
        )}
      </ChartCard>
    </div>
  );
}
