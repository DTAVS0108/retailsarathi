'use client';

import { AppLoader } from '@/app/_components/app-loader';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Button, Card, formatINR } from '@retail-sarathi/ui';
import { getIndianFinancialYear } from '@retail-sarathi/gst-engine';
import { apiWithAuth } from '@/lib/helpers';
import {
  pageShellClassName,
  MessageBanner,
  PageHeader,
  StatCard,
  inputClassName,
  parseError,
  selectClassName,
  tableCellClassName,
  tableHeaderClassName,
  toNumber,
} from '../_components/dashboard-ui';
import { ScrollableTabBar } from '../_components/scrollable-tab-bar';
import { CategorySelect } from '../_components/category-select';
import { ExportDropdown } from '../_components/export-dropdown';

type Tab = 'sell' | 'buy' | 'supplier' | 'customer' | 'rollups' | 'itr' | 'valuation' | 'movements';

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
  | 'last_fy'
  | 'custom';

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7; // Mon=0
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

function resolvePreset(
  preset: PeriodPreset,
): { from: string; to: string; fy?: string; quarter?: number } {
  const now = new Date();
  const fy = getIndianFinancialYear(now);
  if (preset === 'this_fy') return { from: `${fy.startYear}-04-01`, to: `${fy.endYear}-03-31`, fy: fy.key };
  if (preset === 'last_fy') {
    const start = fy.startYear - 1;
    return { from: `${start}-04-01`, to: `${start + 1}-03-31`, fy: `${start}-${start + 1}` };
  }
  if (preset === 'q1' || preset === 'q2' || preset === 'q3' || preset === 'q4') {
    const q = Number(preset.slice(1)) as 1 | 2 | 3 | 4;
    const range = quarterRange(fy.startYear, q);
    return { ...range, fy: fy.key, quarter: q };
  }
  if (preset === 'this_month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    return { from: isoDate(from), to: isoDate(to) };
  }
  if (preset === 'last_month') {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to = endOfDay(new Date(now.getFullYear(), now.getMonth(), 0));
    return { from: isoDate(from), to: isoDate(to) };
  }
  if (preset === 'this_week') {
    const from = startOfWeek(now);
    return { from: isoDate(from), to: isoDate(now) };
  }
  if (preset === 'last_week') {
    const thisMon = startOfWeek(now);
    const lastMon = new Date(thisMon);
    lastMon.setDate(lastMon.getDate() - 7);
    const lastSun = new Date(thisMon);
    lastSun.setDate(lastSun.getDate() - 1);
    return { from: isoDate(lastMon), to: isoDate(lastSun) };
  }
  return { from: isoDate(new Date(now.getFullYear(), now.getMonth(), 1)), to: isoDate(now) };
}

function qs(params: Record<string, string | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) sp.set(k, v);
  }
  return sp.toString();
}

function downloadBlob(filename: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function downloadCsv(filename: string, csv: string) {
  downloadBlob(filename, new Blob([csv], { type: 'text/csv;charset=utf-8' }));
}

function downloadBase64(filename: string, base64: string, mime: string) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  downloadBlob(filename, new Blob([bytes], { type: mime }));
}

function openHtmlPrint(html: string) {
  const w = window.open('', '_blank');
  if (!w) return;
  w.document.write(html);
  w.document.close();
}

