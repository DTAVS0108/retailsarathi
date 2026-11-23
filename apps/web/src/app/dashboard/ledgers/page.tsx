'use client';

import { AppLoader } from '@/app/_components/app-loader';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { getIndianFinancialYear } from '@retail-sarathi/gst-engine';
import { Button, Card, formatINR } from '@retail-sarathi/ui';
import { apiWithAuth } from '@/lib/helpers';
import {
  pageShellClassName,
  MessageBanner,
  PageHeader,
  cn,
  formatDate,
  parseError,
  selectClassName,
  tableCellClassName,
  tableHeaderClassName,
} from '../_components/dashboard-ui';
import {
  ExportDropdown,
  applyWebExport,
  type ExportFormat,
} from '../_components/export-dropdown';
import { INDIAN_STATE_OPTIONS } from '@/lib/validators';

type Tab = 'customers' | 'sell' | 'buy';

type PeriodPreset =
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'q1'
  | 'q2'
  | 'q3'
  | 'q4'
  | 'this_fy'
  | 'last_fy';

type CustomerAgingRow = {
  customerId: string | null;
  name: string;
  phone: string | null;
  email?: string | null;
  gstin?: string | null;
  address?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  pincode?: string | null;
  stateCode?: string | null;
  segment?: string | null;
  outstanding: number;
  creditLimit?: number;
  advanceBalance?: number;
  loyaltyPoints?: number;
  whatsappOptIn?: boolean;
};

type RegisterRow = {
  id: string;
  sn: number;
  date: string;
  name: string;
  gstin: string | null;
  qty: number;
  invoiceNumber: string;
  taxAmount: number;
  cgst: number;
  sgst: number;
  totalTax: number;
  totalAmount: number;
  customerId?: string | null;
  supplierId?: string | null;
  documentType?: string;
};

type RegisterLedger = {
  period?: { label?: string };
  summary: {
    billCount?: number;
    invoiceCount?: number;
    creditNoteCount?: number;
    totalQty?: number;
    taxableAmount?: number;
    totalTax?: number;
    totalAmount?: number;
    totalSales?: number;
    gstRate?: number | null;
    byGstSlab?: Array<{ gstRate: number; taxable: number; tax: number; totalAmount: number; count: number }>;
  };
  entries: RegisterRow[];
};

const DEFAULT_GST_SLABS = [0, 5, 12, 18, 28, 40];

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'customers', label: 'Customer ledger' },
  { id: 'sell', label: 'Sell ledger' },
  { id: 'buy', label: 'Buy / Supplier ledger' },
];

const PERIOD_CHIPS: Array<[PeriodPreset, string]> = [
  ['this_week', 'This week'],
  ['last_week', 'Last week'],
  ['this_month', 'This month'],
  ['last_month', 'Last month'],
  ['q1', 'Q1'],
  ['q2', 'Q2'],
  ['q3', 'Q3'],
  ['q4', 'Q4'],
  ['this_fy', 'This FY'],
  ['last_fy', 'Last FY'],
];

const REGISTER_HEADERS = [
  'SN',
  'Date',
  'Name',
  'GSTIN',
  'Invoice',
  'QTY',
  'TaxAmount',
  'CGST',
  'SGST',
  'Total Tax',
  'Total Amount',
] as const;

function customerAddressLine(c: {
  address?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  stateCode?: string | null;
  pincode?: string | null;
}) {
  const stateName = c.stateCode
    ? INDIAN_STATE_OPTIONS.find((s) => s.code === c.stateCode)?.name ?? c.stateCode
    : null;
  return [c.address, c.addressLine2, c.city, stateName, c.pincode].filter(Boolean).join(', ');
}

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function quarterRange(startYear: number, quarter: 1 | 2 | 3 | 4): { from: string; to: string } {
  if (quarter === 1) return { from: `${startYear}-04-01`, to: `${startYear}-06-30` };
  if (quarter === 2) return { from: `${startYear}-07-01`, to: `${startYear}-09-30` };
  if (quarter === 3) return { from: `${startYear}-10-01`, to: `${startYear}-12-31` };
  return { from: `${startYear + 1}-01-01`, to: `${startYear + 1}-03-31` };
}

