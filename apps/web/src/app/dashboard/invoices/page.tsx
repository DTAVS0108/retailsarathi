'use client';
import { AppLoader } from '@/app/_components/app-loader';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Card, formatINR } from '@retail-sarathi/ui';
import { apiWithAuth } from '@/lib/helpers';
import { InvoicePrintPanel } from '../_components/invoice-print-panel';
import { pageShellClassName,
  EmptyState,
  MessageBanner,
  PageHeader,
  StatusBadge,
  cn,
  formatDateTime,
  inputClassName,
  parseError,
  selectClassName,
  tableCellClassName,
  tableHeaderClassName,
  toNumber,
} from '../_components/dashboard-ui';
import { ScrollableTabBar } from '../_components/scrollable-tab-bar';

interface Invoice {
  id: string;
  invoiceNumber: string;
  type?: string;
  grandTotal: number;
  status: string;
  createdAt: string;
  updatedAt?: string;
  customer?: {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    gstin?: string | null;
  } | null;
  payments?: Array<{ method: string; amount: number }>;
  lines?: Array<{ quantity: number }>;
}

interface InvoiceResponse {
  items: Invoice[];
  total?: number;
  page?: number;
  pageSize?: number;
}

const STATUS_OPTIONS = ['ALL', 'FINALIZED', 'DRAFT', 'CANCELLED'] as const;
const TYPE_OPTIONS = [
  { value: '', label: 'All types' },
  { value: 'TAX_INVOICE', label: 'Tax invoice' },
  { value: 'CREDIT_NOTE', label: 'Credit note' },
  { value: 'BILL_OF_SUPPLY', label: 'Bill of supply' },
  { value: 'DELIVERY_CHALLAN', label: 'Delivery challan' },
] as const;
const PAYMENT_OPTIONS = [
  { value: '', label: 'All modes' },
  { value: 'CASH', label: 'Cash' },
  { value: 'UPI', label: 'UPI' },
  { value: 'CARD', label: 'Card' },
  { value: 'CREDIT', label: 'Credit / udhaar' },
  { value: 'BANK_TRANSFER', label: 'Bank transfer' },
] as const;
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'invoiceNumber',
  'grandTotal',
  'status',
  'type',
  'customer',
] as const;
type SortField = (typeof SORT_FIELDS)[number];
type SortDir = 'asc' | 'desc';
type ViewMode = 'table' | 'cards';

type Filters = {
  status: string;
  search: string;
  dateFrom: string;
  dateTo: string;
  type: string;
  paymentMethod: string;
  page: number;
  pageSize: number;
  view: ViewMode;
  sortBy: SortField;
  sortDir: SortDir;
};

function parsePageSize(raw: string | null) {
  const n = Number(raw);
  return PAGE_SIZE_OPTIONS.includes(n as (typeof PAGE_SIZE_OPTIONS)[number]) ? n : 25;
}

function parseSortBy(raw: string | null): SortField {
  return SORT_FIELDS.includes(raw as SortField) ? (raw as SortField) : 'createdAt';
}

function filtersFromParams(params: URLSearchParams): Filters {
  const statusParam = (params.get('status') || 'ALL').toUpperCase();
  const status = STATUS_OPTIONS.includes(statusParam as (typeof STATUS_OPTIONS)[number])
    ? statusParam
    : 'ALL';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const viewParam = params.get('view');
  const view: ViewMode = viewParam === 'cards' ? 'cards' : 'table';
  return {
    status,
    search: params.get('search') || '',
    dateFrom: params.get('dateFrom') || '',
    dateTo: params.get('dateTo') || '',
    type: params.get('type') || '',
    paymentMethod: params.get('paymentMethod') || '',
    page,
    pageSize: parsePageSize(params.get('pageSize')),
    view,
    sortBy: parseSortBy(params.get('sortBy')),
    sortDir: params.get('sortDir') === 'asc' ? 'asc' : 'desc',
  };
}

