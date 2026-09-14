'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, formatINR } from '@retail-sarathi/ui';
import { apiWithAuth } from '@/lib/helpers';
import {
  pageShellClassName,
  EmptyState,
  MessageBanner,
  PageHeader,
  cn,
  formatDate,
  inputClassName,
  parseError,
  selectClassName,
  tableCellClassName,
  tableHeaderClassName,
} from '../_components/dashboard-ui';
import { SupplierSelect, type SupplierOption } from '../_components/supplier-select';

type Bill = {
  id: string;
  invoiceNumber: string;
  invoiceDate: string | null;
  dueDate?: string | null;
  gstin?: string | null;
  createdAt: string;
  supplierName?: string | null;
  subtotal?: number | string;
  taxAmount?: number | string;
  totalAmount: number | string;
  paidAmount: number | string;
  dueAmount?: number;
  overdueDays?: number;
  agingBucket?: string;
  missingFields?: string[];
  status: string;
  billImageName?: string | null;
  supplier?: { id: string; name: string; gstin?: string | null } | null;
  createdBy?: { id: string; name: string } | null;
  _count?: { lines: number };
};

type Summary = {
  billCount: number;
  unpaidCount: number;
  overdueCount: number;
  totalBilled: number;
  totalPaid: number;
  totalDue: number;
  taxTotal: number;
  aging: {
    current: number;
    days30: number;
    days60: number;
    days90: number;
    days90plus: number;
  };
};

type TeamUser = { id: string; name: string; email: string };

type Filters = {
  q: string;
  supplierId: string;
  /** Legacy URL support — used only when supplierId is empty */
  supplierName: string;
  dateFrom: string;
  dateTo: string;
  createdByUserId: string;
  status: string;
  unpaidOnly: string;
  agingBucket: string;
};

const STATUS_OPTS = [
  { value: '', label: 'Active (excl. void)' },
  { value: 'POSTED', label: 'Posted / unpaid' },
  { value: 'PARTIALLY_PAID', label: 'Partially paid' },
  { value: 'PAID', label: 'Paid' },
  { value: 'CANCELLED', label: 'Voided only' },
];

const AGING_OPTS = [
  { value: '', label: 'All ages' },
  { value: 'CURRENT', label: 'Not yet due' },
  { value: 'DUE_0_30', label: 'Overdue 1–30d' },
  { value: 'DUE_31_60', label: 'Overdue 31–60d' },
  { value: 'DUE_61_90', label: 'Overdue 61–90d' },
  { value: 'DUE_90_PLUS', label: 'Overdue 90d+' },
];

const FIELD_LABELS: Record<string, string> = {
  invoiceNumber: 'Invoice #',
  invoiceDate: 'Date',
  supplier: 'Supplier',
  gstin: 'GSTIN',
  totalAmount: 'Total',
  items: 'Items',
  totalsMismatch: 'Totals',
};

function filtersFromParams(params: URLSearchParams): Filters {
  return {
    q: params.get('q') || params.get('search') || '',
    supplierId: params.get('supplierId') || '',
    supplierName: params.get('supplierName') || '',
    dateFrom: params.get('dateFrom') || '',
    dateTo: params.get('dateTo') || '',
    createdByUserId: params.get('createdByUserId') || '',
    status: params.get('status') || '',
    unpaidOnly: params.get('unpaidOnly') || '',
    agingBucket: params.get('agingBucket') || '',
  };
}

function buildQuery(filters: Filters) {
  const params = new URLSearchParams();
  if (filters.q.trim()) params.set('q', filters.q.trim());
  if (filters.supplierId.trim()) params.set('supplierId', filters.supplierId.trim());
  else if (filters.supplierName.trim()) params.set('supplierName', filters.supplierName.trim());
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  if (filters.createdByUserId) params.set('createdByUserId', filters.createdByUserId);
  if (filters.status) params.set('status', filters.status);
  if (filters.unpaidOnly === '1') params.set('unpaidOnly', '1');
  if (filters.agingBucket) params.set('agingBucket', filters.agingBucket);
  if (filters.status === 'CANCELLED') params.set('includeCancelled', 'true');
  return params.toString();
}

function statusTone(status: string) {
  if (status === 'PAID') return 'bg-teal-50 text-teal-800 border-teal-200';
  if (status === 'PARTIALLY_PAID') return 'bg-amber-50 text-amber-900 border-amber-200';
  if (status === 'CANCELLED') return 'bg-slate-100 text-slate-600 border-slate-200';
  return 'bg-orange-50 text-orange-900 border-orange-200';
}