export default function ReportsPage() {
  const searchParams = useSearchParams();
  const fy = useMemo(() => getIndianFinancialYear(), []);
  const initialTab = (searchParams.get('tab') as Tab | null) ?? 'sell';
  const initialFy = searchParams.get('fy') ?? fy.key;
  const initialSupplierId = searchParams.get('supplierId') ?? '';
  const initialCustomerId = searchParams.get('customerId') ?? '';
  const [tab, setTab] = useState<Tab>(
    ['sell', 'buy', 'supplier', 'customer', 'rollups', 'itr', 'valuation', 'movements'].includes(initialTab)
      ? initialTab
      : 'sell',
  );
  const [preset, setPreset] = useState<PeriodPreset>(
    initialTab === 'itr' ? 'this_fy' : 'this_month',
  );
  const [from, setFrom] = useState(() => resolvePreset('this_month').from);
  const [to, setTo] = useState(() => resolvePreset('this_month').to);
  const [fyKey, setFyKey] = useState<string | undefined>(
    initialTab === 'itr' ? initialFy : undefined,
  );
  const [quarter, setQuarter] = useState<number | undefined>(undefined);
  const [itrFy, setItrFy] = useState(initialFy);
  const [gstRate, setGstRate] = useState<string>('all'); // 'all' | '5' | '18' | ...

  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [sell, setSell] = useState<{
    period: { label: string };
    summary: Record<string, unknown>;
    entries: Array<Record<string, unknown>>;
  } | null>(null);
  const [buy, setBuy] = useState<{
    period: { label: string };
    summary: Record<string, unknown>;
    entries: Array<Record<string, unknown>>;
  } | null>(null);
  const [rollups, setRollups] = useState<Record<string, unknown> | null>(null);
  const [itrPack, setItrPack] = useState<{
    financialYear: string;
    itr: Record<string, unknown>;
    sell: { summary: Record<string, unknown>; entryCount: number };
    buy: { summary: Record<string, unknown>; entryCount: number };
    quarters: Array<Record<string, unknown>>;
  } | null>(null);

  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([]);
  const [customers, setCustomers] = useState<Array<{ id: string; name: string; phone?: string }>>([]);
  const [supplierId, setSupplierId] = useState(initialSupplierId);
  const [customerId, setCustomerId] = useState(initialCustomerId);
  const [partyLedger, setPartyLedger] = useState<{
    period: { label: string };
    party: Record<string, unknown>;
    openingBalance: number;
    closingBalance: number;
    entries: Array<Record<string, unknown>>;
    aging?: Record<string, number>;
  } | null>(null);
  const [valuation, setValuation] = useState<{
    period: { label: string };
    summary: Record<string, unknown>;
    entries: Array<Record<string, unknown>>;
  } | null>(null);
  const [movements, setMovements] = useState<{
    period: { label: string };
    summary: Record<string, unknown>;
    entries: Array<Record<string, unknown>>;
  } | null>(null);
  const [movementType, setMovementType] = useState('all');
  const [valuationCategory, setValuationCategory] = useState('');

  const periodQuery = useCallback(() => {
    const base =
      fyKey && quarter
        ? { fy: fyKey, quarter: String(quarter) }
        : fyKey
          ? { fy: fyKey }
          : { from, to };
    if ((tab === 'sell' || tab === 'buy' || tab === 'valuation') && gstRate !== 'all') {
      return { ...base, gstRate };
    }
    return base;
  }, [from, to, fyKey, quarter, gstRate, tab]);

  function applyPreset(p: PeriodPreset) {
    setPreset(p);
    if (p === 'custom') {
      setFyKey(undefined);
      setQuarter(undefined);
      return;
    }
    const r = resolvePreset(p);
    setFrom(r.from);
    setTo(r.to);
    setFyKey(r.fy);
    setQuarter(r.quarter);
    if (r.fy) setItrFy(r.fy);
  }

  useEffect(() => {
    void (async () => {
      try {
        const [sup, cust] = await Promise.all([
          apiWithAuth<Array<{ id: string; name: string }>>('/suppliers'),
          apiWithAuth<{ items?: Array<{ id: string; name: string; phone?: string }> } | Array<{ id: string; name: string; phone?: string }>>(
            '/customers?pageSize=200&sortBy=name',
          ),
        ]);
        setSuppliers(Array.isArray(sup) ? sup : []);
        const list = Array.isArray(cust) ? cust : cust.items ?? [];
        setCustomers(list);
        if (!supplierId && Array.isArray(sup) && sup[0]) setSupplierId(sup[0].id);
        if (!customerId && list[0]) setCustomerId(list[0].id);
      } catch {
        /* ignore party list errors on first paint */
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      const pq = periodQuery();
      if (tab === 'sell') {
        const data = await apiWithAuth<{
          period: { label: string };
          summary: Record<string, unknown>;
          entries: Array<Record<string, unknown>>;
        }>(`/reports/sell?${qs({ ...pq, format: 'json' })}`);
        setSell(data);
      } else if (tab === 'buy') {
        const data = await apiWithAuth<{
          period: { label: string };
          summary: Record<string, unknown>;
          entries: Array<Record<string, unknown>>;
        }>(`/reports/buy?${qs({ ...pq, format: 'json' })}`);
        setBuy(data);
      } else if (tab === 'rollups') {
        const data = await apiWithAuth<Record<string, unknown>>(`/reports/rollups?${qs(pq)}`);
        setRollups(data);
      } else if (tab === 'itr') {
        const data = await apiWithAuth<{
          financialYear: string;
          itr: Record<string, unknown>;
          sell: { summary: Record<string, unknown>; entryCount: number };
          buy: { summary: Record<string, unknown>; entryCount: number };
          quarters: Array<Record<string, unknown>>;
        }>(`/reports/itr-pack?${qs({ fy: itrFy, format: 'json' })}`);
        setItrPack(data);
      } else if (tab === 'supplier') {
        if (!supplierId) throw new Error('Select a supplier');
        const data = await apiWithAuth<{
          period: { label: string };
          party: Record<string, unknown>;
          openingBalance: number;
          closingBalance: number;
          entries: Array<Record<string, unknown>>;
          aging?: Record<string, number>;
        }>(`/reports/supplier-ledger/${supplierId}?${qs({ ...pq, format: 'json' })}`);
        setPartyLedger(data);
      } else if (tab === 'customer') {
        if (!customerId) throw new Error('Select a customer');
        const data = await apiWithAuth<{
          period: { label: string };
          party: Record<string, unknown>;
          openingBalance: number;
          closingBalance: number;
          entries: Array<Record<string, unknown>>;
        }>(`/reports/customer-ledger/${customerId}?${qs({ ...pq, format: 'json' })}`);
        setPartyLedger(data);
      } else if (tab === 'valuation') {
        const data = await apiWithAuth<{
          period: { label: string };
          summary: Record<string, unknown>;
          entries: Array<Record<string, unknown>>;
        }>(
          `/reports/stock-valuation?${qs({
            format: 'json',
            ...(valuationCategory.trim() ? { category: valuationCategory.trim() } : {}),
            ...(gstRate !== 'all' ? { gstRate } : {}),
          })}`,
        );
        setValuation(data);
      } else if (tab === 'movements') {
        const data = await apiWithAuth<{
          period: { label: string };
          summary: Record<string, unknown>;
          entries: Array<Record<string, unknown>>;
        }>(
          `/reports/stock-movements?${qs({
            ...pq,
            format: 'json',
            ...(movementType !== 'all' ? { type: movementType } : {}),
          })}`,
        );
        setMovements(data);
      }
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  }, [tab, periodQuery, supplierId, customerId, itrFy, gstRate, valuationCategory, movementType]);

  useEffect(() => {
    void load();
  }, [load]);

  async function exportReport(format: 'csv' | 'xlsx' | 'pdf') {
    setExporting(true);
    setError('');
    try {
      const pq = periodQuery();
      let path = '';
      if (tab === 'sell') path = `/reports/sell?${qs({ ...pq, format })}`;
      else if (tab === 'buy') path = `/reports/buy?${qs({ ...pq, format })}`;
      else if (tab === 'itr') path = `/reports/itr-pack?${qs({ fy: itrFy, format })}`;
      else if (tab === 'supplier') {
        if (!supplierId) throw new Error('Select a supplier');
        path = `/reports/supplier-ledger/${supplierId}?${qs({ ...pq, format })}`;
      } else if (tab === 'customer') {
        if (!customerId) throw new Error('Select a customer');
        path = `/reports/customer-ledger/${customerId}?${qs({ ...pq, format })}`;
      } else if (tab === 'valuation') {
        path = `/reports/stock-valuation?${qs({
          format,
          ...(valuationCategory.trim() ? { category: valuationCategory.trim() } : {}),
          ...(gstRate !== 'all' ? { gstRate } : {}),
        })}`;
      } else if (tab === 'movements') {
        path = `/reports/stock-movements?${qs({
          ...pq,
          format,
          ...(movementType !== 'all' ? { type: movementType } : {}),
        })}`;
      } else {
        throw new Error('Export rollups from Sell/Buy Excel (payment & HSN sheets)');
      }

      const data = await apiWithAuth<{
        filename?: string;
        csv?: string;
        base64?: string;
        html?: string;
        contentType?: string;
      }>(path);

      if (format === 'csv' && data.csv && data.filename) {
        downloadCsv(data.filename, data.csv);
      } else if (format === 'xlsx' && data.base64 && data.filename) {
        downloadBase64(
          data.filename,
          data.base64,
          data.contentType ?? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        );
      } else if (format === 'pdf' && data.html) {
        openHtmlPrint(data.html);
      } else {
        throw new Error('Unexpected export response');
      }
      setSuccess(format === 'pdf' ? 'Opened print view — save as PDF from the browser.' : `Downloaded ${data.filename}`);
    } catch (err) {
      setError(parseError(err));
    } finally {
      setExporting(false);
    }
  }

  async function exportItrAccounting(kind: 'csv' | 'tally') {
    setExporting(true);
    setError('');
    try {
      if (kind === 'csv') {
        const csv = await apiWithAuth<string>(`/accounting/itr-prep/export?fy=${itrFy}`);
        downloadCsv(`ITR-Prep-${itrFy}.csv`, String(csv));
      } else {
        const xml = await apiWithAuth<string>(`/accounting/itr-prep/export/tally?fy=${itrFy}`);
        downloadBlob(`Tally-Journal-${itrFy}.xml`, new Blob([String(xml)], { type: 'application/xml' }));
      }
      setSuccess(kind === 'csv' ? 'ITR summary CSV downloaded.' : 'Tally XML downloaded.');
    } catch (err) {
      setError(parseError(err));
    } finally {
      setExporting(false);
    }
  }

  const chipClass = (active: boolean, tone: 'dark' | 'teal' = 'dark') =>
    active
      ? tone === 'teal'
        ? 'bg-teal-800 text-white shadow-sm'
        : 'bg-slate-900 text-white shadow-sm'
      : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50';

  const sellSummary = sell?.summary;
  const buySummary = buy?.summary;

  return (
    <div className={`${pageShellClassName} !space-y-8`}>
      <PageHeader
        title="Sell, Buy & Stock Reports"
        description={`Period registers · stock valuation · FY ${fy.label} · export CSV, Excel, PDF`}
      />

      {error ? <MessageBanner tone="error">{error}</MessageBanner> : null}
      {success ? <MessageBanner tone="success">{success}</MessageBanner> : null}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 bg-slate-50/80 px-5 py-4 sm:px-6 sm:py-5">
          <ScrollableTabBar
            tabs={[
              { id: 'sell', label: 'Sell report' },
              { id: 'buy', label: 'Buy report' },
              { id: 'valuation', label: 'Stock valuation' },
              { id: 'movements', label: 'Stock movements' },
              { id: 'itr', label: 'ITR pack' },
              { id: 'supplier', label: 'Supplier ledger' },
              { id: 'customer', label: 'Customer ledger' },
              { id: 'rollups', label: 'Rollups' },
            ]}
            active={tab}
            onChange={(id) => setTab(id as Tab)}
          />
        </div>

        <div className="space-y-7 px-5 py-6 sm:px-6 sm:py-7">
          {tab !== 'valuation' ? (
          <section className="space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Period</p>
            <div className="flex flex-wrap gap-2.5">
              {(
                [
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
                  ['custom', 'Custom'],
                ] as Array<[PeriodPreset, string]>
              ).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => applyPreset(id)}
                  className={`rounded-full px-3.5 py-2 text-sm font-medium transition ${chipClass(preset === id)}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>
          ) : (
            <section className="space-y-1">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Snapshot</p>
              <p className="text-sm text-slate-600">Stock valuation is as-of-now (not period-based).</p>
            </section>
          )}

          <section className="grid gap-5 border-t border-slate-100 pt-6 sm:grid-cols-2 lg:grid-cols-4">
            {tab === 'itr' ? (
              <label className="block space-y-2 text-sm sm:col-span-2">
                <span className="block font-medium text-slate-600">Financial year</span>
                <select
                  className={selectClassName}
                  value={itrFy}
                  onChange={(e) => {
                    setItrFy(e.target.value);
                    setFyKey(e.target.value);
                    setQuarter(undefined);
                    setPreset('custom');
                  }}
                >
                  {[0, 1, 2].map((offset) => {
                    const start = fy.startYear - offset;
                    const key = `${start}-${start + 1}`;
                    return (
                      <option key={key} value={key}>
                        FY {start}–{String(start + 1).slice(-2)}
                      </option>
                    );
                  })}
                </select>
              </label>
            ) : tab === 'valuation' ? null : (
              <>
                <label className="block space-y-2 text-sm">
                  <span className="block font-medium text-slate-600">From</span>
                  <input
                    type="date"
                    className={inputClassName}
                    value={from}
                    onChange={(e) => {
                      setPreset('custom');
                      setFyKey(undefined);
                      setQuarter(undefined);
                      setFrom(e.target.value);
                    }}
                  />
                </label>
                <label className="block space-y-2 text-sm">
                  <span className="block font-medium text-slate-600">To</span>
                  <input
                    type="date"
                    className={inputClassName}
                    value={to}
                    onChange={(e) => {
                      setPreset('custom');
                      setFyKey(undefined);
                      setQuarter(undefined);
                      setTo(e.target.value);
                    }}
                  />
                </label>
              </>
            )}
            {tab === 'supplier' ? (
              <label className="block space-y-2 text-sm sm:col-span-2">
                <span className="block font-medium text-slate-600">Supplier</span>
                <select
                  className={selectClassName}
                  value={supplierId}
                  onChange={(e) => setSupplierId(e.target.value)}
                >
                  {suppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {tab === 'customer' ? (
              <label className="block space-y-2 text-sm sm:col-span-2">
                <span className="block font-medium text-slate-600">Customer</span>
                <select
                  className={selectClassName}
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                >
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.phone ? ` · ${c.phone}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {tab === 'valuation' ? (
              <label className="block space-y-2 text-sm sm:col-span-2">
                <span className="block font-medium text-slate-600">Category (optional)</span>
                <CategorySelect
                  mode="filter"
                  value={valuationCategory}
                  onChange={setValuationCategory}
                  autoLoad
                  emptyLabel="All categories"
                />
              </label>
            ) : null}
            {tab === 'movements' ? (
              <label className="block space-y-2 text-sm sm:col-span-2">
                <span className="block font-medium text-slate-600">Movement type</span>
                <select
                  className={selectClassName}
                  value={movementType}
                  onChange={(e) => setMovementType(e.target.value)}
                >
                  <option value="all">All types</option>
                  {['PURCHASE', 'SALE', 'ADJUSTMENT', 'RETURN', 'REPAIR_USE', 'TRANSFER'].map((t) => (
                    <option key={t} value={t}>
                      {t.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
          </section>

          {(tab === 'sell' || tab === 'buy' || tab === 'valuation') && (
            <section className="space-y-3 border-t border-slate-100 pt-6">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">GST slab</p>
                <p className="mt-1 text-sm text-slate-500">
                  Complete for full register, or pick a % to export that slab only.
                </p>
              </div>
              <div className="flex flex-wrap gap-2.5">
                <button
                  type="button"
                  onClick={() => setGstRate('all')}
                  className={`rounded-full px-3.5 py-2 text-sm font-medium transition ${chipClass(gstRate === 'all', 'teal')}`}
                >
                  Complete
                </button>
                {Array.from(
                  new Set([
                    5,
                    12,
                    18,
                    28,
                    0,
                    40,
                    ...((sell?.summary?.byGstSlab as Array<{ gstRate: number }> | undefined)?.map(
                      (s) => s.gstRate,
                    ) ?? []),
                    ...((buy?.summary?.byGstSlab as Array<{ gstRate: number }> | undefined)?.map(
                      (s) => s.gstRate,
                    ) ?? []),
                  ]),
                )
                  .sort((a, b) => a - b)
                  .map((rate) => (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => setGstRate(String(rate))}
                      className={`rounded-full px-3.5 py-2 text-sm font-medium transition ${chipClass(
                        gstRate === String(rate),
                        'teal',
                      )}`}
                    >
                      {rate}%
                    </button>
                  ))}
              </div>
            </section>
          )}

          <section className="flex flex-wrap items-center gap-3 border-t border-slate-100 pt-6">
            <Button type="button" onClick={() => void load()} disabled={loading}>
              Refresh
            </Button>
            {tab !== 'rollups' ? (
              <ExportDropdown exporting={exporting} onExport={(f) => void exportReport(f)} />
            ) : null}
            {tab === 'itr' ? (
              <div className="flex flex-wrap gap-2.5">
                <Button type="button" variant="secondary" disabled={exporting} onClick={() => void exportItrAccounting('csv')}>
                  ITR summary CSV
                </Button>
                <Button type="button" variant="secondary" disabled={exporting} onClick={() => void exportItrAccounting('tally')}>
                  Tally XML
                </Button>
              </div>
            ) : null}
          </section>
        </div>
      </div>

      {loading ? <AppLoader label="Loading report…" /> : null}

      {!loading && tab === 'sell' && sell ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total amount" value={formatINR(toNumber(sellSummary?.netSales))} />
            <StatCard label="Invoices" value={String(sellSummary?.invoiceCount ?? 0)} />
            <StatCard label="Taxable" value={formatINR(toNumber(sellSummary?.taxable))} />
            <StatCard label="Tax" value={formatINR(toNumber(sellSummary?.totalTax))} />
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-4 text-sm text-slate-600 sm:px-6">
              <span className="font-medium text-slate-800">Sell report</span>
              <span className="mx-2 text-slate-300">·</span>
              {sell.period.label}
              {gstRate !== 'all' ? (
                <>
                  <span className="mx-2 text-slate-300">·</span>
                  GST {gstRate}%
                </>
              ) : null}
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr className="bg-white">
                    {[
                      'SN',
                      'Date',
                      'Name',
                      'GSTIN',
                      'QTY',
                      'Invoice No.',
                      'TaxAmount',
                      'CGST',
                      'SGST',
                      'Total Tax',
                      'Total Amount',
                    ].map((h) => (
                      <th key={h} className={`${tableHeaderClassName} whitespace-nowrap`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sell.entries.map((e, i) => (
                    <tr key={String(e.id)} className="hover:bg-slate-50/80">
                      <td className={`${tableCellClassName} tabular-nums`}>{Number(e.sn ?? i + 1)}</td>
                      <td className={`${tableCellClassName} whitespace-nowrap`}>{String(e.date)}</td>
                      <td className={tableCellClassName}>{String(e.name)}</td>
                      <td className={`${tableCellClassName} whitespace-nowrap font-mono text-xs`}>
                        {String(e.gstin || '—')}
                      </td>
                      <td className={`${tableCellClassName} whitespace-nowrap tabular-nums text-right`}>
                        {toNumber(e.qty)}
                      </td>
                      <td className={`${tableCellClassName} font-medium text-slate-900`}>
                        {String(e.invoiceNumber)}
                      </td>
                      <td className={`${tableCellClassName} whitespace-nowrap tabular-nums text-right`}>
                        {formatINR(toNumber(e.taxAmount ?? e.taxable))}
                      </td>
                      <td className={`${tableCellClassName} whitespace-nowrap tabular-nums text-right`}>
                        {formatINR(toNumber(e.cgst))}
                      </td>
                      <td className={`${tableCellClassName} whitespace-nowrap tabular-nums text-right`}>
                        {formatINR(toNumber(e.sgst))}
                      </td>
                      <td className={`${tableCellClassName} whitespace-nowrap tabular-nums text-right`}>
                        {formatINR(toNumber(e.totalTax ?? e.tax))}
                      </td>
                      <td className={`${tableCellClassName} whitespace-nowrap tabular-nums text-right font-medium text-slate-900`}>
                        {formatINR(toNumber(e.totalAmount))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {!loading && tab === 'buy' && buy ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Total amount" value={formatINR(toNumber(buySummary?.total))} />
            <StatCard label="Bills" value={String(buySummary?.billCount ?? 0)} />
            <StatCard label="Taxable" value={formatINR(toNumber(buySummary?.taxable))} />
            <StatCard label="Tax" value={formatINR(toNumber(buySummary?.tax))} />
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-4 text-sm text-slate-600 sm:px-6">
              <span className="font-medium text-slate-800">Buy report</span>
              <span className="mx-2 text-slate-300">·</span>
              {buy.period.label}
              {gstRate !== 'all' ? (
                <>
                  <span className="mx-2 text-slate-300">·</span>
                  GST {gstRate}%
                </>
              ) : null}
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr>
                    {[
                      'SN',
                      'Date',
                      'Name',
                      'GSTIN',
                      'QTY',
                      'Invoice No.',
                      'TaxAmount',
                      'CGST',
                      'SGST',
                      'Total Tax',
                      'Total Amount',
                    ].map((h) => (
                      <th key={h} className={`${tableHeaderClassName} whitespace-nowrap`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {buy.entries.map((e, i) => (
                    <tr key={String(e.id)} className="hover:bg-slate-50/80">
                      <td className={`${tableCellClassName} tabular-nums`}>{Number(e.sn ?? i + 1)}</td>
                      <td className={`${tableCellClassName} whitespace-nowrap`}>{String(e.date)}</td>
                      <td className={tableCellClassName}>{String(e.name)}</td>
                      <td className={`${tableCellClassName} whitespace-nowrap font-mono text-xs`}>
                        {String(e.gstin || '—')}
                      </td>
                      <td className={`${tableCellClassName} whitespace-nowrap tabular-nums text-right`}>
                        {toNumber(e.qty)}
                      </td>
                      <td className={`${tableCellClassName} font-medium text-slate-900`}>
                        {String(e.invoiceNumber)}
                      </td>
                      <td className={`${tableCellClassName} whitespace-nowrap tabular-nums text-right`}>
                        {formatINR(toNumber(e.taxAmount ?? e.taxable))}
                      </td>
                      <td className={`${tableCellClassName} whitespace-nowrap tabular-nums text-right`}>
                        {formatINR(toNumber(e.cgst))}
                      </td>
                      <td className={`${tableCellClassName} whitespace-nowrap tabular-nums text-right`}>
                        {formatINR(toNumber(e.sgst))}
                      </td>
                      <td className={`${tableCellClassName} whitespace-nowrap tabular-nums text-right`}>
                        {formatINR(toNumber(e.totalTax ?? e.tax))}
                      </td>
                      <td className={`${tableCellClassName} whitespace-nowrap tabular-nums text-right font-medium text-slate-900`}>
                        {formatINR(toNumber(e.totalAmount))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {!loading && tab === 'valuation' && valuation ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="SKUs" value={String(valuation.summary.skuCount ?? 0)} />
            <StatCard label="Qty" value={String(valuation.summary.stockQty ?? 0)} />
            <StatCard label="Cost value" value={formatINR(toNumber(valuation.summary.stockValueCost))} />
            <StatCard label="Sale value" value={formatINR(toNumber(valuation.summary.stockValueSale))} />
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-4 text-sm text-slate-600 sm:px-6">
              <span className="font-medium text-slate-800">Stock valuation</span>
              <span className="mx-2 text-slate-300">·</span>
              {valuation.period.label}
              {gstRate !== 'all' ? (
                <>
                  <span className="mx-2 text-slate-300">·</span>
                  GST {gstRate}%
                </>
              ) : null}
              {valuationCategory.trim() ? (
                <>
                  <span className="mx-2 text-slate-300">·</span>
                  {valuationCategory.trim()}
                </>
              ) : null}
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr>
                    {['SKU', 'Product', 'Category', 'GST %', 'Qty', 'Cost value', 'Sale value'].map((h) => (
                      <th key={h} className={`${tableHeaderClassName} whitespace-nowrap`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {valuation.entries.map((e) => (
                    <tr key={String(e.sku)} className="hover:bg-slate-50/80">
                      <td className={`${tableCellClassName} font-medium text-slate-900`}>{String(e.sku)}</td>
                      <td className={tableCellClassName}>{String(e.name)}</td>
                      <td className={tableCellClassName}>{String(e.category || '—')}</td>
                      <td className={`${tableCellClassName} tabular-nums`}>{String(e.gstRate)}%</td>
                      <td className={`${tableCellClassName} tabular-nums`}>{String(e.stockQty)}</td>
                      <td className={`${tableCellClassName} tabular-nums`}>{formatINR(toNumber(e.stockValueCost))}</td>
                      <td className={`${tableCellClassName} tabular-nums font-medium`}>
                        {formatINR(toNumber(e.stockValueSale))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {!loading && tab === 'movements' && movements ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Movements" value={String(movements.summary.movementCount ?? 0)} />
            <StatCard label="Qty in" value={String(movements.summary.qtyIn ?? 0)} />
            <StatCard label="Qty out" value={String(movements.summary.qtyOut ?? 0)} />
            <StatCard label="Period" value={movements.period.label} />
          </div>
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-4 text-sm text-slate-600 sm:px-6">
              <span className="font-medium text-slate-800">Stock movements</span>
              <span className="mx-2 text-slate-300">·</span>
              {movements.period.label}
              {movementType !== 'all' ? (
                <>
                  <span className="mx-2 text-slate-300">·</span>
                  {movementType.replace(/_/g, ' ')}
                </>
              ) : null}
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr>
                    {['Date', 'Type', 'SKU', 'Product', 'Category', 'GST %', 'Qty', 'Notes'].map((h) => (
                      <th key={h} className={`${tableHeaderClassName} whitespace-nowrap`}>
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {movements.entries.map((e, i) => (
                    <tr key={`${String(e.date)}-${String(e.sku)}-${i}`} className="hover:bg-slate-50/80">
                      <td className={`${tableCellClassName} whitespace-nowrap`}>{String(e.date)}</td>
                      <td className={tableCellClassName}>{String(e.type).replace(/_/g, ' ')}</td>
                      <td className={`${tableCellClassName} font-medium`}>{String(e.sku)}</td>
                      <td className={tableCellClassName}>{String(e.name)}</td>
                      <td className={tableCellClassName}>{String(e.category || '—')}</td>
                      <td className={`${tableCellClassName} tabular-nums`}>{String(e.gstRate)}%</td>
                      <td className={`${tableCellClassName} tabular-nums font-medium`}>{String(e.quantity)}</td>
                      <td className={tableCellClassName}>{String(e.notes || '—')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : null}

      {!loading && (tab === 'supplier' || tab === 'customer') && partyLedger ? (
        <div className="space-y-6">
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Opening" value={formatINR(toNumber(partyLedger.openingBalance))} />
            <StatCard label="Closing" value={formatINR(toNumber(partyLedger.closingBalance))} />
            <StatCard
              label="Outstanding"
              value={formatINR(toNumber(partyLedger.party.outstandingBalance))}
            />
            <StatCard label="Period" value={partyLedger.period.label} />
          </div>
          {partyLedger.aging ? (
            <Card className="border-slate-200 p-5 text-sm leading-relaxed text-slate-700 shadow-sm">
              Aging — 0–30: {formatINR(toNumber(partyLedger.aging.current))} · 31–60:{' '}
              {formatINR(toNumber(partyLedger.aging.days30))} · 61–90:{' '}
              {formatINR(toNumber(partyLedger.aging.days60))} · 90+:{' '}
              {formatINR(toNumber(partyLedger.aging.days90plus))}
            </Card>
          ) : null}
          <Card className="overflow-hidden border-slate-200 p-0 shadow-sm">
            <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-4 text-sm font-medium sm:px-6">
              {String(partyLedger.party.name)}
              {partyLedger.party.phone ? ` · ${String(partyLedger.party.phone)}` : ''}
              {partyLedger.party.gstin ? ` · ${String(partyLedger.party.gstin)}` : ''}
            </div>
            <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr>
                  {['Date', 'Type', 'Voucher', 'Debit', 'Credit', 'Balance'].map((h) => (
                    <th key={h} className={tableHeaderClassName}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {partyLedger.entries.map((e) => (
                  <tr key={String(e.id)} className="hover:bg-slate-50/80">
                    <td className={tableCellClassName}>{String(e.date)}</td>
                    <td className={tableCellClassName}>{String(e.type)}</td>
                    <td className={tableCellClassName}>{String(e.voucher)}</td>
                    <td className={tableCellClassName}>{formatINR(toNumber(e.debit))}</td>
                    <td className={tableCellClassName}>{formatINR(toNumber(e.credit))}</td>
                    <td className={tableCellClassName}>{formatINR(toNumber(e.balance))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </Card>
        </div>
      ) : null}

      {!loading && tab === 'itr' && itrPack ? (
        <div className="space-y-6">
          <p className="text-sm leading-relaxed text-amber-800">
            {String(itrPack.itr.disclaimer ?? 'Preparation only — share with your CA for filing.')}
          </p>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Gross turnover" value={formatINR(toNumber(itrPack.itr.grossTurnover))} />
            <StatCard label="Sell net (register)" value={formatINR(toNumber(itrPack.sell.summary.netSales))} />
            <StatCard label="Buy total (register)" value={formatINR(toNumber(itrPack.buy.summary.total))} />
            <StatCard label="Net profit" value={formatINR(toNumber(itrPack.itr.netProfit))} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Gross sales" value={formatINR(toNumber(itrPack.itr.grossSales))} />
            <StatCard label="Returns" value={formatINR(toNumber(itrPack.itr.returnsTotal))} />
            <StatCard label="Purchase (ITR)" value={formatINR(toNumber(itrPack.itr.purchaseTotal))} />
            <StatCard
              label="Presumptive 44AD"
              value={itrPack.itr.presumptiveEligible ? 'Eligible' : 'Not eligible'}
            />
          </div>
          <Card className="overflow-hidden border-slate-200 p-0 shadow-sm">
            <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-4 text-sm font-medium sm:px-6">
              Quarterly sell & buy — FY {itrPack.financialYear}
            </div>
            <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr>
                  {['Quarter', 'Sell net', 'Sell bills', 'Sell tax', 'Buy total', 'Buy bills', 'Buy tax'].map((h) => (
                    <th key={h} className={tableHeaderClassName}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {itrPack.quarters.map((q) => (
                  <tr key={String(q.quarter)} className="hover:bg-slate-50/80">
                    <td className={tableCellClassName}>{String(q.label)}</td>
                    <td className={tableCellClassName}>{formatINR(toNumber(q.sellNet))}</td>
                    <td className={tableCellClassName}>{String(q.sellInvoices ?? 0)}</td>
                    <td className={tableCellClassName}>{formatINR(toNumber(q.sellTax))}</td>
                    <td className={tableCellClassName}>{formatINR(toNumber(q.buyTotal))}</td>
                    <td className={tableCellClassName}>{String(q.buyBills ?? 0)}</td>
                    <td className={tableCellClassName}>{formatINR(toNumber(q.buyTax))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </Card>
          <Card className="space-y-3 border-slate-200 p-5 text-sm leading-relaxed text-slate-600 shadow-sm">
            <p>
              Excel pack includes <strong>ITR Summary</strong>, <strong>Quarterly</strong>, full{' '}
              <strong>Sell</strong> register, and full <strong>Buy</strong> register for this FY.
            </p>
            <p>Use period chips Q1–Q4 on Sell/Buy tabs for a single quarter register export.</p>
          </Card>
        </div>
      ) : null}

      {!loading && tab === 'rollups' && rollups ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card className="overflow-hidden border-slate-200 p-0 shadow-sm">
            <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-4 font-medium sm:px-6">Payment mix</div>
            <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr>
                  <th className={tableHeaderClassName}>Method</th>
                  <th className={tableHeaderClassName}>Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {((rollups.sell as { byPayment?: Array<{ method: string; amount: number }> })?.byPayment ?? []).map(
                  (r) => (
                    <tr key={r.method} className="hover:bg-slate-50/80">
                      <td className={tableCellClassName}>{r.method}</td>
                      <td className={tableCellClassName}>{formatINR(r.amount)}</td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
            </div>
          </Card>
          <Card className="overflow-hidden border-slate-200 p-0 shadow-sm">
            <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-4 font-medium sm:px-6">HSN taxable</div>
            <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr>
                  <th className={tableHeaderClassName}>HSN</th>
                  <th className={tableHeaderClassName}>Taxable</th>
                  <th className={tableHeaderClassName}>Qty</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {((rollups.sell as { byHsn?: Array<{ hsn: string; taxable: number; qty: number }> })?.byHsn ?? [])
                  .slice(0, 40)
                  .map((r) => (
                    <tr key={r.hsn} className="hover:bg-slate-50/80">
                      <td className={tableCellClassName}>{r.hsn}</td>
                      <td className={tableCellClassName}>{formatINR(r.taxable)}</td>
                      <td className={tableCellClassName}>{r.qty}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            </div>
          </Card>
          <Card className="overflow-hidden border-slate-200 p-0 shadow-sm">
            <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-4 font-medium sm:px-6">By branch</div>
            <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr>
                  <th className={tableHeaderClassName}>Branch</th>
                  <th className={tableHeaderClassName}>Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {((rollups.sell as { byBranch?: Array<{ branch: string; amount: number }> })?.byBranch ?? []).map(
                  (r) => (
                    <tr key={r.branch} className="hover:bg-slate-50/80">
                      <td className={tableCellClassName}>{r.branch}</td>
                      <td className={tableCellClassName}>{formatINR(r.amount)}</td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
            </div>
          </Card>
          <Card className="overflow-hidden border-slate-200 p-0 shadow-sm">
            <div className="border-b border-slate-100 bg-slate-50/60 px-5 py-4 font-medium sm:px-6">Buy by supplier</div>
            <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr>
                  <th className={tableHeaderClassName}>Supplier</th>
                  <th className={tableHeaderClassName}>Bills</th>
                  <th className={tableHeaderClassName}>Total</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(
                  (rollups.buy as { bySupplier?: Array<{ supplier: string; count: number; total: number }> })
                    ?.bySupplier ?? []
                ).map((r) => (
                  <tr key={r.supplier} className="hover:bg-slate-50/80">
                    <td className={tableCellClassName}>{r.supplier}</td>
                    <td className={tableCellClassName}>{r.count}</td>
                    <td className={tableCellClassName}>{formatINR(r.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}