function buildQuery(filters: Filters) {
  const params = new URLSearchParams();
  params.set('page', String(filters.page));
  params.set('pageSize', String(filters.pageSize));
  params.set('sortBy', filters.sortBy);
  params.set('sortDir', filters.sortDir);
  if (filters.status && filters.status !== 'ALL') params.set('status', filters.status);
  if (filters.search.trim()) params.set('search', filters.search.trim());
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  if (filters.type) params.set('type', filters.type);
  if (filters.paymentMethod) params.set('paymentMethod', filters.paymentMethod);
  return params.toString();
}

function buildUrlQuery(filters: Filters) {
  const params = new URLSearchParams();
  if (filters.status && filters.status !== 'ALL') params.set('status', filters.status);
  if (filters.search.trim()) params.set('search', filters.search.trim());
  if (filters.dateFrom) params.set('dateFrom', filters.dateFrom);
  if (filters.dateTo) params.set('dateTo', filters.dateTo);
  if (filters.type) params.set('type', filters.type);
  if (filters.paymentMethod) params.set('paymentMethod', filters.paymentMethod);
  if (filters.page > 1) params.set('page', String(filters.page));
  if (filters.pageSize !== 25) params.set('pageSize', String(filters.pageSize));
  if (filters.view !== 'table') params.set('view', filters.view);
  if (filters.sortBy !== 'createdAt') params.set('sortBy', filters.sortBy);
  if (filters.sortDir !== 'desc') params.set('sortDir', filters.sortDir);
  return params.toString();
}

function typeLabel(type?: string) {
  if (!type || type === 'TAX_INVOICE') return null;
  return TYPE_OPTIONS.find((t) => t.value === type)?.label ?? type;
}

function pageWindow(current: number, totalPages: number) {
  const pages: number[] = [];
  const start = Math.max(1, current - 2);
  const end = Math.min(totalPages, start + 4);
  for (let p = Math.max(1, end - 4); p <= end; p += 1) pages.push(p);
  return pages;
}

