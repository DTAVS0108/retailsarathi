import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  Bar,
  BarChart as RBarChart,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useToastMessage } from './toast';

type Monthly = {
  months: Array<{ label: string; revenue: number; invoices: number }>;
  summary: { totalRevenue: number; avgMonthlyRevenue: number; bestMonth: string | null };
};

type SaleLedger = {
  period?: { label?: string; from?: string; to?: string };
  summary: {
    totalSales?: number;
    totalAmount?: number;
    invoiceCount?: number;
    creditNoteCount?: number;
    totalTax?: number;
    taxableAmount?: number;
    totalQty?: number;
    byPayment?: Array<{ method: string; amount: number }>;
  };
};

type BuyLedger = {
  period?: { label?: string };
  summary: {
    billCount?: number;
    totalAmount?: number;
    totalQty?: number;
    totalTax?: number;
    taxableAmount?: number;
  };
};

type StockFlow = {
  summary: { stockInQty: number; stockOutQty: number; netQty: number };
  byType: Array<{ type: string; qtyIn: number; qtyOut: number }>;
};

type Dash = {
  todayRevenue: number;
  todayInvoices: number;
  totalProducts: number;
  lowStockCount: number;
};

type StockSummary = {
  byCategory: Array<{ category: string; skuCount: number; stockQty: number; stockValue: number }>;
  byGstSlab: Array<{ gstRate: number; skuCount: number; stockQty: number; stockValue: number }>;
};

type CustomerAgingRow = {
  customerId?: string | null;
  name: string;
  outstanding: number;
  phone?: string | null;
};

type SupplierAgingRow = {
  supplierId?: string | null;
  name: string;
  outstanding: number;
  overdueCount?: number;
  billCount?: number;
  isMsme?: boolean;
  msmeOver45?: number;
};

/**
 * Validated categorical palette (dataviz skill default) — fixed slot order, not cycled
 * arbitrarily: clears CVD-separation and normal-vision-floor checks on every adjacent pair.
 * Some slots sit below 3:1 contrast on a light surface by design — the "relief" requirement
 * (direct labels) is met everywhere this is used.
 */
const COLORS = [
  '#2a78d6', // blue
  '#eb6834', // orange
  '#1baf7a', // aqua
  '#eda100', // yellow
  '#e87ba4', // magenta
  '#008300', // green
  '#4a3aa7', // violet
  '#e34948', // red
];

function inr(n: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n);
}

