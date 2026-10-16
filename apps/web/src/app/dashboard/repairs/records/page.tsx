'use client';
import { AppLoader } from '@/app/_components/app-loader';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button, Card, formatINR } from '@retail-sarathi/ui';
import { apiWithAuth } from '@/lib/helpers';
import { confirmDialog } from '@/app/_components/confirm-dialog';
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
} from '../../_components/dashboard-ui';

interface RepairRecord {
  id: string;
  jobNumber: string;
  deviceModel: string;
  issue: string;
  status: string;
  estimateAmount?: number | null;
  finalAmount?: number | null;
  receivedAt: string;
  deliveredAt?: string | null;
  createdAt: string;
  customer?: { id: string; name: string; phone: string } | null;
  technician?: { id: string; name: string } | null;
  serviceType?: { id: string; name: string } | null;
  linkedInvoice?: { id: string; invoiceNumber: string; grandTotal: number } | null;
}

interface RecordsResponse {
  items: RepairRecord[];
  total: number;
  page: number;
  pageSize: number;
}

interface TechnicianOption {
  id: string;
  name: string;
}

interface ServiceTypeOption {
  id: string;
  name: string;
}

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  { value: 'RECEIVED', label: 'Received' },
  { value: 'DIAGNOSED', label: 'Diagnosed' },
  { value: 'AWAITING_CUSTOMER_APPROVAL', label: 'Awaiting approval' },
  { value: 'AWAITING_PARTS', label: 'Awaiting parts' },
  { value: 'IN_REPAIR', label: 'In repair' },
  { value: 'ON_HOLD', label: 'On hold' },
  { value: 'READY', label: 'Ready' },
  { value: 'DELIVERED', label: 'Delivered' },
  { value: 'CANCELLED', label: 'Cancelled' },
] as const;

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

const SORT_FIELDS = [
  { value: 'receivedAt', label: 'Received at' },
  { value: 'deliveredAt', label: 'Delivered at' },
  { value: 'jobNumber', label: 'Job #' },
  { value: 'status', label: 'Status' },
  { value: 'estimateAmount', label: 'Estimate' },
  { value: 'finalAmount', label: 'Final amount' },
  { value: 'customer', label: 'Customer' },
  { value: 'createdAt', label: 'Created at' },
] as const;
type SortField = (typeof SORT_FIELDS)[number]['value'];
type SortDir = 'asc' | 'desc';

type Filters = {
  status: string;
  search: string;
  technicianId: string;
  serviceTypeId: string;
  dateFrom: string;
  dateTo: string;
  page: number;
  pageSize: number;
  sortBy: SortField;
  sortDir: SortDir;
};

const EMPTY_FILTERS: Filters = {
  status: '',
  search: '',
  technicianId: '',
  serviceTypeId: '',
  dateFrom: '',
  dateTo: '',
  page: 1,
  pageSize: 25,
  sortBy: 'receivedAt',
  sortDir: 'desc',
};

function filterPayload(filters: Filters) {
  return {
    status: filters.status || undefined,
    technicianId: filters.technicianId || undefined,
    serviceTypeId: filters.serviceTypeId || undefined,
    dateFrom: filters.dateFrom || undefined,
    dateTo: filters.dateTo || undefined,
    search: filters.search.trim() || undefined,
  };
}

function buildQuery(filters: Filters) {
  const params = new URLSearchParams();
  params.set('page', String(filters.page));
  params.set('pageSize', String(filters.pageSize));
  params.set('sortBy', filters.sortBy);
  params.set('sortDir', filters.sortDir);
  const payload = filterPayload(filters);
  Object.entries(payload).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return params.toString();
}

function pageWindow(current: number, totalPages: number) {
  const pages: number[] = [];
  const start = Math.max(1, current - 2);
  const end = Math.min(totalPages, start + 4);
  for (let p = Math.max(1, end - 4); p <= end; p += 1) pages.push(p);
  return pages;
}