function agingTone(bucket?: string) {
  if (!bucket || bucket === 'PAID') return 'bg-slate-50 text-slate-600 border-slate-200';
  if (bucket === 'CURRENT') return 'bg-teal-50 text-teal-800 border-teal-200';
  if (bucket === 'DUE_0_30') return 'bg-amber-50 text-amber-900 border-amber-200';
  if (bucket === 'DUE_31_60') return 'bg-orange-50 text-orange-900 border-orange-200';
  return 'bg-rose-50 text-rose-900 border-rose-200';
}

function agingLabel(bucket?: string) {
  switch (bucket) {
    case 'CURRENT':
      return 'Not due';
    case 'DUE_0_30':
      return '1–30d overdue';
    case 'DUE_31_60':
      return '31–60d';
    case 'DUE_61_90':
      return '61–90d';
    case 'DUE_90_PLUS':
      return '90d+';
    case 'PAID':
      return 'Settled';
    default:
      return '—';
  }
}

const EMPTY_FILTERS: Filters = {
  q: '',
  supplierId: '',
  supplierName: '',
  dateFrom: '',
  dateTo: '',
  createdByUserId: '',
  status: '',
  unpaidOnly: '',
  agingBucket: '',
};

export default function PurchaseBillsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [bills, setBills] = useState<Bill[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [users, setUsers] = useState<TeamUser[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierOption[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>(() => filtersFromParams(searchParams));
  const [searchDraft, setSearchDraft] = useState(() => filtersFromParams(searchParams).q);
  const [filtersOpen, setFiltersOpen] = useState(false);

  async function loadBills(nextFilters = filters) {
    try {
      setLoading(true);
      setError('');
      const qs = buildQuery(nextFilters);
      const data = await apiWithAuth<{ items: Bill[]; summary: Summary }>(
        `/purchase-bills${qs ? `?${qs}` : ''}`,
      );
      setBills(data.items || []);
      setSummary(data.summary || null);
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const next = filtersFromParams(searchParams);
    setFilters(next);
    setSearchDraft(next.q);
    void loadBills(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    void (async () => {
      try {
        const [userList, supplierList] = await Promise.all([
          apiWithAuth<TeamUser[]>('/users').catch(() => [] as TeamUser[]),
          apiWithAuth<SupplierOption[]>('/suppliers').catch(() => [] as SupplierOption[]),
        ]);
        setUsers(userList);
        setSuppliers(supplierList);
      } catch {
        /* optional */
      }
    })();
  }, []);

  // Resolve legacy ?supplierName= into supplierId when master list loads
  useEffect(() => {
    if (filters.supplierId || !filters.supplierName.trim() || !suppliers.length) return;
    const needle = filters.supplierName.trim().toLowerCase();
    const hit = suppliers.find((s) => s.name.trim().toLowerCase() === needle);
    if (hit) {
      applyFilters({ ...filters, supplierId: hit.id, supplierName: '' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [suppliers]);

  function applyFilters(next: Filters) {
    setFilters(next);
    setSearchDraft(next.q);
    const qs = buildQuery(next);
    router.replace(qs ? `/dashboard/purchase-bills?${qs}` : '/dashboard/purchase-bills');
  }

  function clearFilters() {
    applyFilters({ ...EMPTY_FILTERS });
  }

  function runSearch(q = searchDraft) {
    applyFilters({ ...filters, q: q.trim() });
  }

  const hasAdvancedFilters = Boolean(
    filters.supplierId ||
      filters.supplierName.trim() ||
      filters.dateFrom ||
      filters.dateTo ||
      filters.createdByUserId ||
      filters.status ||
      filters.unpaidOnly ||
      filters.agingBucket,
  );

  const hasFilters = Boolean(filters.q.trim() || hasAdvancedFilters);

  const selectedSupplierName =
    suppliers.find((s) => s.id === filters.supplierId)?.name ||
    filters.supplierName.trim() ||
    '';

  return (
    <div className={pageShellClassName}>
      <PageHeader
        title="Purchase bills"
        description="Supplier GST invoices with tax split, due dates, and payables aging. Created on stock-in when invoice # is set."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/suppliers">
              <Button type="button" variant="secondary">
                Suppliers
              </Button>
            </Link>
            <Link href="/dashboard/stock-in">
              <Button type="button" variant="secondary">
                Stock-in
              </Button>
            </Link>
            <Button type="button" variant="secondary" onClick={() => void loadBills()}>
              Refresh
            </Button>
          </div>
        }
      />
      {error ? <MessageBanner tone="error">{error}</MessageBanner> : null}

      {summary ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card className="border-slate-200 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Due now</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{formatINR(summary.totalDue)}</p>
            <p className="mt-1 text-xs text-slate-500">
              {summary.unpaidCount} unpaid · {summary.overdueCount} overdue
            </p>
          </Card>
          <Card className="border-slate-200 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Billed (view)</p>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{formatINR(summary.totalBilled)}</p>
            <p className="mt-1 text-xs text-slate-500">
              Paid {formatINR(summary.totalPaid)} · Tax {formatINR(summary.taxTotal)}
            </p>
          </Card>
          <Card className="border-slate-200 p-4 sm:col-span-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Aging (due)</p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              {(
                [
                  ['Not due', summary.aging.current, 'CURRENT'],
                  ['1–30d', summary.aging.days30, 'DUE_0_30'],
                  ['31–60d', summary.aging.days60, 'DUE_31_60'],
                  ['61–90d', summary.aging.days90, 'DUE_61_90'],
                  ['90d+', summary.aging.days90plus, 'DUE_90_PLUS'],
                ] as const
              ).map(([label, amt, bucket]) => (
                <button
                  key={bucket}
                  type="button"
                  className={cn(
                    'rounded-lg border px-2.5 py-1.5 text-left transition hover:bg-slate-50',
                    filters.agingBucket === bucket ? 'border-teal-500 bg-teal-50' : 'border-slate-200',
                  )}
                  onClick={() =>
                    applyFilters({
                      ...filters,
                      agingBucket: filters.agingBucket === bucket ? '' : bucket,
                      unpaidOnly: '1',
                    })
                  }
                >
                  <span className="block font-semibold text-slate-800">{label}</span>
                  <span className="text-slate-600">{formatINR(amt)}</span>
                </button>
              ))}
            </div>
          </Card>
        </div>
      ) : null}

      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[14rem] flex-1 space-y-1 text-sm font-medium text-slate-700">
            <span>Search</span>
            <input
              className={inputClassName}
              value={searchDraft}
              onChange={(e) => setSearchDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  runSearch();
                }
              }}
              placeholder="Invoice #, GSTIN, IRN, product, HSN…"
            />
          </label>
          <Button type="button" onClick={() => runSearch()}>
            Search
          </Button>
          <button
            type="button"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
          >
            Filters
            {hasAdvancedFilters && !filtersOpen ? (
              <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-800">
                On
              </span>
            ) : null}
            <span className="text-slate-400" aria-hidden>
              {filtersOpen ? '▾' : '▸'}
            </span>
          </button>
          <p className="pb-2 text-xs text-slate-500">{bills.length} shown</p>
        </div>

        {filtersOpen ? (
          <div className="space-y-3 border-t border-slate-100 pt-3">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="space-y-1 text-sm font-medium text-slate-700 sm:col-span-2">
                <span>Supplier</span>
                <SupplierSelect
                  value={filters.supplierId}
                  suppliers={suppliers}
                  onChange={(supplierId) =>
                    setFilters((f) => ({ ...f, supplierId, supplierName: '' }))
                  }
                  placeholder="Search supplier by name, GSTIN, or phone…"
                />
              </label>
              <label className="space-y-1 text-sm font-medium text-slate-700">
                <span>From date</span>
                <input
                  type="date"
                  className={inputClassName}
                  value={filters.dateFrom}
                  onChange={(e) => setFilters((f) => ({ ...f, dateFrom: e.target.value }))}
                />
              </label>
              <label className="space-y-1 text-sm font-medium text-slate-700">
                <span>To date</span>
                <input
                  type="date"
                  className={inputClassName}
                  value={filters.dateTo}
                  onChange={(e) => setFilters((f) => ({ ...f, dateTo: e.target.value }))}
                />
              </label>
              <label className="space-y-1 text-sm font-medium text-slate-700">
                <span>Status</span>
                <select
                  className={selectClassName}
                  value={filters.status}
                  onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
                >
                  {STATUS_OPTS.map((o) => (
                    <option key={o.value || 'all'} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm font-medium text-slate-700">
                <span>Aging</span>
                <select
                  className={selectClassName}
                  value={filters.agingBucket}
                  onChange={(e) => setFilters((f) => ({ ...f, agingBucket: e.target.value }))}
                >
                  {AGING_OPTS.map((o) => (
                    <option key={o.value || 'all'} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm font-medium text-slate-700">
                <span>Created by</span>
                <select
                  className={selectClassName}
                  value={filters.createdByUserId}
                  onChange={(e) => setFilters((f) => ({ ...f, createdByUserId: e.target.value }))}
                >
                  <option value="">All users</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-end gap-2 pb-2.5 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-500"
                  checked={filters.unpaidOnly === '1'}
                  onChange={(e) =>
                    setFilters((f) => ({ ...f, unpaidOnly: e.target.checked ? '1' : '' }))
                  }
                />
                Unpaid only
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={() => applyFilters({ ...filters, q: searchDraft.trim() })}>
                Apply filters
              </Button>
              <Button type="button" variant="secondary" disabled={!hasFilters} onClick={clearFilters}>
                Clear
              </Button>
            </div>
            <p className="text-xs text-slate-500">
              Dates use invoice date (fallback created). Aging uses due date. Search covers invoice #,
              GSTIN, IRN, supplier, line items.
            </p>
          </div>
        ) : hasAdvancedFilters ? (
          <p className="text-xs text-slate-500">
            Active filters
            {selectedSupplierName ? ` · ${selectedSupplierName}` : ''}
            {filters.unpaidOnly === '1' ? ' · unpaid' : ''}
            {filters.status ? ` · ${filters.status}` : ''}
            {filters.agingBucket ? ` · ${agingLabel(filters.agingBucket)}` : ''}
            {filters.dateFrom || filters.dateTo
              ? ` · ${filters.dateFrom || '…'} – ${filters.dateTo || '…'}`
              : ''}
          </p>
        ) : null}
      </div>

      {loading ? (
        <p className="text-sm text-slate-500">Loading purchase bills…</p>
      ) : bills.length === 0 ? (
        <EmptyState
          title={hasFilters ? 'No bills match these filters' : 'No purchase bills yet'}
          description={
            hasFilters
              ? 'Try another search or clear filters.'
              : 'Go to Stock-in, parse a supplier invoice, and confirm — products share one bill by invoice number.'
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className={tableHeaderClassName}>Invoice</th>
                <th className={tableHeaderClassName}>Supplier</th>
                <th className={tableHeaderClassName}>Taxable / Tax</th>
                <th className={tableHeaderClassName}>Total</th>
                <th className={tableHeaderClassName}>Due</th>
                <th className={tableHeaderClassName}>Aging</th>
                <th className={tableHeaderClassName}>Status</th>
              </tr>
            </thead>
            <tbody>
              {bills.map((b) => {
                const due = b.dueAmount ?? Math.max(0, Number(b.totalAmount) - Number(b.paidAmount));
                return (
                  <tr key={b.id} className="border-t border-slate-100">
                    <td className={tableCellClassName}>
                      <Link
                        href={`/dashboard/purchase-bills/${b.id}`}
                        className="font-medium text-teal-700 underline"
                      >
                        {b.invoiceNumber}
                      </Link>
                      <div className="text-xs text-slate-500">
                        {formatDate(b.invoiceDate || b.createdAt)}
                        {b._count?.lines != null ? ` · ${b._count.lines} lines` : ''}
                        {b.createdBy?.name ? ` · ${b.createdBy.name}` : ''}
                      </div>
                      {b.missingFields?.length ? (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {b.missingFields.map((f) => (
                            <span
                              key={f}
                              className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-900"
                            >
                              {FIELD_LABELS[f] || f}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </td>
                    <td className={tableCellClassName}>
                      {b.supplier?.id ? (
                        <Link
                          href={`/dashboard/suppliers/${b.supplier.id}`}
                          className="font-medium text-teal-700 underline"
                        >
                          {b.supplier.name}
                        </Link>
                      ) : (
                        b.supplierName || '—'
                      )}
                      <div className="text-xs text-slate-500">{b.gstin || b.supplier?.gstin || '—'}</div>
                    </td>
                    <td className={tableCellClassName}>
                      {formatINR(Number(b.subtotal || 0))}
                      <div className="text-xs text-slate-500">Tax {formatINR(Number(b.taxAmount || 0))}</div>
                    </td>
                    <td className={tableCellClassName}>{formatINR(Number(b.totalAmount))}</td>
                    <td className={tableCellClassName}>
                      <span className={due > 0.009 ? 'font-semibold text-rose-700' : 'text-teal-800'}>
                        {formatINR(due)}
                      </span>
                      <div className="text-xs text-slate-500">
                        Paid {formatINR(Number(b.paidAmount))}
                        {b.dueDate ? ` · due ${formatDate(b.dueDate)}` : ''}
                      </div>
                    </td>
                    <td className={tableCellClassName}>
                      <span
                        className={cn(
                          'inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                          agingTone(b.agingBucket),
                        )}
                      >
                        {agingLabel(b.agingBucket)}
                      </span>
                    </td>
                    <td className={tableCellClassName}>
                      <span
                        className={cn(
                          'inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                          statusTone(b.status),
                        )}
                      >
                        {b.status.replaceAll('_', ' ')}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