export default function InvoicesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<Filters>(() => filtersFromParams(searchParams));
  const [searchDraft, setSearchDraft] = useState(() => filtersFromParams(searchParams).search);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function loadInvoices(next = filters) {
    try {
      setLoading(true);
      setError('');
      const response = await apiWithAuth<InvoiceResponse>(`/invoices?${buildQuery(next)}`);
      const matched = response.total ?? response.items.length;
      const pages = Math.max(1, Math.ceil(matched / next.pageSize));
      if (next.page > pages) {
        applyFilters({ ...next, page: pages }, { keepPage: true });
        return;
      }
      setInvoices(response.items);
      setTotal(matched);
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const next = filtersFromParams(searchParams);
    setFilters(next);
    setSearchDraft(next.search);
    void loadInvoices(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  function applyFilters(next: Filters, opts?: { keepPage?: boolean }) {
    const normalized: Filters = {
      ...next,
      page: opts?.keepPage ? Math.max(1, next.page) : 1,
    };
    setFilters(normalized);
    setSearchDraft(normalized.search);
    const qs = buildUrlQuery(normalized);
    router.replace(qs ? `/dashboard/invoices?${qs}` : '/dashboard/invoices');
  }

  function applyStatus(nextStatus: string) {
    applyFilters({ ...filters, status: nextStatus });
  }

  function goToPage(page: number) {
    applyFilters({ ...filters, page }, { keepPage: true });
  }

  function toggleSort(field: SortField) {
    if (filters.sortBy === field) {
      applyFilters({
        ...filters,
        search: searchDraft,
        sortDir: filters.sortDir === 'asc' ? 'desc' : 'asc',
      });
      return;
    }
    applyFilters({
      ...filters,
      search: searchDraft,
      sortBy: field,
      sortDir: field === 'invoiceNumber' || field === 'customer' ? 'asc' : 'desc',
    });
  }

  function SortHeader({
    field,
    label,
    className,
  }: {
    field: SortField;
    label: string;
    className?: string;
  }) {
    const active = filters.sortBy === field;
    return (
      <th className={cn(tableHeaderClassName, className)}>
        <button
          type="button"
          className={cn(
            'inline-flex items-center gap-1 uppercase tracking-wide transition hover:text-slate-800',
            active ? 'text-slate-900' : 'text-slate-500',
          )}
          onClick={() => toggleSort(field)}
        >
          <span>{label}</span>
          <span className="text-[10px] tabular-nums" aria-hidden>
            {active ? (filters.sortDir === 'asc' ? '▲' : '▼') : '◇'}
          </span>
        </button>
      </th>
    );
  }

  function clearFilters() {
    applyFilters({
      status: 'ALL',
      search: '',
      dateFrom: '',
      dateTo: '',
      type: '',
      paymentMethod: '',
      page: 1,
      pageSize: filters.pageSize,
      view: filters.view,
      sortBy: 'createdAt',
      sortDir: 'desc',
    });
  }

  const hasExtraFilters = Boolean(
    filters.search.trim() ||
      filters.dateFrom ||
      filters.dateTo ||
      filters.type ||
      filters.paymentMethod,
  );

  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));
  const rangeFrom = total === 0 ? 0 : (filters.page - 1) * filters.pageSize + 1;
  const rangeTo = Math.min(total, filters.page * filters.pageSize);

  const finalizedCount = useMemo(
    () => invoices.filter((invoice) => invoice.status === 'FINALIZED').length,
    [invoices],
  );
  const grossSales = useMemo(
    () =>
      invoices
        .filter((invoice) => invoice.status === 'FINALIZED' && invoice.type !== 'CREDIT_NOTE')
        .reduce((sum, invoice) => sum + toNumber(invoice.grandTotal), 0),
    [invoices],
  );

  return (
    <div className={pageShellClassName}>
      <PageHeader
        title="Invoices"
        description="Search and filter bills by customer, date, type, or payment — then open any invoice for tax and print details."
      />

      {error ? <MessageBanner tone="error">{error}</MessageBanner> : null}

      <section className="grid gap-3 sm:gap-4 sm:grid-cols-3">
        <Card className="border-slate-200">
          <p className="text-xs font-medium text-slate-500 sm:text-sm">Matching invoices</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900 sm:mt-2 sm:text-3xl">{total}</p>
        </Card>
        <Card className="border-slate-200">
          <p className="text-xs font-medium text-slate-500 sm:text-sm">Finalized in view</p>
          <p className="mt-1 text-2xl font-semibold text-emerald-600 sm:mt-2 sm:text-3xl">{finalizedCount}</p>
        </Card>
        <Card className="border-slate-200">
          <p className="text-xs font-medium text-slate-500 sm:text-sm">Gross billed (finalized)</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900 sm:mt-2 sm:text-3xl">{formatINR(grossSales)}</p>
        </Card>
      </section>

      <Card className="border-slate-200">
        <div className="mb-4 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Billing history</h2>
            <p className="text-sm text-slate-500">
              Filter by status, date range, invoice type, or payment method.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-end">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-medium uppercase tracking-wide text-slate-500">View</span>
              <Button
                type="button"
                size="sm"
                variant={filters.view === 'table' ? 'primary' : 'secondary'}
                className="hidden sm:inline-flex"
                onClick={() => applyFilters({ ...filters, view: 'table', search: searchDraft }, { keepPage: true })}
              >
                Table
              </Button>
              <Button
                type="button"
                size="sm"
                variant={filters.view === 'cards' ? 'primary' : 'secondary'}
                onClick={() => applyFilters({ ...filters, view: 'cards', search: searchDraft }, { keepPage: true })}
              >
                Cards
              </Button>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <span className="whitespace-nowrap">Sort</span>
              <select
                className={`${selectClassName} w-auto min-w-[11rem]`}
                value={`${filters.sortBy}:${filters.sortDir}`}
                onChange={(e) => {
                  const [sortBy, sortDir] = e.target.value.split(':') as [SortField, SortDir];
                  applyFilters({
                    ...filters,
                    search: searchDraft,
                    sortBy,
                    sortDir,
                  });
                }}
              >
                <option value="createdAt:desc">Generated at (newest)</option>
                <option value="createdAt:asc">Generated at (oldest)</option>
                <option value="updatedAt:desc">Updated at (newest)</option>
                <option value="updatedAt:asc">Updated at (oldest)</option>
                <option value="invoiceNumber:asc">Invoice # A–Z</option>
                <option value="invoiceNumber:desc">Invoice # Z–A</option>
                <option value="grandTotal:desc">Amount (high)</option>
                <option value="grandTotal:asc">Amount (low)</option>
                <option value="customer:asc">Customer A–Z</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <span className="whitespace-nowrap">Rows</span>
              <select
                className={`${selectClassName} w-auto min-w-[7rem]`}
                value={filters.pageSize}
                onChange={(e) =>
                  applyFilters({
                    ...filters,
                    search: searchDraft,
                    pageSize: Number(e.target.value),
                    page: 1,
                  })
                }
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n} / page
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <ScrollableTabBar
            tabs={STATUS_OPTIONS.map((status) => ({
              id: status,
              label: status === 'ALL' ? 'All' : status.charAt(0) + status.slice(1).toLowerCase(),
            }))}
            active={filters.status}
            onChange={applyStatus}
            className="lg:hidden"
          />
          <div className="hidden flex-wrap gap-2 lg:flex">
            {STATUS_OPTIONS.map((status) => (
              <Button
                key={status}
                type="button"
                variant={filters.status === status ? 'primary' : 'secondary'}
                onClick={() => applyStatus(status)}
              >
                {status === 'ALL' ? 'All' : status}
              </Button>
            ))}
          </div>
        </div>

        <div className="mb-6 rounded-xl border border-slate-100 bg-slate-50/80 p-4">
          <div className="mb-4">
            <p className="mb-2 text-sm font-medium text-slate-700">Payment mode</p>
            <div className="flex flex-wrap gap-2">
              {PAYMENT_OPTIONS.map((opt) => {
                const active = (filters.paymentMethod || '') === opt.value;
                return (
                  <Button
                    key={opt.value || 'all-pay'}
                    type="button"
                    size="sm"
                    variant={active ? 'primary' : 'secondary'}
                    onClick={() =>
                      applyFilters({
                        ...filters,
                        search: searchDraft,
                        paymentMethod: opt.value,
                      })
                    }
                  >
                    {opt.label}
                  </Button>
                );
              })}
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <label className="space-y-1 text-sm font-medium text-slate-700 sm:col-span-2 xl:col-span-2">
              <span>Search</span>
              <input
                className={inputClassName}
                placeholder="Invoice #, customer, phone, email, GSTIN…"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    applyFilters({ ...filters, search: searchDraft });
                  }
                }}
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
              <span>Type</span>
              <select
                className={selectClassName}
                value={filters.type}
                onChange={(e) =>
                  applyFilters({
                    ...filters,
                    search: searchDraft,
                    type: e.target.value,
                  })
                }
              >
                {TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value || 'all'} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={() =>
                applyFilters({
                  ...filters,
                  search: searchDraft,
                })
              }
            >
              Apply filters
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={!hasExtraFilters && filters.status === 'ALL'}
              onClick={clearFilters}
            >
              Clear
            </Button>
            <div className="flex flex-wrap gap-2 sm:ml-auto">
              {(
                [
                  { label: 'Today', days: 0 },
                  { label: 'Last 7 days', days: 6 },
                  { label: 'This month', days: -1 },
                ] as const
              ).map((preset) => (
                <Button
                  key={preset.label}
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    const today = new Date();
                    const ymd = (d: Date) =>
                      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                    const to = ymd(today);
                    let from = to;
                    if (preset.days === -1) {
                      from = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
                    } else if (preset.days > 0) {
                      const start = new Date(today);
                      start.setDate(today.getDate() - preset.days);
                      from = ymd(start);
                    }
                    applyFilters({
                      ...filters,
                      search: searchDraft,
                      dateFrom: from,
                      dateTo: to,
                    });
                  }}
                >
                  {preset.label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <AppLoader label="Loading invoices..." />
          ) : !invoices.length ? (
            <EmptyState
              title="No invoices found"
              description="Try a different search, clear filters, or create a bill from POS."
              action={
                <Link
                  href="/dashboard/pos"
                  className="inline-flex min-h-11 items-center justify-center rounded-xl bg-brand px-4 text-sm font-semibold text-white"
                >
                  Start new bill
                </Link>
              }
            />
          ) : (
            <>
              {/* Cards: always on phone; always when Cards view selected */}
              <ul
                className={cn(
                  'grid gap-3 sm:grid-cols-2 xl:grid-cols-3',
                  filters.view === 'table' && 'md:hidden',
                )}
              >
                {invoices.map((invoice) => {
                  const paidMethods =
                    invoice.payments?.map((payment) => payment.method.replace('_', ' ')).join(', ') ||
                    '—';
                  const kind = typeLabel(invoice.type);
                  return (
                    <li
                      key={invoice.id}
                      className="rounded-xl border border-slate-200 bg-white p-4 transition hover:border-teal-200 hover:bg-teal-50/30"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <Link
                            href={`/dashboard/invoices/${invoice.id}`}
                            className="font-mono text-sm font-semibold text-brand hover:underline"
                          >
                            {invoice.invoiceNumber}
                          </Link>
                          <p className="mt-1 text-xs text-slate-500">{kind || 'Tax invoice'}</p>
                        </div>
                        <StatusBadge status={invoice.status} />
                      </div>
                      <p className="mt-3 font-medium text-slate-900">
                        {invoice.customer?.name || 'Walk-in customer'}
                      </p>
                      {invoice.customer?.gstin ? (
                        <p className="text-xs text-slate-500">{invoice.customer.gstin}</p>
                      ) : null}
                      <p className="text-xs text-slate-500">
                        {invoice.customer?.phone || 'No phone'}
                        {invoice.customer?.email ? ` · ${invoice.customer.email}` : ''}
                      </p>
                      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-2">
                        <div>
                          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                            Generated at
                          </p>
                          <p className="mt-0.5 text-xs text-slate-600">
                            {formatDateTime(invoice.createdAt)}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                            Updated at
                          </p>
                          <p className="mt-0.5 text-xs text-slate-600">
                            {formatDateTime(invoice.updatedAt || invoice.createdAt)}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 flex items-end justify-between gap-2">
                        <div>
                          <p className="text-xs text-slate-500">{paidMethods}</p>
                          <p className="text-lg font-semibold text-slate-900">
                            {formatINR(toNumber(invoice.grandTotal))}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/dashboard/invoices/${invoice.id}`}
                            className="text-sm font-medium text-brand hover:underline"
                          >
                            Open
                          </Link>
                          {invoice.status === 'FINALIZED' ? (
                            <InvoicePrintPanel
                              invoiceId={invoice.id}
                              invoice={{
                                id: invoice.id,
                                invoiceNumber: invoice.invoiceNumber,
                                createdAt: invoice.createdAt,
                                grandTotal: toNumber(invoice.grandTotal),
                                status: invoice.status,
                                payments: invoice.payments,
                                customer: invoice.customer,
                              }}
                              variant="compact"
                              onError={setError}
                            />
                          ) : null}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {filters.view === 'table' ? (
            <table className="hidden min-w-full divide-y divide-slate-200 md:table">
              <thead className="bg-slate-50">
                <tr>
                  <SortHeader field="invoiceNumber" label="Invoice" />
                  <SortHeader field="customer" label="Customer" />
                  <th className={tableHeaderClassName}>Contact</th>
                  <th className={tableHeaderClassName}>Lines</th>
                  <th className={tableHeaderClassName}>Payments</th>
                  <SortHeader field="grandTotal" label="Amount" />
                  <SortHeader field="status" label="Status" />
                  <SortHeader field="createdAt" label="Generated at" />
                  <SortHeader field="updatedAt" label="Updated at" />
                  <th className={cn(tableHeaderClassName, 'text-right')}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {invoices.map((invoice) => {
                  const paidMethods =
                    invoice.payments?.map((payment) => payment.method.replace('_', ' ')).join(', ') ||
                    '—';
                  const kind = typeLabel(invoice.type);

                  return (
                    <tr key={invoice.id} className="transition hover:bg-slate-50">
                      <td className={tableCellClassName}>
                        <Link href={`/dashboard/invoices/${invoice.id}`} className="group block">
                          <div className="space-y-1">
                            <p className="font-mono text-sm font-semibold text-brand group-hover:underline">
                              {invoice.invoiceNumber}
                            </p>
                            {kind ? <p className="text-xs text-slate-500">{kind}</p> : null}
                          </div>
                        </Link>
                      </td>
                      <td className={tableCellClassName}>
                        <div className="space-y-1">
                          <p className="font-medium text-slate-900">
                            {invoice.customer?.name || 'Walk-in customer'}
                          </p>
                          {invoice.customer?.gstin ? (
                            <p className="text-xs text-slate-500">{invoice.customer.gstin}</p>
                          ) : null}
                        </div>
                      </td>
                      <td className={tableCellClassName}>
                        <div className="space-y-1">
                          <p className="text-sm text-slate-800">{invoice.customer?.phone || '—'}</p>
                          <p className="text-xs text-slate-500">{invoice.customer?.email || '—'}</p>
                        </div>
                      </td>
                      <td className={tableCellClassName}>{invoice.lines?.length || 0}</td>
                      <td className={tableCellClassName}>
                        <div className="text-sm text-slate-700">{paidMethods}</div>
                      </td>
                      <td className={tableCellClassName}>
                        <div className="font-semibold text-slate-900">
                          {formatINR(toNumber(invoice.grandTotal))}
                        </div>
                      </td>
                      <td className={cn(tableCellClassName, 'whitespace-nowrap')}>
                        <StatusBadge status={invoice.status} />
                      </td>
                      <td className={tableCellClassName}>
                        <p className="whitespace-nowrap text-sm text-slate-700">
                          {formatDateTime(invoice.createdAt)}
                        </p>
                      </td>
                      <td className={tableCellClassName}>
                        <p className="whitespace-nowrap text-sm text-slate-700">
                          {formatDateTime(invoice.updatedAt || invoice.createdAt)}
                        </p>
                      </td>
                      <td className={cn(tableCellClassName, 'text-right')}>
                        <div className="flex items-center justify-end gap-2">
                          <Link
                            href={`/dashboard/invoices/${invoice.id}`}
                            className="text-sm font-medium text-brand hover:underline"
                          >
                            Open
                          </Link>
                          {invoice.status === 'FINALIZED' ? (
                            <InvoicePrintPanel
                              invoiceId={invoice.id}
                              invoice={{
                                id: invoice.id,
                                invoiceNumber: invoice.invoiceNumber,
                                createdAt: invoice.createdAt,
                                grandTotal: toNumber(invoice.grandTotal),
                                status: invoice.status,
                                payments: invoice.payments,
                                customer: invoice.customer,
                              }}
                              variant="compact"
                              onError={setError}
                            />
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
              ) : null}
            </>
          )}
        </div>

        {!loading && total > 0 ? (
          <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 pr-16 sm:pr-0 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">
              Showing <span className="font-medium text-slate-800">{rangeFrom}</span>–
              <span className="font-medium text-slate-800">{rangeTo}</span> of{' '}
              <span className="font-medium text-slate-800">{total}</span>
            </p>
            <div className="flex flex-wrap items-center gap-2 pb-2 sm:pb-0">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={filters.page <= 1}
                onClick={() => goToPage(filters.page - 1)}
              >
                Previous
              </Button>
              {pageWindow(filters.page, totalPages).map((p) => (
                <Button
                  key={p}
                  type="button"
                  size="sm"
                  variant={p === filters.page ? 'primary' : 'secondary'}
                  onClick={() => goToPage(p)}
                >
                  {p}
                </Button>
              ))}
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={filters.page >= totalPages}
                onClick={() => goToPage(filters.page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