function abbr(n: number) {
  if (Math.abs(n) >= 1e7) return `${(n / 1e7).toFixed(1)}Cr`;
  if (Math.abs(n) >= 1e5) return `${(n / 1e5).toFixed(1)}L`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}k`;
  return String(Math.round(n));
}

/** Current calendar month ISO range for register queries. */
function thisMonthRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1);
  const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { from: iso(from), to: iso(to), label: now.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) };
}

/**
 * Recharts' default category-axis tick has no truncation — a label wider than the reserved
 * axis width overflows past x=0 and gets clipped on the LEFT (cutting off the first letters),
 * since right-aligned text grows leftward. A foreignObject with real CSS text-overflow:ellipsis
 * is the only reliable single-line truncation for SVG text; the full label is still available
 * via the native title tooltip on hover.
 */
function makeTruncatedYAxisTick(maxWidth: number) {
  function YAxisTick({
    x,
    y,
    payload,
  }: {
    x?: string | number;
    y?: string | number;
    payload?: { value?: unknown };
  }) {
    const w = maxWidth - 10;
    const cx = Number(x) || 0;
    const cy = Number(y) || 0;
    const label = String(payload?.value ?? '');
    return (
      <foreignObject x={cx - w - 6} y={cy - 9} width={w} height={18}>
        <div
          title={label}
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: 'var(--rs-ink)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            textAlign: 'right',
            lineHeight: '18px',
          }}
        >
          {label}
        </div>
      </foreignObject>
    );
  }
  return YAxisTick;
}

function ChartTooltip({
  active,
  payload,
  format = inr,
}: {
  active?: boolean;
  payload?: Array<{ payload: { label: string; value: number } }>;
  format?: (n: number) => string;
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0]?.payload;
  if (!point) return null;
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs shadow-md"
      style={{ background: 'var(--rs-surface)', borderColor: 'var(--rs-border)', color: 'var(--rs-ink)' }}
    >
      <p className="font-semibold">{point.label}</p>
      <p style={{ color: 'var(--rs-muted)' }}>{format(point.value)}</p>
    </div>
  );
}

function BarChart({ data }: { data: Array<{ label: string; value: number }> }) {
  if (!data.length) {
    return <p className="py-8 text-center text-sm" style={{ color: 'var(--rs-muted)' }}>No data</p>;
  }
  return (
    <ResponsiveContainer width="100%" height={150}>
      <RBarChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 4 }} barCategoryGap="24%">
        <XAxis dataKey="label" tick={{ fontSize: 10, fill: 'var(--rs-muted)' }} axisLine={{ stroke: 'var(--rs-border)' }} tickLine={false} />
        <YAxis hide domain={[0, (max: number) => max * 1.15]} />
        <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} content={<ChartTooltip />} />
        <Bar
          dataKey="value"
          radius={[6, 6, 0, 0]}
          maxBarSize={36}
          label={{
            position: 'top',
            fontSize: 10,
            fill: 'var(--rs-muted)',
            formatter: (v: unknown) => {
              const n = Number(v) || 0;
              return n > 0 ? abbr(n) : '';
            },
          }}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Bar>
      </RBarChart>
    </ResponsiveContainer>
  );
}

function HBars({
  data,
  format = inr,
}: {
  data: Array<{ label: string; value: number }>;
  format?: (n: number) => string;
}) {
  if (!data.length) {
    return <p className="text-sm" style={{ color: 'var(--rs-muted)' }}>No data</p>;
  }
  const height = Math.max(90, data.length * 40);
  const yAxisWidth = 130;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RBarChart data={data} layout="vertical" margin={{ top: 4, right: 72, left: 4, bottom: 4 }} barCategoryGap="28%">
        <XAxis type="number" hide domain={[0, (max: number) => max * 1.12]} />
        <YAxis
          type="category"
          dataKey="label"
          width={yAxisWidth}
          tick={makeTruncatedYAxisTick(yAxisWidth)}
          axisLine={false}
          tickLine={false}
        />
        <Tooltip cursor={{ fill: 'rgba(0,0,0,0.04)' }} content={<ChartTooltip format={format} />} />
        <Bar
          dataKey="value"
          radius={[0, 6, 6, 0]}
          barSize={10}
          label={{
            position: 'right',
            fontSize: 10,
            fill: 'var(--rs-muted)',
            formatter: (v: unknown) => format(Number(v) || 0),
          }}
        >
          {data.map((_, i) => (
            <Cell key={i} fill={COLORS[i % COLORS.length]} />
          ))}
        </Bar>
      </RBarChart>
    </ResponsiveContainer>
  );
}

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="rs-card p-4">
      <div className="mb-3">
        <h3 className="font-semibold" style={{ color: 'var(--rs-ink)' }}>
          {title}
        </h3>
        {subtitle ? (
          <p className="text-xs" style={{ color: 'var(--rs-muted)' }}>
            {subtitle}
          </p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function Kpi({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'default' | 'danger' | 'warn' | 'accent';
}) {
  const color =
    tone === 'danger'
      ? 'var(--rs-danger, #b91c1c)'
      : tone === 'warn'
        ? 'var(--rs-warn, #b45309)'
        : tone === 'accent'
          ? 'var(--rs-accent)'
          : 'var(--rs-ink)';
  return (
    <div className="rs-card p-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--rs-muted)' }}>
        {label}
      </p>
      <p className="mt-1 text-lg font-bold tabular-nums leading-tight" style={{ color }}>
        {value}
      </p>
      {hint ? (
        <p className="mt-0.5 text-[11px]" style={{ color: 'var(--rs-muted)' }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function PartyList({
  rows,
  empty,
}: {
  rows: Array<{ id: string; name: string; amount: number; meta?: string }>;
  empty: string;
}) {
  if (!rows.length) {
    return (
      <p className="py-4 text-center text-sm" style={{ color: 'var(--rs-muted)' }}>
        {empty}
      </p>
    );
  }
  return (
    <ul className="divide-y" style={{ borderColor: 'var(--rs-border)' }}>
      {rows.map((r) => (
        <li key={r.id} className="flex items-start justify-between gap-3 py-2 text-sm">
          <div className="min-w-0">
            <p className="truncate font-medium" style={{ color: 'var(--rs-ink)' }}>
              {r.name}
            </p>
            {r.meta ? (
              <p className="text-[11px]" style={{ color: 'var(--rs-muted)' }}>
                {r.meta}
              </p>
            ) : null}
          </div>
          <span className="shrink-0 font-semibold tabular-nums text-rose-700">{inr(r.amount)}</span>
        </li>
      ))}
    </ul>
  );
}

export function StatsPanel({
  token,
  apiFetch,
  onFilterCategory,
  onFilterGst,
}: {
  token: string;
  apiFetch: <T>(token: string, path: string, init?: RequestInit) => Promise<T>;
  onFilterCategory?: (category: string) => void;
  onFilterGst?: (gstRate: string) => void;
}) {
  const month = useMemo(() => thisMonthRange(), []);
  const [dash, setDash] = useState<Dash | null>(null);
  const [monthly, setMonthly] = useState<Monthly | null>(null);
  const [sales, setSales] = useState<SaleLedger | null>(null);
  const [buy, setBuy] = useState<BuyLedger | null>(null);
  const [stock, setStock] = useState<StockFlow | null>(null);
  const [stockSummary, setStockSummary] = useState<StockSummary | null>(null);
  const [receivables, setReceivables] = useState<CustomerAgingRow[]>([]);
  const [payables, setPayables] = useState<SupplierAgingRow[]>([]);
  const [error, setError] = useState('');
  useToastMessage(error, 'error', setError);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError('');
      try {
        const ledgerQs = `from=${month.from}&to=${month.to}`;
        const [d, m, s, b, f, summary, cust, supp] = await Promise.all([
          apiFetch<Dash>(token, '/tenants/dashboard'),
          apiFetch<Monthly>(token, '/analytics/monthly?months=6'),
          apiFetch<SaleLedger>(token, `/analytics/sale-ledger?${ledgerQs}`),
          apiFetch<BuyLedger>(token, `/analytics/buy-ledger?${ledgerQs}`).catch(() => null),
          apiFetch<StockFlow>(token, '/analytics/stock-flow?days=30'),
          apiFetch<StockSummary>(token, '/products/stock-summary').catch(() => null),
          apiFetch<CustomerAgingRow[]>(token, '/customers/aging/report').catch(() => [] as CustomerAgingRow[]),
          apiFetch<SupplierAgingRow[]>(token, '/suppliers/aging/report').catch(() => [] as SupplierAgingRow[]),
        ]);
        if (cancelled) return;
        setDash(d);
        setMonthly(m);
        setSales(s);
        setBuy(b);
        setStock(f);
        setStockSummary(summary);
        setReceivables(Array.isArray(cust) ? cust.filter((r) => Number(r.outstanding) > 0.009) : []);
        setPayables(Array.isArray(supp) ? supp.filter((r) => Number(r.outstanding) > 0.009) : []);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load stats');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token, apiFetch, month.from, month.to]);

  const monthBars =
    monthly?.months.map((m) => ({
      label: m.label.replace(/ \d{4}$/, ''),
      value: m.revenue,
    })) ?? [];
  const payBars =
    sales?.summary.byPayment?.map((p) => ({ label: p.method.replace(/_/g, ' '), value: p.amount })) ?? [];
  const stockBars =
    stock?.byType.map((t) => ({
      label: t.type.replace(/_/g, ' '),
      value: Math.abs(t.qtyIn) + Math.abs(t.qtyOut),
    })) ?? [];

  const receivableTotal = receivables.reduce((s, r) => s + Number(r.outstanding || 0), 0);
  const payableTotal = payables.reduce((s, r) => s + Number(r.outstanding || 0), 0);
  const overdueBills = payables.reduce((s, r) => s + Number(r.overdueCount || 0), 0);
  const msmeRisk = payables.reduce((s, r) => s + Number(r.msmeOver45 || 0), 0);
  const sellTotal = Number(sales?.summary.totalAmount ?? sales?.summary.totalSales ?? 0);
  const buyTotal = Number(buy?.summary.totalAmount ?? 0);

  const topReceivables = receivables.slice(0, 6).map((r) => ({
    id: r.customerId || r.name,
    name: r.name,
    amount: Number(r.outstanding),
    meta: r.phone || undefined,
  }));
  const topPayables = payables.slice(0, 6).map((r) => ({
    id: r.supplierId || r.name,
    name: r.name,
    amount: Number(r.outstanding),
    meta: [
      r.billCount ? `${r.billCount} bill(s)` : null,
      r.overdueCount ? `${r.overdueCount} overdue` : null,
      r.isMsme ? 'MSME' : null,
    ]
      .filter(Boolean)
      .join(' · '),
  }));

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center" style={{ color: 'var(--rs-muted)' }}>
        Loading stats…
      </div>
    );
  }
  if (error) {
    return (
      <div className="m-6 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-4 md:p-6" style={{ background: 'var(--rs-bg-deep)' }}>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--rs-ink)' }}>
            Shop stats
          </h2>
          <p className="text-sm" style={{ color: 'var(--rs-muted)' }}>
            Today · khata tracking · {month.label} registers · stock
          </p>
        </div>
        <span
          className="rounded-full px-3 py-1 text-[11px] font-medium"
          style={{ background: 'var(--rs-surface)', color: 'var(--rs-muted)', border: '1px solid var(--rs-border)' }}
        >
          Registers: {month.from} → {month.to}
        </span>
      </div>

      {/* Today */}
      {dash ? (
        <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="Today revenue" value={inr(dash.todayRevenue)} tone="accent" />
          <Kpi label="Today bills" value={String(dash.todayInvoices)} />
          <Kpi label="Active products" value={String(dash.totalProducts)} />
          <Kpi
            label="Low stock"
            value={String(dash.lowStockCount)}
            tone={dash.lowStockCount > 0 ? 'warn' : 'default'}
            hint={dash.lowStockCount > 0 ? 'Reorder soon' : 'Healthy'}
          />
        </div>
      ) : null}

      {/* Khata tracking */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label="Receivable"
          value={inr(receivableTotal)}
          tone="danger"
          hint={`${receivables.length} customer(s) with udhaar`}
        />
        <Kpi
          label="Payable"
          value={inr(payableTotal)}
          tone="danger"
          hint={`${payables.length} supplier(s) open`}
        />
        <Kpi
          label="Overdue bills"
          value={String(overdueBills)}
          tone={overdueBills > 0 ? 'warn' : 'default'}
          hint="Supplier bills past due"
        />
        <Kpi
          label="MSME 45d+ risk"
          value={inr(msmeRisk)}
          tone={msmeRisk > 0.009 ? 'warn' : 'default'}
          hint="MSME dues over 45 days"
        />
      </div>

      <div className="mb-4 grid gap-4 lg:grid-cols-2">
        <Card title="Who owes you" subtitle="Top receivables · live khata">
          <PartyList rows={topReceivables} empty="No open customer dues." />
        </Card>
        <Card title="Who you owe" subtitle="Top payables · live khata">
          <PartyList rows={topPayables} empty="No open supplier dues." />
        </Card>
      </div>

      {/* This-month registers */}
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi
          label={`Sell · ${month.label.split(' ')[0]}`}
          value={inr(sellTotal)}
          tone="accent"
          hint={`${sales?.summary.invoiceCount ?? 0} invoices · ${sales?.summary.creditNoteCount ?? 0} returns`}
        />
        <Kpi
          label="Sell tax"
          value={inr(Number(sales?.summary.totalTax ?? 0))}
          hint={`Taxable ${inr(Number(sales?.summary.taxableAmount ?? 0))}`}
        />
        <Kpi
          label={`Buy · ${month.label.split(' ')[0]}`}
          value={inr(buyTotal)}
          hint={`${buy?.summary.billCount ?? 0} bills · qty ${buy?.summary.totalQty ?? 0}`}
        />
        <Kpi
          label="Buy tax"
          value={inr(Number(buy?.summary.totalTax ?? 0))}
          hint={`Taxable ${inr(Number(buy?.summary.taxableAmount ?? 0))}`}
        />
      </div>

      {stockSummary ? (
        <div className="mb-4 grid gap-4 lg:grid-cols-2">
          <Card title="Stock by GST slab" subtitle="Click to open POS picker filtered by slab">
            {stockSummary.byGstSlab.length ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-xs" style={{ color: 'var(--rs-muted)' }}>
                    <tr>
                      <th className="py-1 pr-2">GST</th>
                      <th className="py-1 pr-2">SKUs</th>
                      <th className="py-1 pr-2">Qty</th>
                      <th className="py-1">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: 'var(--rs-border)' }}>
                    {stockSummary.byGstSlab.map((row) => (
                      <tr
                        key={row.gstRate}
                        className={onFilterGst ? 'cursor-pointer hover:bg-teal-50/60' : undefined}
                        onClick={() => onFilterGst?.(String(row.gstRate))}
                      >
                        <td className="py-1.5 pr-2 font-semibold" style={{ color: 'var(--rs-ink)' }}>
                          {row.gstRate}%
                        </td>
                        <td className="py-1.5 pr-2">{row.skuCount}</td>
                        <td className="py-1.5 pr-2 tabular-nums">{row.stockQty}</td>
                        <td className="py-1.5 tabular-nums">{inr(row.stockValue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm" style={{ color: 'var(--rs-muted)' }}>
                No products yet.
              </p>
            )}
          </Card>
          <Card title="Stock by category" subtitle="Click to open POS picker filtered by category">
            {stockSummary.byCategory.length ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-xs" style={{ color: 'var(--rs-muted)' }}>
                    <tr>
                      <th className="py-1 pr-2">Category</th>
                      <th className="py-1 pr-2">SKUs</th>
                      <th className="py-1 pr-2">Qty</th>
                      <th className="py-1">Value</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y" style={{ borderColor: 'var(--rs-border)' }}>
                    {stockSummary.byCategory.map((row) => {
                      const clickable = row.category !== 'Uncategorized' && Boolean(onFilterCategory);
                      return (
                        <tr
                          key={row.category}
                          className={clickable ? 'cursor-pointer hover:bg-teal-50/60' : undefined}
                          onClick={() => {
                            if (clickable) onFilterCategory?.(row.category);
                          }}
                        >
                          <td className="py-1.5 pr-2 font-semibold" style={{ color: 'var(--rs-ink)' }}>
                            {row.category}
                          </td>
                          <td className="py-1.5 pr-2">{row.skuCount}</td>
                          <td className="py-1.5 pr-2 tabular-nums">{row.stockQty}</td>
                          <td className="py-1.5 tabular-nums">{inr(row.stockValue)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm" style={{ color: 'var(--rs-muted)' }}>
                No products yet.
              </p>
            )}
          </Card>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Revenue by month" subtitle="Last 6 months">
          <BarChart data={monthBars} />
        </Card>
        <Card title="Payment mix" subtitle={`Sell register · ${month.label}`}>
          <HBars data={payBars} />
        </Card>
        <Card title="Stock movements" subtitle="By type · last 30 days">
          <HBars data={stockBars} format={(n) => `${Math.round(n)} units`} />
        </Card>
        <Card title="Period snapshot" subtitle={`${month.label} + stock flow`}>
          <ul className="space-y-2 text-sm" style={{ color: 'var(--rs-ink)' }}>
            <li className="flex justify-between gap-3">
              <span style={{ color: 'var(--rs-muted)' }}>Net sell</span>
              <strong className="tabular-nums">{inr(sellTotal)}</strong>
            </li>
            <li className="flex justify-between gap-3">
              <span style={{ color: 'var(--rs-muted)' }}>Purchase bills</span>
              <strong className="tabular-nums">{inr(buyTotal)}</strong>
            </li>
            <li className="flex justify-between gap-3">
              <span style={{ color: 'var(--rs-muted)' }}>Stock in / out (30d)</span>
              <strong className="tabular-nums">
                +{Math.round(stock?.summary.stockInQty ?? 0)} / −{Math.round(stock?.summary.stockOutQty ?? 0)}
              </strong>
            </li>
            <li className="flex justify-between gap-3 border-t pt-2" style={{ borderColor: 'var(--rs-border)' }}>
              <span style={{ color: 'var(--rs-muted)' }}>Avg monthly revenue</span>
              <strong className="tabular-nums">{inr(monthly?.summary.avgMonthlyRevenue ?? 0)}</strong>
            </li>
            <li className="flex justify-between gap-3">
              <span style={{ color: 'var(--rs-muted)' }}>Best month</span>
              <strong>{monthly?.summary.bestMonth ?? '—'}</strong>
            </li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