function resolvePreset(preset: PeriodPreset): {
  from: string;
  to: string;
  fy?: string;
  quarter?: number;
  label: string;
} {
  const now = new Date();
  const fy = getIndianFinancialYear(now);
  const label = PERIOD_CHIPS.find(([id]) => id === preset)?.[1] ?? preset;
  if (preset === 'this_fy') {
    return { from: `${fy.startYear}-04-01`, to: `${fy.endYear}-03-31`, fy: fy.key, label };
  }
  if (preset === 'last_fy') {
    const start = fy.startYear - 1;
    return {
      from: `${start}-04-01`,
      to: `${start + 1}-03-31`,
      fy: `${start}-${start + 1}`,
      label,
    };
  }
  if (preset === 'q1' || preset === 'q2' || preset === 'q3' || preset === 'q4') {
    const q = Number(preset.slice(1)) as 1 | 2 | 3 | 4;
    return { ...quarterRange(fy.startYear, q), fy: fy.key, quarter: q, label };
  }
  if (preset === 'this_month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    return { from: isoDate(from), to: isoDate(to), label };
  }
  if (preset === 'last_month') {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0));
    return { from: isoDate(from), to: isoDate(to), label };
  }
  if (preset === 'this_week') {
    return { from: isoDate(startOfWeek(now)), to: isoDate(now), label };
  }
  const thisMon = startOfWeek(now);
  const lastMon = new Date(thisMon);
  lastMon.setDate(lastMon.getDate() - 7);
  const lastSun = new Date(thisMon);
  lastSun.setDate(lastSun.getDate() - 1);
  return { from: isoDate(lastMon), to: isoDate(lastSun), label };
}

function qs(params: Record<string, string | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) sp.set(k, v);
  }
  return sp.toString();
}