export default function RepairRecordsPage() {
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [searchDraft, setSearchDraft] = useState('');
  const [records, setRecords] = useState<RepairRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [technicians, setTechnicians] = useState<TechnicianOption[]>([]);
  const [serviceTypes, setServiceTypes] = useState<ServiceTypeOption[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [selectAllMatching, setSelectAllMatching] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function loadRecords(next: Filters) {
    try {
      setLoading(true);
      setError('');
      const response = await apiWithAuth<RecordsResponse>(`/repairs/records?${buildQuery(next)}`);
      const matched = response.total;
      const pages = Math.max(1, Math.ceil(matched / next.pageSize));
      if (next.page > pages && matched > 0) {
        setFilters((f) => ({ ...f, page: pages }));
        return;
      }
      setRecords(response.items);
      setTotal(matched);
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRecords(filters);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters]);

  useEffect(() => {
    void (async () => {
      const [techs, svcs] = await Promise.all([
        apiWithAuth<TechnicianOption[]>('/users/technicians').catch(() => []),
        apiWithAuth<ServiceTypeOption[]>('/repair-service-types').catch(() => []),
      ]);
      setTechnicians(techs);
      setServiceTypes(svcs);
    })();
  }, []);

  useEffect(() => {
    setSelectedIds(new Set());
    setSelectAllMatching(false);
  }, [records]);

  function apply(next: Partial<Filters>, opts?: { resetPage?: boolean }) {
    setFilters((f) => ({
      ...f,
      ...next,
      page: opts?.resetPage === false ? f.page : 1,
    }));
  }

  function clearFilters() {
    setSearchDraft('');
    setFilters({ ...EMPTY_FILTERS, pageSize: filters.pageSize });
  }

  function toggleSort(field: SortField) {
    if (filters.sortBy === field) {
      apply({ sortDir: filters.sortDir === 'asc' ? 'desc' : 'asc' }, { resetPage: false });
      return;
    }
    apply({ sortBy: field, sortDir: 'desc' }, { resetPage: false });
  }

  function toggleRow(id: string) {
    setSelectAllMatching(false);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllOnPage() {
    setSelectAllMatching(false);
    setSelectedIds((prev) => {
      const allSelected = records.length > 0 && records.every((r) => prev.has(r.id));
      if (allSelected) return new Set();
      return new Set(records.map((r) => r.id));
    });
  }

  const hasExtraFilters = Boolean(
    filters.search.trim() ||
      filters.status ||
      filters.technicianId ||
      filters.serviceTypeId ||
      filters.dateFrom ||
      filters.dateTo,
  );

  async function deleteSelected() {
    const count = selectedIds.size;
    if (!count) return;
    const ok = await confirmDialog.confirm({
      title: 'Delete repair records',
      message: `Permanently delete ${count} selected repair record${count === 1 ? '' : 's'}? This removes the job's own history only — any invoice already generated from it is kept untouched. This cannot be undone.`,
      confirmLabel: 'Delete records',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      setDeleting(true);
      setError('');
      await apiWithAuth('/repairs/records/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      setSelectedIds(new Set());
      await loadRecords(filters);
    } catch (err) {
      setError(parseError(err));
    } finally {
      setDeleting(false);
    }
  }

  async function deleteAllMatching() {
    if (!total) return;
    const ok = await confirmDialog.confirm({
      title: 'Delete all matching repair records',
      message: `Permanently delete all ${total} repair record${total === 1 ? '' : 's'} matching the current filters? This removes each job's own history only — any invoices already generated are kept untouched. This cannot be undone.`,
      confirmLabel: `Delete ${total} records`,
      tone: 'danger',
    });
    if (!ok) return;
    if (!hasExtraFilters) {
      const reallyAll = await confirmDialog.confirm({
        title: 'No filters applied',
        message: 'No filters are set, so this will delete every repair record for your shop. Are you absolutely sure?',
        confirmLabel: 'Yes, delete everything',
        tone: 'danger',
      });
      if (!reallyAll) return;
    }
    try {
      setDeleting(true);
      setError('');
      await apiWithAuth('/repairs/records/bulk-delete', {
        method: 'POST',
        body: JSON.stringify({ filters: filterPayload(filters) }),
      });
      setSelectedIds(new Set());
      setSelectAllMatching(false);
      setFilters((f) => ({ ...f, page: 1 }));
    } catch (err) {
      setError(parseError(err));
    } finally {
      setDeleting(false);
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));
  const rangeFrom = total === 0 ? 0 : (filters.page - 1) * filters.pageSize + 1;
  const rangeTo = Math.min(total, filters.page * filters.pageSize);
  const allOnPageSelected = records.length > 0 && records.every((r) => selectedIds.has(r.id));

  function SortHeader({ field, label }: { field: SortField; label: string }) {
    const active = filters.sortBy === field;
    return (
      <th className={tableHeaderClassName}>
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

  return (
    <div className={pageShellClassName}>
      <PageHeader
        title="Repair Records"
        description="Every repair job ever created, searchable and filterable — with bulk cleanup for old or test records."
      />

      {error ? <MessageBanner tone="error">{error}</MessageBanner> : null}

      <section className="grid gap-3 sm:gap-4 sm:grid-cols-2">
        <Card className="border-slate-200">
          <p className="text-xs font-medium text-slate-500 sm:text-sm">Matching records</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900 sm:mt-2 sm:text-3xl">{total}</p>
        </Card>
        <Card className="border-slate-200">
          <p className="text-xs font-medium text-slate-500 sm:text-sm">Selected</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900 sm:mt-2 sm:text-3xl">
            {selectAllMatching ? total : selectedIds.size}
          </p>
        </Card>
      </section>

      <Card className="border-slate-200">
        <div className="mb-4">
          <h2 className="text-lg font-semibold text-slate-900">All-time history</h2>
          <p className="text-sm text-slate-500">
            Search by job #, device, customer, or technician — filter by status, technician, service, or date range.
          </p>
        </div>

        <div className="mb-6 rounded-xl border border-slate-100 bg-slate-50/80 p-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <label className="space-y-1 text-sm font-medium text-slate-700 sm:col-span-2 xl:col-span-2">
              <span>Search</span>
              <input
                className={inputClassName}
                placeholder="Job #, device, customer, phone…"
                value={searchDraft}
                onChange={(e) => setSearchDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') apply({ search: searchDraft });
                }}
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-slate-700">
              <span>Status</span>
              <select
                className={selectClassName}
                value={filters.status}
                onChange={(e) => apply({ search: searchDraft, status: e.target.value })}
              >
                {STATUS_OPTIONS.map((opt) => (
                  <option key={opt.value || 'all'} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm font-medium text-slate-700">
              <span>Technician</span>
              <select
                className={selectClassName}
                value={filters.technicianId}
                onChange={(e) => apply({ search: searchDraft, technicianId: e.target.value })}
              >
                <option value="">All technicians</option>
                {technicians.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm font-medium text-slate-700">
              <span>Service</span>
              <select
                className={selectClassName}
                value={filters.serviceTypeId}
                onChange={(e) => apply({ search: searchDraft, serviceTypeId: e.target.value })}
              >
                <option value="">All services</option>
                {serviceTypes.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm font-medium text-slate-700">
              <span>From date</span>
              <input
                type="date"
                className={inputClassName}
                value={filters.dateFrom}
                onChange={(e) => apply({ search: searchDraft, dateFrom: e.target.value })}
              />
            </label>
            <label className="space-y-1 text-sm font-medium text-slate-700">
              <span>To date</span>
              <input
                type="date"
                className={inputClassName}
                value={filters.dateTo}
                onChange={(e) => apply({ search: searchDraft, dateTo: e.target.value })}
              />
            </label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Button type="button" onClick={() => apply({ search: searchDraft })}>
              Apply filters
            </Button>
            <Button type="button" variant="secondary" disabled={!hasExtraFilters} onClick={clearFilters}>
              Clear
            </Button>
            <label className="ml-auto flex items-center gap-2 text-sm text-slate-700">
              <span className="whitespace-nowrap">Sort</span>
              <select
                className={`${selectClassName} w-auto min-w-[10rem]`}
                value={`${filters.sortBy}:${filters.sortDir}`}
                onChange={(e) => {
                  const [sortBy, sortDir] = e.target.value.split(':') as [SortField, SortDir];
                  apply({ search: searchDraft, sortBy, sortDir }, { resetPage: false });
                }}
              >
                {SORT_FIELDS.flatMap((f) => [
                  <option key={`${f.value}:desc`} value={`${f.value}:desc`}>
                    {f.label} ↓
                  </option>,
                  <option key={`${f.value}:asc`} value={`${f.value}:asc`}>
                    {f.label} ↑
                  </option>,
                ])}
              </select>
            </label>
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <span className="whitespace-nowrap">Rows</span>
              <select
                className={`${selectClassName} w-auto min-w-[7rem]`}
                value={filters.pageSize}
                onChange={(e) => apply({ search: searchDraft, pageSize: Number(e.target.value) })}
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

        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-xl border border-slate-100 bg-white px-4 py-3">
          <span className="text-sm font-medium text-slate-700">
            {selectAllMatching
              ? `All ${total} matching records selected`
              : selectedIds.size > 0
                ? `${selectedIds.size} selected`
                : 'No records selected'}
          </span>
          {selectedIds.size > 0 && !selectAllMatching && total > records.length ? (
            <button
              type="button"
              className="text-sm font-medium text-brand hover:underline"
              onClick={() => setSelectAllMatching(true)}
            >
              Select all {total} matching filters instead
            </button>
          ) : null}
          <div className="ml-auto flex flex-wrap gap-2">
            <Button
              type="button"
              variant="danger"
              size="sm"
              disabled={deleting || (!selectedIds.size && !selectAllMatching)}
              onClick={selectAllMatching ? deleteAllMatching : deleteSelected}
            >
              {deleting
                ? 'Deleting…'
                : selectAllMatching
                  ? `Delete all ${total} matching`
                  : `Delete selected (${selectedIds.size})`}
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <AppLoader label="Loading records..." />
          ) : !records.length ? (
            <EmptyState
              title="No repair records found"
              description="Try a different search or clear filters."
            />
          ) : (
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className={tableHeaderClassName}>
                    <input
                      type="checkbox"
                      checked={allOnPageSelected}
                      onChange={toggleAllOnPage}
                      aria-label="Select all on page"
                    />
                  </th>
                  <SortHeader field="jobNumber" label="Job #" />
                  <SortHeader field="customer" label="Customer" />
                  <th className={tableHeaderClassName}>Device / Issue</th>
                  <SortHeader field="status" label="Status" />
                  <th className={tableHeaderClassName}>Technician</th>
                  <th className={tableHeaderClassName}>Service</th>
                  <SortHeader field="receivedAt" label="Received" />
                  <SortHeader field="deliveredAt" label="Delivered" />
                  <SortHeader field="finalAmount" label="Amount" />
                  <th className={tableHeaderClassName}>Invoice</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {records.map((record) => (
                  <tr
                    key={record.id}
                    className={cn(
                      'transition hover:bg-slate-50',
                      selectedIds.has(record.id) && !selectAllMatching && 'bg-teal-50/50',
                    )}
                  >
                    <td className={tableCellClassName}>
                      <input
                        type="checkbox"
                        checked={selectAllMatching || selectedIds.has(record.id)}
                        disabled={selectAllMatching}
                        onChange={() => toggleRow(record.id)}
                        aria-label={`Select ${record.jobNumber}`}
                      />
                    </td>
                    <td className={tableCellClassName}>
                      <Link
                        href={`/dashboard/repairs/${record.id}`}
                        className="font-mono text-sm font-semibold text-brand hover:underline"
                      >
                        {record.jobNumber}
                      </Link>
                    </td>
                    <td className={tableCellClassName}>
                      <p className="font-medium text-slate-900">{record.customer?.name || '—'}</p>
                      <p className="text-xs text-slate-500">{record.customer?.phone || ''}</p>
                    </td>
                    <td className={tableCellClassName}>
                      <p className="text-slate-800">{record.deviceModel}</p>
                      <p className="text-xs text-slate-500">{record.issue}</p>
                    </td>
                    <td className={cn(tableCellClassName, 'whitespace-nowrap')}>
                      <StatusBadge status={record.status} />
                    </td>
                    <td className={tableCellClassName}>{record.technician?.name || '—'}</td>
                    <td className={tableCellClassName}>{record.serviceType?.name || '—'}</td>
                    <td className={tableCellClassName}>
                      <p className="whitespace-nowrap text-sm text-slate-700">
                        {formatDateTime(record.receivedAt)}
                      </p>
                    </td>
                    <td className={tableCellClassName}>
                      <p className="whitespace-nowrap text-sm text-slate-700">
                        {record.deliveredAt ? formatDateTime(record.deliveredAt) : '—'}
                      </p>
                    </td>
                    <td className={tableCellClassName}>
                      <p className="font-semibold text-slate-900">
                        {formatINR(toNumber(record.finalAmount ?? record.estimateAmount))}
                      </p>
                    </td>
                    <td className={tableCellClassName}>
                      {record.linkedInvoice ? (
                        <Link
                          href={`/dashboard/invoices/${record.linkedInvoice.id}`}
                          className="text-sm font-medium text-brand hover:underline"
                        >
                          {record.linkedInvoice.invoiceNumber}
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
                onClick={() => apply({ page: filters.page - 1 }, { resetPage: false })}
              >
                Previous
              </Button>
              {pageWindow(filters.page, totalPages).map((p) => (
                <Button
                  key={p}
                  type="button"
                  size="sm"
                  variant={p === filters.page ? 'primary' : 'secondary'}
                  onClick={() => apply({ page: p }, { resetPage: false })}
                >
                  {p}
                </Button>
              ))}
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={filters.page >= totalPages}
                onClick={() => apply({ page: filters.page + 1 }, { resetPage: false })}
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
