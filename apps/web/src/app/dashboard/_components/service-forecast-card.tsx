'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Card, formatINR } from '@retail-sarathi/ui';
import { apiWithAuth } from '@/lib/helpers';
import { ChartCard, chartColors } from './charts';

type Point = { key: string; label: string; revenue: number };
type ForecastPoint = Point & { isForecast: true };
type Series = { points: Point[]; forecast: ForecastPoint[] };
type ServiceForecast = {
  granularity: string;
  retail: Series;
  repair: Series;
  total: Series;
  topServices: Array<Series & { id: string; name: string }>;
};

type ReorderItem = {
  productId: string;
  productName: string;
  stockCoverDays: number;
  suggestedReorderQty: number;
  recommendation: 'REORDER_NOW' | 'REORDER_SOON' | 'OK';
};

// Reserved status colors (dataviz skill) — never the categorical chart palette, matching the exact
// classes already used for alert severity in alerts-feed.tsx, so "urgent" always reads the same.
const URGENCY_STYLE: Record<string, string> = {
  REORDER_NOW: 'border-red-200 bg-red-50 text-red-800',
  REORDER_SOON: 'border-amber-200 bg-amber-50 text-amber-900',
};
const URGENCY_LABEL: Record<string, string> = {
  REORDER_NOW: 'Reorder now',
  REORDER_SOON: 'Reorder soon',
};

type Row = {
  label: string;
  retailActual?: number;
  retailForecast?: number;
  repairActual?: number;
  repairForecast?: number;
};

function buildRows(retail: Series, repair: Series): Row[] {
  const actualRows: Row[] = retail.points.map((p, i) => ({
    label: p.label,
    retailActual: p.revenue,
    repairActual: repair.points[i]?.revenue ?? 0,
  }));
  // Duplicate the last actual value into forecast row 0 of each series so the dashed segment
  // visually connects to the solid line — same technique RevenueTrendCard already uses.
  const lastRetail = retail.points[retail.points.length - 1]?.revenue;
  const lastRepair = repair.points[repair.points.length - 1]?.revenue;
  const forecastRows: Row[] = retail.forecast.map((p, i) => ({
    label: p.label,
    retailForecast: p.revenue,
    repairForecast: repair.forecast[i]?.revenue,
    ...(i === 0 ? { retailActual: lastRetail, repairActual: lastRepair } : {}),
  }));
  return [...actualRows, ...forecastRows];
}

function ForecastTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: Row }> }) {
  if (!active || !payload?.length) return null;
  const row = payload[0]?.payload;
  if (!row) return null;
  const retail = row.retailActual ?? row.retailForecast;
  const repair = row.repairActual ?? row.repairForecast;
  const isForecast = row.retailActual == null;
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-slate-800">
        {row.label} {isForecast ? <span className="font-normal text-slate-400">· Projected</span> : null}
      </p>
      {retail != null ? <p className="text-slate-600">Retail: {formatINR(retail)}</p> : null}
      {repair != null ? <p className="text-slate-600">Repair: {formatINR(repair)}</p> : null}
    </div>
  );
}

/** Retail-vs-repair revenue forecast, top repair services, and a reorder-soon product list — the
    Analytics page's dedicated Forecast section. `RevenueTrendCard` elsewhere already shows a
    blended, always-on 2-step forecast; this is additive, not a replacement, and splits the two
    revenue sources apart plus reuses the existing per-product reorder forecast (previously only
    visible on the AI Insights page). */