function RegisterTable({
  rows,
  kind,
}: {
  rows: RegisterRow[];
  kind: 'sell' | 'buy';
}) {
  if (!rows.length) {
    return (
      <p className="text-sm text-slate-500">
        {kind === 'sell' ? 'No sales in this period.' : 'No purchase bills in this period.'}
      </p>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="min-w-full text-sm">
        <thead className="bg-slate-50">
          <tr>
            {REGISTER_HEADERS.map((h) => (
              <th
                key={h}
                className={cn(
                  tableHeaderClassName,
                  ['QTY', 'TaxAmount', 'CGST', 'SGST', 'Total Tax', 'Total Amount'].includes(h) &&
                    'text-right',
                )}
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const nameHref =
              kind === 'sell' && row.customerId
                ? `/dashboard/customers/${row.customerId}`
                : kind === 'buy' && row.supplierId
                  ? `/dashboard/suppliers/${row.supplierId}`
                  : null;
            const invHref =
              kind === 'sell'
                ? `/dashboard/invoices/${row.id}`
                : `/dashboard/purchase-bills/${row.id}`;
            return (
              <tr key={row.id} className="border-t border-slate-100">
                <td className={tableCellClassName}>{row.sn}</td>
                <td className={tableCellClassName}>{formatDate(row.date)}</td>
                <td className={tableCellClassName}>
                  {nameHref ? (
                    <Link href={nameHref} className="font-medium text-teal-700 underline">
                      {row.name}
                    </Link>
                  ) : (
                    <span className="font-medium text-slate-900">{row.name}</span>
                  )}
                </td>
                <td className={cn(tableCellClassName, 'font-mono text-xs')}>{row.gstin || '—'}</td>
                <td className={tableCellClassName}>
                  <Link href={invHref} className="font-semibold text-teal-700 underline">
                    {row.invoiceNumber}
                  </Link>
                </td>
                <td className={cn(tableCellClassName, 'text-right tabular-nums')}>{row.qty}</td>
                <td className={cn(tableCellClassName, 'text-right tabular-nums')}>
                  {formatINR(row.taxAmount)}
                </td>
                <td className={cn(tableCellClassName, 'text-right tabular-nums')}>
                  {formatINR(row.cgst)}
                </td>
                <td className={cn(tableCellClassName, 'text-right tabular-nums')}>
                  {formatINR(row.sgst)}
                </td>
                <td className={cn(tableCellClassName, 'text-right tabular-nums')}>
                  {formatINR(row.totalTax)}
                </td>
                <td
                  className={cn(
                    tableCellClassName,
                    'text-right font-semibold tabular-nums',
                    row.totalAmount < 0 && 'text-amber-800',
                  )}
                >
                  {formatINR(row.totalAmount)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function LedgersPage() {
  const [tab, setTab] = useState<Tab>('customers');
  const [preset, setPreset] = useState<PeriodPreset>('this_month');
  const [period, setPeriod] = useState(() => resolvePreset('this_month'));
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [customers, setCustomers] = useState<CustomerAgingRow[]>([]);
  const [sell, setSell] = useState<RegisterLedger | null>(null);
  const [buy, setBuy] = useState<RegisterLedger | null>(null);
  const [gstRate, setGstRate] = useState<string>('all');

  const applyPreset = useCallback((id: PeriodPreset) => {
    setPreset(id);
    setPeriod(resolvePreset(id));
  }, []);

  const periodQuery = useMemo(() => {
    if (period.fy && period.quarter) {
      return qs({ fy: period.fy, quarter: String(period.quarter) });
    }
    if (period.fy) return qs({ fy: period.fy });
    return qs({ from: period.from, to: period.to });
  }, [period]);

  const ledgerQuery = useMemo(() => {
    if (gstRate === 'all') return periodQuery;
    return `${periodQuery}&gstRate=${encodeURIComponent(gstRate)}`;
  }, [periodQuery, gstRate]);

  const exportCurrent = useCallback(
    async (format: ExportFormat) => {
      setExporting(true);
      setError('');
      setSuccess('');
      try {
        let path = '';
        if (tab === 'customers') path = `/reports/receivables?format=${format}`;
        else if (tab === 'sell') {
          path = `/reports/sell?${periodQuery}&format=${format}`;
          if (gstRate !== 'all') path += `&gstRate=${encodeURIComponent(gstRate)}`;
        } else {
          path = `/reports/buy?${periodQuery}&format=${format}`;
          if (gstRate !== 'all') path += `&gstRate=${encodeURIComponent(gstRate)}`;
        }

        const data = await apiWithAuth<{
          filename?: string;
          csv?: string;
          base64?: string;
          html?: string;
          contentType?: string;
        }>(path);
        setSuccess(await applyWebExport(format, data));
      } catch (e) {
        setError(parseError(e));
      } finally {
        setExporting(false);
      }
    },
    [tab, periodQuery, gstRate],
  );

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError('');
      try {
        const [cust, sale, buyRes] = await Promise.all([
          apiWithAuth<CustomerAgingRow[]>('/customers/aging/report').catch(() => [] as CustomerAgingRow[]),
          apiWithAuth<RegisterLedger>(`/analytics/sale-ledger?${ledgerQuery}`).catch(() => null),
          apiWithAuth<RegisterLedger>(`/analytics/buy-ledger?${ledgerQuery}`).catch(() => null),
        ]);
        setCustomers(Array.isArray(cust) ? cust.filter((r) => Number(r.outstanding) > 0.009) : []);
        setSell(sale);
        setBuy(buyRes);
      } catch (e) {
        setError(parseError(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [ledgerQuery]);

  const customerTotal = useMemo(
    () => customers.reduce((s, r) => s + Number(r.outstanding || 0), 0),
    [customers],
  );

  const activeRegister = tab === 'sell' ? sell : buy;
  const gstSlabOptions = useMemo(() => {
    const fromData = [
      ...(sell?.summary?.byGstSlab?.map((s) => s.gstRate) ?? []),
      ...(buy?.summary?.byGstSlab?.map((s) => s.gstRate) ?? []),
    ];
    return Array.from(new Set([...DEFAULT_GST_SLABS, ...fromData])).sort((a, b) => a - b);
  }, [sell, buy]);

  return (
    <div className={pageShellClassName}>
      <PageHeader
        title="Ledgers"
        description="Customer udhaar and period sell / buy registers — same columns, weekly to FY."
      />

      {error ? <MessageBanner tone="error">{error}</MessageBanner> : null}
      {success ? <MessageBanner tone="success">{success}</MessageBanner> : null}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                'rounded-full px-3.5 py-2 text-sm font-medium transition',
                tab === t.id
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50',
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <ExportDropdown exporting={exporting} onExport={(f) => void exportCurrent(f)} />
      </div>

      {(tab === 'sell' || tab === 'buy') && (
        <section className="space-y-2">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Period</p>
              <div className="flex flex-wrap gap-2">
                {PERIOD_CHIPS.map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => applyPreset(id)}
                    className={cn(
                      'rounded-full px-3.5 py-2 text-sm font-medium transition',
                      preset === id
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50',
                    )}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">GST slab</span>
              <select
                className={cn(selectClassName, 'min-w-[8.5rem]')}
                value={gstRate}
                onChange={(e) => setGstRate(e.target.value)}
                aria-label="GST slab"
              >
                <option value="all">All slabs</option>
                {gstSlabOptions.map((rate) => (
                  <option key={rate} value={String(rate)}>
                    {rate}%
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-xs text-slate-500">
            {activeRegister?.period?.label || period.label} · {period.from} → {period.to}
            {gstRate !== 'all' ? ` · GST ${gstRate}% only` : ''}
          </p>
        </section>
      )}

      {loading ? (
        <AppLoader label="Loading ledgers…" size="sm" />
      ) : tab === 'customers' ? (
        <Card className="border-slate-200 p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Customer ledger (udhaar)</h2>
              <p className="text-xs text-slate-500">Parties who owe you — open a customer to collect and view khata.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-right">
                <p className="text-xs text-slate-500">Total receivable</p>
                <p className="text-lg font-semibold text-rose-700">{formatINR(customerTotal)}</p>
              </div>
              <Link href="/dashboard/customers">
                <Button type="button" variant="secondary" size="sm">
                  All customers
                </Button>
              </Link>
            </div>
          </div>
          {!customers.length ? (
            <p className="text-sm text-slate-500">No open customer dues.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className={tableHeaderClassName}>Customer</th>
                    <th className={tableHeaderClassName}>Contact</th>
                    <th className={tableHeaderClassName}>GSTIN</th>
                    <th className={tableHeaderClassName}>Address</th>
                    <th className={cn(tableHeaderClassName, 'text-right')}>Limit</th>
                    <th className={cn(tableHeaderClassName, 'text-right')}>Outstanding</th>
                    <th className={tableHeaderClassName} />
                  </tr>
                </thead>
                <tbody>
                  {customers.slice(0, 50).map((row) => {
                    const addr = customerAddressLine(row);
                    return (
                      <tr key={row.customerId || row.name} className="border-t border-slate-100">
                        <td className={tableCellClassName}>
                          <div className="font-medium text-slate-900">{row.name}</div>
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            {row.segment ? (
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                                {row.segment}
                              </span>
                            ) : null}
                            {row.whatsappOptIn ? (
                              <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700">
                                WA
                              </span>
                            ) : null}
                            {Number(row.loyaltyPoints) > 0 ? (
                              <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                                {row.loyaltyPoints} pts
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className={tableCellClassName}>
                          <div>{row.phone || '—'}</div>
                          {row.email ? <div className="text-xs text-slate-500">{row.email}</div> : null}
                        </td>
                        <td className={cn(tableCellClassName, 'font-mono text-xs')}>{row.gstin || '—'}</td>
                        <td className={cn(tableCellClassName, 'max-w-[220px] text-xs text-slate-500')}>
                          {addr || '—'}
                        </td>
                        <td className={cn(tableCellClassName, 'text-right tabular-nums')}>
                          <div>{formatINR(row.creditLimit ?? 0)}</div>
                          {Number(row.advanceBalance) > 0.009 ? (
                            <div className="text-[11px] text-teal-700">
                              Adv {formatINR(row.advanceBalance!)}
                            </div>
                          ) : null}
                        </td>
                        <td className={tableCellClassName}>
                          <span className="font-semibold text-rose-700">{formatINR(row.outstanding)}</span>
                        </td>
                        <td className={tableCellClassName}>
                          {row.customerId ? (
                            <Link href={`/dashboard/customers/${row.customerId}`}>
                              <Button type="button" variant="secondary" size="sm">
                                Open ledger
                              </Button>
                            </Link>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : (
        <Card className="border-slate-200 p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">
                {tab === 'sell' ? 'Sell ledger' : 'Buy / Supplier ledger'}
              </h2>
              <p className="text-xs text-slate-500">
                {tab === 'sell'
                  ? 'Sales & credit notes for the selected period.'
                  : 'Purchase bills from suppliers for the selected period.'}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="text-right">
                <p className="text-xs text-slate-500">Total amount</p>
                <p className="text-lg font-semibold text-slate-900">
                  {formatINR(
                    activeRegister?.summary.totalAmount ??
                      activeRegister?.summary.totalSales ??
                      0,
                  )}
                </p>
                <p className="text-[11px] text-slate-500">
                  {tab === 'sell'
                    ? `${activeRegister?.summary.invoiceCount ?? 0} invoices · ${activeRegister?.summary.creditNoteCount ?? 0} returns`
                    : `${activeRegister?.summary.billCount ?? 0} bills · qty ${activeRegister?.summary.totalQty ?? 0}`}
                </p>
              </div>
              <Link href={tab === 'sell' ? '/dashboard/reports?tab=sell' : '/dashboard/reports?tab=buy'}>
                <Button type="button" size="sm">
                  Full {tab === 'sell' ? 'sell' : 'buy'} report
                </Button>
              </Link>
            </div>
          </div>
          <RegisterTable rows={activeRegister?.entries ?? []} kind={tab} />
        </Card>
      )}
    </div>
  );
}
