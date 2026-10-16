'use client';

import { AppLoader } from '@/app/_components/app-loader';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Button, Card, formatINR } from '@retail-sarathi/ui';
import { apiWithAuth, fmtINR } from '@/lib/helpers';
import {
  assertGstinOptional,
  assertIndianPhone,
  INDIAN_STATE_OPTIONS,
  normalizeGstin,
  parseAddressPayload,
  stateCodeFromGstin,
} from '@/lib/validators';
import {
  pageShellClassName,
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
import { RowActionsMenu } from '../_components/row-actions-menu';
import { ExportDropdown, fetchAndApplyExport } from '../_components/export-dropdown';

type Segment = 'RETAIL' | 'DEALER' | 'DISTRIBUTOR' | 'CORPORATE';

type ReceivablesRow = {
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
  whatsappOptIn?: boolean;
};

interface Customer {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  gstin?: string | null;
  address?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  pincode?: string | null;
  country?: string | null;
  stateCode?: string | null;
  segment: Segment;
  creditLimit: number;
  outstandingBalance: number;
  loyaltyPoints: number;
  whatsappOptIn?: boolean;
  createdAt: string;
  updatedAt?: string;
  createdBy?: { id: string; name: string } | null;
  updatedBy?: { id: string; name: string } | null;
}

interface CustomerFormState {
  name: string;
  phone: string;
  gstin: string;
  address: string;
  addressLine2: string;
  city: string;
  pincode: string;
  country: string;
  stateCode: string;
  segment: Segment;
  creditLimit: string;
  whatsappOptIn: boolean;
}

interface CustomerListResponse {
  items: Customer[];
  total: number;
  page: number;
  pageSize: number;
}

const EMPTY_FORM: CustomerFormState = {
  name: '',
  phone: '',
  gstin: '',
  address: '',
  addressLine2: '',
  city: '',
  pincode: '',
  country: 'IN',
  stateCode: '',
  segment: 'RETAIL',
  creditLimit: '0',
  whatsappOptIn: false,
};

const SEGMENTS: Segment[] = ['RETAIL', 'DEALER', 'DISTRIBUTOR', 'CORPORATE'];
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const SORT_FIELDS = [
  'name',
  'phone',
  'email',
  'gstin',
  'address',
  'segment',
  'creditLimit',
  'outstandingBalance',
  'loyaltyPoints',
  'createdAt',
  'updatedAt',
] as const;
type SortField = (typeof SORT_FIELDS)[number];
type SortDir = 'asc' | 'desc';

type ListFilters = {
  search: string;
  segment: string;
  page: number;
  pageSize: number;
  stateCode: string;
  outstanding: string;
  hasGstin: string;
  hasLoyalty: string;
  sortBy: SortField;
  sortDir: SortDir;
};

function parsePageSize(raw: string | null) {
  const n = Number(raw);
  return PAGE_SIZE_OPTIONS.includes(n as (typeof PAGE_SIZE_OPTIONS)[number]) ? n : 25;
}

function parseSortBy(raw: string | null): SortField {
  return SORT_FIELDS.includes(raw as SortField) ? (raw as SortField) : 'name';
}

function filtersFromParams(params: URLSearchParams): ListFilters {
  return {
    search: params.get('search') || '',
    segment: params.get('segment') || '',
    page: Math.max(1, Number(params.get('page')) || 1),
    pageSize: parsePageSize(params.get('pageSize')),
    stateCode: params.get('stateCode') || '',
    outstanding: params.get('outstanding') || '',
    hasGstin: params.get('hasGstin') || '',
    hasLoyalty: params.get('hasLoyalty') || '',
    sortBy: parseSortBy(params.get('sortBy')),
    sortDir: params.get('sortDir') === 'desc' ? 'desc' : 'asc',
  };
}

function buildApiQuery(filters: ListFilters) {
  const params = new URLSearchParams();
  params.set('page', String(filters.page));
  params.set('pageSize', String(filters.pageSize));
  params.set('sortBy', filters.sortBy);
  params.set('sortDir', filters.sortDir);
  if (filters.search.trim()) params.set('search', filters.search.trim());
  if (filters.segment) params.set('segment', filters.segment);
  if (filters.stateCode) params.set('stateCode', filters.stateCode);
  if (filters.outstanding) params.set('outstanding', filters.outstanding);
  if (filters.hasGstin) params.set('hasGstin', filters.hasGstin);
  if (filters.hasLoyalty) params.set('hasLoyalty', filters.hasLoyalty);
  return params.toString();
}

function buildUrlQuery(filters: ListFilters) {
  const params = new URLSearchParams();
  if (filters.search.trim()) params.set('search', filters.search.trim());
  if (filters.segment) params.set('segment', filters.segment);
  if (filters.stateCode) params.set('stateCode', filters.stateCode);
  if (filters.outstanding) params.set('outstanding', filters.outstanding);
  if (filters.hasGstin) params.set('hasGstin', filters.hasGstin);
  if (filters.hasLoyalty) params.set('hasLoyalty', filters.hasLoyalty);
  if (filters.page > 1) params.set('page', String(filters.page));
  if (filters.pageSize !== 25) params.set('pageSize', String(filters.pageSize));
  if (filters.sortBy !== 'name') params.set('sortBy', filters.sortBy);
  if (filters.sortDir !== 'asc') params.set('sortDir', filters.sortDir);
  return params.toString();
}

function pageWindow(current: number, totalPages: number) {
  const pages: number[] = [];
  const end = Math.min(totalPages, Math.max(1, current - 2) + 4);
  for (let p = Math.max(1, end - 4); p <= end; p += 1) pages.push(p);
  return pages;
}

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

export default function CustomersPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [filters, setFilters] = useState<ListFilters>(() => filtersFromParams(searchParams));
  const [searchDraft, setSearchDraft] = useState(() => filtersFromParams(searchParams).search);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [receivables, setReceivables] = useState<ReceivablesRow[]>([]);
  const [receivablesLoading, setReceivablesLoading] = useState(true);
  const [waReminding, setWaReminding] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [filtersExpanded, setFiltersExpanded] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [form, setForm] = useState<CustomerFormState>(EMPTY_FORM);

  function applyFilters(next: ListFilters, opts?: { keepPage?: boolean }) {
    const normalized: ListFilters = {
      ...next,
      page: opts?.keepPage ? Math.max(1, next.page) : 1,
    };
    setFilters(normalized);
    setSearchDraft(normalized.search);
    const qs = buildUrlQuery(normalized);
    router.replace(qs ? `/dashboard/customers?${qs}` : '/dashboard/customers');
  }

  async function loadCustomers(next = filters) {
    try {
      setLoading(true);
      setError('');
      const response = await apiWithAuth<CustomerListResponse>(`/customers?${buildApiQuery(next)}`);
      const matched = response.total ?? response.items.length;
      const pages = Math.max(1, Math.ceil(matched / next.pageSize));
      if (next.page > pages) {
        applyFilters({ ...next, page: pages }, { keepPage: true });
        return;
      }
      setCustomers(response.items);
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
    void loadCustomers(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    setReceivablesLoading(true);
    apiWithAuth<ReceivablesRow[]>('/customers/aging/report')
      .then((rows) => setReceivables(Array.isArray(rows) ? rows : []))
      .catch(() => setReceivables([]))
      .finally(() => setReceivablesLoading(false));
  }, []);

  async function sendCustomerReminder(customerId: string) {
    try {
      setWaReminding(customerId);
      setError('');
      const res = await apiWithAuth<{ waUrl?: string | null }>(`/customers/${customerId}/reminders`, { method: 'POST' });
      if (res.waUrl) window.open(res.waUrl, '_blank', 'noopener,noreferrer');
      setSuccess('Reminder sent.');
    } catch (e) {
      setError(parseError(e));
    } finally {
      setWaReminding(null);
    }
  }

  const receivablesTotal = useMemo(
    () => receivables.reduce((sum, row) => sum + Number(row.outstanding || 0), 0),
    [receivables],
  );

  const activeFilterCount = useMemo(() => {
    let n = 0;
    if (filters.search.trim()) n += 1;
    if (filters.segment) n += 1;
    if (filters.stateCode) n += 1;
    if (filters.outstanding) n += 1;
    if (filters.hasGstin) n += 1;
    if (filters.hasLoyalty) n += 1;
    return n;
  }, [filters]);

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
      sortDir: field === 'createdAt' || field === 'updatedAt' || field === 'outstandingBalance' ? 'desc' : 'asc',
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

  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));
  const rangeFrom = total === 0 ? 0 : (filters.page - 1) * filters.pageSize + 1;
  const rangeTo = Math.min(total, filters.page * filters.pageSize);

  const totalOutstanding = useMemo(
    () => customers.reduce((sum, customer) => sum + toNumber(customer.outstandingBalance), 0),
    [customers],
  );
  const totalCreditLimit = useMemo(
    () => customers.reduce((sum, customer) => sum + toNumber(customer.creditLimit), 0),
    [customers],
  );

  function validateCustomer(values: CustomerFormState) {
    if (!values.name.trim()) throw new Error('Customer name is required.');
    assertIndianPhone(values.phone, true);
    const gstin = assertGstinOptional(values.gstin);
    parseAddressPayload({
      address: values.address,
      addressLine2: values.addressLine2,
      city: values.city,
      stateCode: values.stateCode || stateCodeFromGstin(gstin),
      pincode: values.pincode,
      country: values.country || 'IN',
    });
    if (toNumber(values.creditLimit) < 0) throw new Error('Credit limit cannot be negative.');
  }

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      validateCustomer(form);
      const phone = assertIndianPhone(form.phone, true)!;
      const gstin = assertGstinOptional(form.gstin);
      const addr = parseAddressPayload({
        address: form.address,
        addressLine2: form.addressLine2,
        city: form.city,
        stateCode: form.stateCode || stateCodeFromGstin(gstin),
        pincode: form.pincode,
        country: form.country || 'IN',
      });
      setSaving(true);
      setError('');
      setSuccess('');
      const created = await apiWithAuth<Customer>('/customers', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          phone,
          gstin,
          address: addr.address,
          addressLine2: addr.addressLine2,
          city: addr.city,
          pincode: addr.pincode,
          country: addr.country,
          stateCode: addr.stateCode || stateCodeFromGstin(gstin),
          segment: form.segment,
          creditLimit: toNumber(form.creditLimit),
          whatsappOptIn: form.whatsappOptIn,
        }),
      });
      setForm(EMPTY_FORM);
      setShowCreate(false);
      setSuccess('Customer created.');
      router.push(`/dashboard/customers/${created.id}`);
    } catch (err) {
      setError(parseError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={pageShellClassName}>
      <PageHeader
        title="Customers"
        description="Search parties, check udhaar, and open a full profile to edit."
        actions={
          <Button type="button" size="sm" onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? 'Close' : '+ Add customer'}
          </Button>
        }
      />

      {error ? <MessageBanner tone="error">{error}</MessageBanner> : null}
      {success ? <MessageBanner tone="success">{success}</MessageBanner> : null}

      {!receivablesLoading && receivables.length > 0 ? (
        <Card className="border-slate-200 p-4">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Who owes you</h2>
              <p className="text-xs text-slate-500">Highest outstanding first — collect from the ledger</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="text-right">
                <p className="text-xs font-medium text-slate-500">Total outstanding</p>
                <p className="text-lg font-semibold text-rose-700">{formatINR(receivablesTotal)}</p>
              </div>
              <ExportDropdown
                onExport={(format) => {
                  void (async () => {
                    try {
                      setSuccess(await fetchAndApplyExport('/reports/receivables', format));
                    } catch (e) {
                      setError(parseError(e));
                    }
                  })();
                }}
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className={tableHeaderClassName}>Customer</th>
                  <th className={tableHeaderClassName}>Contact</th>
                  <th className={tableHeaderClassName}>GSTIN / Address</th>
                  <th className={tableHeaderClassName}>Outstanding</th>
                  <th className={tableHeaderClassName} />
                </tr>
              </thead>
              <tbody>
                {receivables.slice(0, 10).map((row) => {
                  const addr = customerAddressLine(row);
                  return (
                  <tr key={row.customerId || row.name} className="border-t border-slate-100">
                    <td className={tableCellClassName}>
                      <div className="font-medium text-slate-900">{row.name}</div>
                      {row.segment ? (
                        <div className="text-[11px] text-slate-500">{row.segment}</div>
                      ) : null}
                    </td>
                    <td className={tableCellClassName}>
                      <div>{row.phone || '—'}</div>
                      {row.email ? <div className="text-xs text-slate-500">{row.email}</div> : null}
                    </td>
                    <td className={tableCellClassName}>
                      <div className="font-mono text-xs">{row.gstin || '—'}</div>
                      {addr ? <div className="mt-0.5 text-xs text-slate-500">{addr}</div> : null}
                    </td>
                    <td className={tableCellClassName}>
                      <span className="font-semibold text-rose-700">{formatINR(row.outstanding)}</span>
                      {Number(row.creditLimit) > 0 ? (
                        <div className="text-[11px] text-slate-500">Limit {formatINR(row.creditLimit!)}</div>
                      ) : null}
                    </td>
                    <td className={tableCellClassName}>
                      <div className="flex justify-end">
                        <RowActionsMenu
                          actions={[
                            {
                              key: 'collect',
                              label: 'Collect',
                              hidden: !row.customerId,
                              onClick: () => router.push(`/dashboard/customers/${row.customerId}`),
                            },
                            {
                              key: 'wa',
                              label: waReminding === row.customerId ? 'Sending…' : 'WhatsApp reminder',
                              hidden: !row.customerId || !row.whatsappOptIn,
                              disabled: waReminding === row.customerId,
                              onClick: () => void sendCustomerReminder(row.customerId!),
                            },
                          ]}
                        />
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Card className="border-slate-200">
          <p className="text-xs font-medium text-slate-500 sm:text-sm">Customers</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900 sm:text-3xl">{total}</p>
        </Card>
        <Card className="border-slate-200">
          <p className="text-xs font-medium text-slate-500 sm:text-sm">Outstanding (page)</p>
          <p className="mt-1 text-2xl font-semibold text-amber-600 sm:text-3xl">
            {formatINR(totalOutstanding)}
          </p>
        </Card>
        <Card className="col-span-2 border-slate-200 md:col-span-1">
          <p className="text-xs font-medium text-slate-500 sm:text-sm">Credit exposure (page)</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900 sm:text-3xl">
            {fmtINR(totalCreditLimit)}
          </p>
        </Card>
      </section>

      {showCreate ? (
        <Card className="border-teal-200 bg-gradient-to-br from-teal-50 to-white">
          <form className="space-y-5" onSubmit={handleCreate}>
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Add customer</h2>
              <p className="text-sm text-slate-500">Opens the profile page after create so you can keep editing.</p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <label className="space-y-2 text-sm font-medium text-slate-700">
                <span>Name</span>
                <input
                  className={inputClassName}
                  value={form.name}
                  onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
                  required
                />
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-700">
                <span>Phone</span>
                <input
                  className={inputClassName}
                  value={form.phone}
                  onChange={(event) => setForm((current) => ({ ...current, phone: event.target.value }))}
                  inputMode="tel"
                  required
                />
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-700">
                <span>GSTIN</span>
                <input
                  className={inputClassName}
                  value={form.gstin}
                  onChange={(event) => {
                    const gstin = normalizeGstin(event.target.value);
                    const stateCode = stateCodeFromGstin(gstin);
                    setForm((current) => ({
                      ...current,
                      gstin,
                      ...(stateCode ? { stateCode } : {}),
                    }));
                  }}
                  maxLength={15}
                />
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-700">
                <span>Segment</span>
                <select
                  className={selectClassName}
                  value={form.segment}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, segment: event.target.value as Segment }))
                  }
                >
                  {SEGMENTS.map((segment) => (
                    <option key={segment} value={segment}>
                      {segment.replace('_', ' ')}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-700 sm:col-span-2">
                <span>Address line 1</span>
                <input
                  className={inputClassName}
                  value={form.address}
                  onChange={(event) => setForm((current) => ({ ...current, address: event.target.value }))}
                />
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-700 sm:col-span-2">
                <span>Address line 2</span>
                <input
                  className={inputClassName}
                  value={form.addressLine2}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, addressLine2: event.target.value }))
                  }
                />
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-700">
                <span>City</span>
                <input
                  className={inputClassName}
                  value={form.city}
                  onChange={(event) => setForm((current) => ({ ...current, city: event.target.value }))}
                />
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-700">
                <span>State</span>
                <select
                  className={selectClassName}
                  value={form.stateCode}
                  onChange={(event) => setForm((current) => ({ ...current, stateCode: event.target.value }))}
                >
                  <option value="">Select state</option>
                  {INDIAN_STATE_OPTIONS.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-700">
                <span>PIN code</span>
                <input
                  className={inputClassName}
                  value={form.pincode}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      pincode: event.target.value.replace(/\D/g, '').slice(0, 6),
                    }))
                  }
                  inputMode="numeric"
                  maxLength={6}
                />
              </label>
              <label className="space-y-2 text-sm font-medium text-slate-700">
                <span>Credit limit</span>
                <input
                  className={inputClassName}
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="0 = no limit"
                  value={form.creditLimit}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, creditLimit: event.target.value }))
                  }
                />
              </label>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={form.whatsappOptIn}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, whatsappOptIn: event.target.checked }))
                  }
                />
                WhatsApp bill opt-in
              </label>
            </div>

            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Create & open'}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setForm(EMPTY_FORM)}>
                Reset
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      <Card className="border-slate-200">
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Customer list</h2>
            <p className="text-sm text-slate-500">Search and filter parties, then open a profile.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <span className="whitespace-nowrap">Sort</span>
              <select
                className={`${selectClassName} min-h-9 w-auto py-2`}
                value={`${filters.sortBy}:${filters.sortDir}`}
                onChange={(event) => {
                  const [sortBy, sortDir] = event.target.value.split(':') as [SortField, SortDir];
                  applyFilters({
                    ...filters,
                    search: searchDraft,
                    sortBy,
                    sortDir,
                  });
                }}
              >
                <option value="name:asc">Name A–Z</option>
                <option value="name:desc">Name Z–A</option>
                <option value="createdAt:desc">Created at (newest)</option>
                <option value="createdAt:asc">Created at (oldest)</option>
                <option value="updatedAt:desc">Updated at (newest)</option>
                <option value="updatedAt:asc">Updated at (oldest)</option>
                <option value="outstandingBalance:desc">Outstanding (high)</option>
                <option value="outstandingBalance:asc">Outstanding (low)</option>
                <option value="phone:asc">Phone</option>
                <option value="gstin:asc">GSTIN</option>
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <span className="whitespace-nowrap">Rows</span>
              <select
                className={`${selectClassName} min-h-9 w-auto py-2`}
                value={filters.pageSize}
                onChange={(event) =>
                  applyFilters({
                    ...filters,
                    search: searchDraft,
                    pageSize: Number(event.target.value),
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

        <div className="mb-5 rounded-xl border border-slate-100 bg-slate-50/80 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setFiltersExpanded((open) => !open)}
              className="inline-flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm font-semibold text-slate-800 transition hover:bg-white/80"
              aria-expanded={filtersExpanded}
            >
              <span
                className={`inline-block text-xs text-slate-500 transition ${filtersExpanded ? 'rotate-90' : ''}`}
                aria-hidden
              >
                ▶
              </span>
              Filters
              {activeFilterCount > 0 ? (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                  {activeFilterCount} active
                </span>
              ) : null}
            </button>
            {!filtersExpanded ? (
              <div className="flex min-w-0 flex-1 items-center gap-2 sm:max-w-md sm:flex-none">
                <input
                  className={`${inputClassName} min-h-9 py-2`}
                  placeholder="Quick search…"
                  value={searchDraft}
                  onChange={(event) => setSearchDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      applyFilters({ ...filters, search: searchDraft });
                    }
                  }}
                />
                <Button
                  type="button"
                  size="sm"
                  onClick={() => applyFilters({ ...filters, search: searchDraft })}
                >
                  Search
                </Button>
              </div>
            ) : null}
          </div>

          {filtersExpanded ? (
            <>
              <div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <label className="space-y-1 text-sm font-medium text-slate-700 sm:col-span-2 xl:col-span-3">
                  <span>Search</span>
                  <input
                    className={inputClassName}
                    placeholder="Name, phone, email, city, GSTIN, address…"
                    value={searchDraft}
                    onChange={(event) => setSearchDraft(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        applyFilters({ ...filters, search: searchDraft });
                      }
                    }}
                  />
                </label>
                <label className="space-y-1 text-sm font-medium text-slate-700">
                  <span>Segment</span>
                  <select
                    className={selectClassName}
                    value={filters.segment}
                    onChange={(event) =>
                      applyFilters({
                        ...filters,
                        search: searchDraft,
                        segment: event.target.value,
                      })
                    }
                  >
                    <option value="">All segments</option>
                    {SEGMENTS.map((segment) => (
                      <option key={segment} value={segment}>
                        {segment.replace('_', ' ')}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-sm font-medium text-slate-700">
                  <span>Outstanding</span>
                  <select
                    className={selectClassName}
                    value={filters.outstanding}
                    onChange={(event) =>
                      applyFilters({
                        ...filters,
                        search: searchDraft,
                        outstanding: event.target.value,
                      })
                    }
                  >
                    <option value="">All balances</option>
                    <option value="due">Has udhaar</option>
                    <option value="clear">No dues</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm font-medium text-slate-700">
                  <span>State</span>
                  <select
                    className={selectClassName}
                    value={filters.stateCode}
                    onChange={(event) =>
                      applyFilters({
                        ...filters,
                        search: searchDraft,
                        stateCode: event.target.value,
                      })
                    }
                  >
                    <option value="">All states</option>
                    {INDIAN_STATE_OPTIONS.map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-sm font-medium text-slate-700">
                  <span>GSTIN</span>
                  <select
                    className={selectClassName}
                    value={filters.hasGstin}
                    onChange={(event) =>
                      applyFilters({
                        ...filters,
                        search: searchDraft,
                        hasGstin: event.target.value,
                      })
                    }
                  >
                    <option value="">All</option>
                    <option value="yes">Has GSTIN</option>
                    <option value="no">No GSTIN</option>
                  </select>
                </label>
                <label className="space-y-1 text-sm font-medium text-slate-700">
                  <span>Loyalty</span>
                  <select
                    className={selectClassName}
                    value={filters.hasLoyalty}
                    onChange={(event) =>
                      applyFilters({
                        ...filters,
                        search: searchDraft,
                        hasLoyalty: event.target.value,
                      })
                    }
                  >
                    <option value="">All</option>
                    <option value="yes">Has points</option>
                    <option value="no">No points</option>
                  </select>
                </label>
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => applyFilters({ ...filters, search: searchDraft })}
                >
                  Apply filters
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={activeFilterCount === 0}
                  onClick={() =>
                    applyFilters({
                      search: '',
                      segment: '',
                      stateCode: '',
                      outstanding: '',
                      hasGstin: '',
                      hasLoyalty: '',
                      page: 1,
                      pageSize: filters.pageSize,
                      sortBy: 'name',
                      sortDir: 'asc',
                    })
                  }
                >
                  Clear
                </Button>
              </div>
            </>
          ) : null}
        </div>

        <div className="mt-1">
          {loading ? (
            <AppLoader label="Loading customers…" />
          ) : !customers.length ? (
            <EmptyState
              title="No customers found"
              description="Add a customer or clear filters."
            />
          ) : (
            <>
              <ul className="space-y-3 md:hidden">
                {customers.map((customer) => {
                  const atRisk =
                    toNumber(customer.outstandingBalance) > toNumber(customer.creditLimit) &&
                    toNumber(customer.creditLimit) > 0;
                  return (
                    <li key={customer.id}>
                      <Link
                        href={`/dashboard/customers/${customer.id}`}
                        className={cn(
                          'block rounded-2xl border bg-white p-4 shadow-sm transition active:scale-[0.99]',
                          atRisk ? 'border-red-200 bg-red-50/40' : 'border-slate-200',
                        )}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-slate-900">{customer.name}</p>
                            <p className="mt-0.5 text-sm text-slate-500">{customer.phone}</p>
                            {customer.email ? (
                              <p className="mt-0.5 truncate text-xs text-slate-500">{customer.email}</p>
                            ) : null}
                            {customer.gstin ? (
                              <p className="mt-0.5 font-mono text-xs text-slate-500">{customer.gstin}</p>
                            ) : null}
                            <div className="mt-2">
                              <StatusBadge status={customer.segment} />
                            </div>
                          </div>
                          <div className="shrink-0 text-right">
                            <p className={cn('text-sm font-semibold', atRisk ? 'text-red-700' : 'text-amber-700')}>
                              {formatINR(toNumber(customer.outstandingBalance))}
                            </p>
                            <p className="mt-0.5 text-[11px] text-slate-500">udhaar</p>
                            <p className="mt-2 text-xs text-slate-500">
                              {toNumber(customer.loyaltyPoints)} pts
                            </p>
                          </div>
                        </div>
                        {customerAddressLine(customer) ? (
                          <p className="mt-2 line-clamp-2 text-xs text-slate-500">
                            {customerAddressLine(customer)}
                          </p>
                        ) : null}
                        <div className="mt-3 grid grid-cols-2 gap-2 border-t border-slate-100 pt-2">
                          <div>
                            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                              Created at
                            </p>
                            <p className="mt-0.5 text-xs text-slate-600">
                              {formatDateTime(customer.createdAt)}
                            </p>
                          </div>
                          <div>
                            <p className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                              Updated at
                            </p>
                            <p className="mt-0.5 text-xs text-slate-600">
                              {formatDateTime(customer.updatedAt || customer.createdAt)}
                            </p>
                          </div>
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>

              <div className="hidden overflow-x-auto md:block">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <SortHeader field="name" label="Customer" />
                      <SortHeader field="phone" label="Phone" />
                      <SortHeader field="email" label="Email" />
                      <SortHeader field="gstin" label="GSTIN" />
                      <SortHeader field="address" label="Address" />
                      <SortHeader field="segment" label="Segment" />
                      <SortHeader field="creditLimit" label="Credit limit" />
                      <SortHeader field="outstandingBalance" label="Outstanding" />
                      <SortHeader field="loyaltyPoints" label="Loyalty" />
                      <SortHeader field="createdAt" label="Created at" />
                      <SortHeader field="updatedAt" label="Updated at" />
                      <th className={cn(tableHeaderClassName, 'text-right')}>Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {customers.map((customer) => {
                      const atRisk =
                        toNumber(customer.outstandingBalance) > toNumber(customer.creditLimit) &&
                        toNumber(customer.creditLimit) > 0;
                      const address = customerAddressLine(customer);
                      return (
                        <tr
                          key={customer.id}
                          className={cn(atRisk && 'bg-red-50/60', 'cursor-pointer hover:bg-slate-50')}
                          onClick={() => router.push(`/dashboard/customers/${customer.id}`)}
                        >
                          <td className={tableCellClassName}>
                            <p className="font-semibold text-slate-900">{customer.name}</p>
                          </td>
                          <td className={tableCellClassName}>
                            <p className="whitespace-nowrap text-sm text-slate-700">{customer.phone || '—'}</p>
                          </td>
                          <td className={tableCellClassName}>
                            <p className="max-w-[12rem] truncate text-sm text-slate-700">
                              {customer.email || '—'}
                            </p>
                          </td>
                          <td className={tableCellClassName}>
                            <p className="font-mono text-xs text-slate-700">{customer.gstin || '—'}</p>
                          </td>
                          <td className={tableCellClassName}>
                            <p className="max-w-xs text-sm text-slate-700">{address || '—'}</p>
                          </td>
                          <td className={tableCellClassName}>
                            <StatusBadge status={customer.segment} />
                          </td>
                          <td className={tableCellClassName}>
                            {toNumber(customer.creditLimit) > 0
                              ? formatINR(toNumber(customer.creditLimit))
                              : 'No limit'}
                          </td>
                          <td className={tableCellClassName}>
                            <span className={cn('font-medium', atRisk ? 'text-red-700' : 'text-slate-900')}>
                              {formatINR(toNumber(customer.outstandingBalance))}
                            </span>
                          </td>
                          <td className={tableCellClassName}>{toNumber(customer.loyaltyPoints)} pts</td>
                          <td className={tableCellClassName}>
                            <p className="whitespace-nowrap text-sm text-slate-700">
                              {formatDateTime(customer.createdAt)}
                            </p>
                          </td>
                          <td className={tableCellClassName}>
                            <p className="whitespace-nowrap text-sm text-slate-700">
                              {formatDateTime(customer.updatedAt || customer.createdAt)}
                            </p>
                          </td>
                          <td className={cn(tableCellClassName, 'text-right')} onClick={(e) => e.stopPropagation()}>
                            <div className="flex justify-end">
                              <RowActionsMenu
                                actions={[
                                  { key: 'view', label: 'View', onClick: () => router.push(`/dashboard/customers/${customer.id}`) },
                                ]}
                              />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        {!loading && total > 0 ? (
          <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">
              Showing <span className="font-medium text-slate-800">{rangeFrom}</span>–
              <span className="font-medium text-slate-800">{rangeTo}</span> of{' '}
              <span className="font-medium text-slate-800">{total}</span>
            </p>
            <div className="flex flex-wrap items-center gap-2">
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