export function ServiceForecastCard() {
  const [data, setData] = useState<ServiceForecast | null>(null);
  const [reorder, setReorder] = useState<ReorderItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const [forecastRes, reorderRes] = await Promise.all([
          apiWithAuth<ServiceForecast>('/analytics/forecast?granularity=month&count=6&steps=3'),
          apiWithAuth<ReorderItem[]>('/ai/reorder'),
        ]);
        if (!cancelled) {
          setData(forecastRes);
          setReorder(Array.isArray(reorderRes) ? reorderRes.slice(0, 5) : []);
        }
      } catch {
        if (!cancelled) {
          setData(null);
          setReorder([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <ChartCard title="Forecast" subtitle="Retail, repair, and top services — next 3 months">
        <p className="py-8 text-center text-sm text-slate-500">Loading forecast…</p>
      </ChartCard>
    );
  }
  if (!data) return null;

  const rows = buildRows(data.retail, data.repair);
  const nextRetail = data.retail.forecast[0]?.revenue ?? 0;
  const nextRepair = data.repair.forecast[0]?.revenue ?? 0;

  return (
    <ChartCard title="Forecast" subtitle="Retail, repair, and top services — next 3 months (heuristic projection, not a guarantee)">
      <div className="space-y-5">
        <div className="flex items-center gap-4 text-xs font-medium text-slate-600">
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: chartColors.COLORS[0] }} />
            Retail
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: chartColors.COLORS[1] }} />
            Repair
          </span>
        </div>

        <div className="rounded-xl border border-slate-100 bg-slate-50 px-2 pb-2 pt-4">
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={rows} margin={{ top: 8, right: 16, left: 12, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#64748b' }} axisLine={{ stroke: '#e2e8f0' }} tickLine={false} />
              <YAxis hide domain={[0, (max: number) => max * 1.15]} />
              <Tooltip content={<ForecastTooltip />} />
              <Line type="monotone" dataKey="retailActual" stroke={chartColors.COLORS[0]} strokeWidth={2.5} dot={{ r: 3 }} connectNulls={false} />
              <Line type="monotone" dataKey="retailForecast" stroke={chartColors.COLORS[0]} strokeWidth={2.5} strokeDasharray="6 4" dot={{ r: 3, fillOpacity: 0.5 }} connectNulls />
              <Line type="monotone" dataKey="repairActual" stroke={chartColors.COLORS[1]} strokeWidth={2.5} dot={{ r: 3 }} connectNulls={false} />
              <Line type="monotone" dataKey="repairForecast" stroke={chartColors.COLORS[1]} strokeWidth={2.5} strokeDasharray="6 4" dot={{ r: 3, fillOpacity: 0.5 }} connectNulls />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Card className="border-slate-200">
            <p className="text-xs font-medium text-slate-500">Next month · Retail</p>
            <p className="mt-1 text-xl font-semibold text-slate-800">{formatINR(nextRetail)}</p>
          </Card>
          <Card className="border-slate-200">
            <p className="text-xs font-medium text-slate-500">Next month · Repair</p>
            <p className="mt-1 text-xl font-semibold text-slate-800">{formatINR(nextRepair)}</p>
          </Card>
        </div>

        {data.topServices.length ? (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Top services forecast</p>
            <ul className="space-y-3">
              {data.topServices.map((s, i) => {
                const current = s.points[s.points.length - 1]?.revenue ?? 0;
                const next = s.forecast[0]?.revenue ?? 0;
                const max = Math.max(1, ...data.topServices.map((t) => t.forecast[0]?.revenue ?? 0));
                return (
                  <li key={s.id}>
                    <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                      <span className="flex min-w-0 items-center gap-2 font-medium text-slate-700">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-bold text-slate-500">
                          {i + 1}
                        </span>
                        <span className="truncate">{s.name}</span>
                      </span>
                      <span className="shrink-0 whitespace-nowrap text-xs text-slate-500">
                        {formatINR(current)} now · {formatINR(next)} projected
                      </span>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: `${Math.max(2, (next / max) * 100)}%`, backgroundColor: chartColors.COLORS[i % chartColors.COLORS.length] }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}

        {reorder.length ? (
          <div>
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Reorder soon</p>
            <ul className="space-y-2">
              {reorder.map((r) => (
                <li key={r.productId}>
                  <Link
                    href="/dashboard/products?filter=low"
                    className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm transition hover:opacity-90 ${URGENCY_STYLE[r.recommendation] ?? 'border-slate-200 bg-slate-50 text-slate-700'}`}
                  >
                    <span className="min-w-0 truncate font-medium">{r.productName}</span>
                    <span className="shrink-0 whitespace-nowrap text-xs">
                      {URGENCY_LABEL[r.recommendation] ?? r.recommendation} · {r.stockCoverDays}d cover · reorder {r.suggestedReorderQty}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </ChartCard>
  );
}
