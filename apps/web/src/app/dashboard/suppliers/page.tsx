'use client';
import { AppLoader } from '@/app/_components/app-loader';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Button, Card, formatINR } from '@retail-sarathi/ui';
import { apiWithAuth } from '@/lib/helpers';
import { assertGstinOptional, INDIAN_STATE_OPTIONS, normalizeGstin, stateCodeFromGstin } from '@/lib/validators';
import {
  pageShellClassName,
  EmptyState,
  MessageBanner,
  PageHeader,
  cn,
  inputClassName,
  parseError,
  selectClassName,
  tableCellClassName,
  tableHeaderClassName,
} from '../_components/dashboard-ui';
import { ExportDropdown, fetchAndApplyExport } from '../_components/export-dropdown';

interface Supplier {
  id: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  gstin?: string | null;
  address?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  pincode?: string | null;
  country?: string | null;
  stateCode?: string | null;
  bankName?: string | null;
  bankAccount?: string | null;
  ifsc?: string | null;
  bankBranch?: string | null;
  isMsme?: boolean;
  paymentTermsDays?: number;
  outstandingBalance?: number | string;
  summary?: {
    pendingPayable?: number;
    clearedPayments?: number;
    paymentCount?: number;
    billCount?: number;
    openBillCount?: number;
    paidBillCount?: number;
    totalBilled?: number;
  };
}

type PayablesRow = {
  supplierId: string | null;
  name: string;
  gstin: string | null;
  phone: string | null;
  email?: string | null;
  address?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  pincode?: string | null;
  stateCode?: string | null;
  isMsme?: boolean;
  msmeOver45?: number;
  paymentTermsDays?: number | null;
  bankName?: string | null;
  ifsc?: string | null;
  outstanding: number;
  billCount: number;
  overdueCount: number;
};

type FormState = {
  name: string;
  phone: string;
  email: string;
  gstin: string;
  address: string;
  addressLine2: string;
  city: string;
  pincode: string;
  country: string;
  stateCode: string;
  bankName: string;
  bankAccount: string;
  ifsc: string;
  bankBranch: string;
  isMsme: boolean;
  paymentTermsDays: string;
};

const EMPTY_FORM: FormState = {
  name: '',
  phone: '',
  email: '',
  gstin: '',
  address: '',
  addressLine2: '',
  city: '',
  pincode: '',
  country: 'IN',
  stateCode: '',
  bankName: '',
  bankAccount: '',
  ifsc: '',
  bankBranch: '',
  isMsme: false,
  paymentTermsDays: '30',
};

type SortKey = 'name' | 'pending' | 'open';
type FilterKey = 'all' | 'due' | 'clear';

type DuesCalendar = {
  totalDue: number;
  billCount: number;
};

type BulkReminderResult = {
  count: number;
  items: Array<{ supplierId: string; name: string; waUrl: string | null }>;
};

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [payables, setPayables] = useState<PayablesRow[]>([]);
  const [duesCalendar, setDuesCalendar] = useState<DuesCalendar | null>(null);
  const [bulkResult, setBulkResult] = useState<BulkReminderResult | null>(null);
  const [bulkSending, setBulkSending] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showCreate, setShowCreate] = useState(false);
  const [showBankDetails, setShowBankDetails] = useState(false);
  const [createError, setCreateError] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [filter, setFilter] = useState<FilterKey>('all');
  const [sort, setSort] = useState<SortKey>('pending');
  const [filtersOpen, setFiltersOpen] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(query.trim()), 350);
    return () => window.clearTimeout(t);
  }, [query]);

  async function loadSuppliers(opts?: { q?: string; outstanding?: FilterKey; sort?: SortKey }) {
    const q = (opts?.q ?? debouncedQuery).trim();
    const outstanding = opts?.outstanding ?? filter;
    const sortBy = opts?.sort ?? sort;
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (outstanding !== 'all') params.set('outstanding', outstanding);
    if (sortBy) params.set('sort', sortBy);
    const qs = params.toString();
    return apiWithAuth<Supplier[]>(`/suppliers${qs ? `?${qs}` : ''}`);
  }

  async function load(opts?: { q?: string; outstanding?: FilterKey; sort?: SortKey }) {
    try {
      setLoading(true);
      setError('');
      const [list, payablesRows, calendar] = await Promise.all([
        loadSuppliers(opts),
        apiWithAuth<PayablesRow[]>('/suppliers/aging/report').catch(() => [] as PayablesRow[]),
        apiWithAuth<DuesCalendar>('/suppliers/dues-calendar').catch(() => null),
      ]);
      setSuppliers(list);
      setPayables(Array.isArray(payablesRows) ? payablesRows : []);
      setDuesCalendar(calendar);
    } catch (e) {
      setError(parseError(e));
    } finally {
      setLoading(false);
    }
  }

  async function handleBulkReminder() {
    try {
      setBulkSending(true);
      setError('');
      setBulkResult(null);
      const result = await apiWithAuth<BulkReminderResult>('/suppliers/reminders/bulk-overdue', { method: 'POST' });
      const normalized: BulkReminderResult = {
        count: Number(result?.count ?? 0),
        items: Array.isArray(result?.items) ? result.items : [],
      };
      setBulkResult(normalized);
      normalized.items.slice(0, 5).forEach((r) => {
        if (r.waUrl) window.open(r.waUrl, '_blank', 'noopener,noreferrer');
      });
      setSuccess(`Reminders sent to ${normalized.count} supplier(s).`);
    } catch (e) {
      setError(parseError(e));
    } finally {
      setBulkSending(false);
    }
  }

  useEffect(() => {
    void load({ q: debouncedQuery, outstanding: filter, sort });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reload when search/filter/sort change
  }, [debouncedQuery, filter, sort]);

  useEffect(() => {
    if (!showCreate) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !saving) closeCreate();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showCreate, saving]);

  function openCreate() {
    setForm(EMPTY_FORM);
    setShowBankDetails(false);
    setCreateError('');
    setShowCreate(true);
  }

  function closeCreate() {
    if (saving) return;
    setShowCreate(false);
    setCreateError('');
    setShowBankDetails(false);
    setForm(EMPTY_FORM);
  }

  const payablesSummary = useMemo(() => {
    return payables.reduce(
      (acc, row) => ({
        outstanding: acc.outstanding + Number(row.outstanding || 0),
        overdueCount: acc.overdueCount + Number(row.overdueCount || 0),
        withDues: acc.withDues + (Number(row.outstanding || 0) > 0.009 ? 1 : 0),
      }),
      { outstanding: 0, overdueCount: 0, withDues: 0 },
    );
  }, [payables]);

  const rows = useMemo(
    () =>
      suppliers.map((s) => ({
        ...s,
        pending: Number(s.summary?.pendingPayable ?? s.outstandingBalance ?? 0),
        open: Number(s.summary?.openBillCount ?? 0),
      })),
    [suppliers],
  );

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      setCreateError('Supplier name is required.');
      return;
    }
    try {
      assertGstinOptional(form.gstin);
      setSaving(true);
      setCreateError('');
      setError('');
      await apiWithAuth('/suppliers', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name.trim(),
          phone: form.phone.trim() || undefined,
          email: form.email.trim() || undefined,
          gstin: assertGstinOptional(form.gstin),
          address: form.address.trim() || undefined,
          addressLine2: form.addressLine2.trim() || undefined,
          city: form.city.trim() || undefined,
          pincode: form.pincode.trim() || undefined,
          country: form.country.trim() || 'IN',
          stateCode: form.stateCode.trim() || stateCodeFromGstin(form.gstin) || undefined,
          bankName: form.bankName.trim() || undefined,
          bankAccount: form.bankAccount.trim() || undefined,
          ifsc: form.ifsc.trim() || undefined,
          bankBranch: form.bankBranch.trim() || undefined,
          isMsme: form.isMsme,
          paymentTermsDays: Number(form.paymentTermsDays) || 30,
        }),
      });
      setForm(EMPTY_FORM);
      setShowBankDetails(false);
      setShowCreate(false);
      setSuccess('Supplier created.');
      await load();
    } catch (err) {
      setCreateError(parseError(err));
    } finally {
      setSaving(false);
    }
  }

  function startEdit(s: Supplier) {
    setEditingId(s.id);
    setEditForm({
      name: s.name,
      phone: s.phone ?? '',
      email: s.email ?? '',
      gstin: s.gstin ?? '',
      address: s.address ?? '',
      addressLine2: s.addressLine2 ?? '',
      city: s.city ?? '',
      pincode: s.pincode ?? '',
      country: s.country ?? 'IN',
      stateCode: s.stateCode ?? stateCodeFromGstin(s.gstin) ?? '',
      bankName: s.bankName ?? '',
      bankAccount: s.bankAccount ?? '',
      ifsc: s.ifsc ?? '',
      bankBranch: s.bankBranch ?? '',
      isMsme: Boolean(s.isMsme),
      paymentTermsDays: String(s.paymentTermsDays ?? 30),
    });
  }

  async function handleSave(id: string) {
    try {
      assertGstinOptional(editForm.gstin);
      setSaving(true);
      setError('');
      await apiWithAuth(`/suppliers/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: editForm.name.trim(),
          phone: editForm.phone.trim() || undefined,
          email: editForm.email.trim() || undefined,
          gstin: assertGstinOptional(editForm.gstin),
          address: editForm.address.trim() || null,
          addressLine2: editForm.addressLine2.trim() || null,
          city: editForm.city.trim() || null,
          pincode: editForm.pincode.trim() || null,
          country: editForm.country.trim() || 'IN',
          stateCode: editForm.stateCode.trim() || stateCodeFromGstin(editForm.gstin) || null,
          bankName: editForm.bankName.trim() || null,
          bankAccount: editForm.bankAccount.trim() || null,
          ifsc: editForm.ifsc.trim() || null,
          bankBranch: editForm.bankBranch.trim() || null,
          isMsme: editForm.isMsme,
          paymentTermsDays: Number(editForm.paymentTermsDays) || 30,
        }),
      });
      setEditingId(null);
      setSuccess('Supplier updated.');
      await load();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={pageShellClassName}>
      <PageHeader
        title="Suppliers & ledger"
        description="Payables khata — who you owe, what’s overdue, and bill-wise settlement."
        actions={
          <Button type="button" size="sm" onClick={openCreate}>
            + Add supplier
          </Button>
        }
      />
      {error ? <MessageBanner tone="error">{error}</MessageBanner> : null}
      {success ? <MessageBanner tone="success">{success}</MessageBanner> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="border-rose-200 bg-rose-50/40 p-4">
          <p className="text-xs font-medium text-slate-500">Total payable</p>
          <p className="mt-1 text-xl font-semibold text-rose-700">{formatINR(payablesSummary.outstanding)}</p>
          <p className="mt-1 text-xs text-slate-500">
            {payablesSummary.withDues} supplier{payablesSummary.withDues === 1 ? '' : 's'} with open dues
          </p>
        </Card>
        <Card className="border-amber-200 bg-amber-50/40 p-4">
          <p className="text-xs font-medium text-slate-500">Overdue bills</p>
          <p className="mt-1 text-xl font-semibold text-amber-800">{payablesSummary.overdueCount}</p>
          <p className="mt-1 text-xs text-slate-500">Past due date — clear these first</p>
        </Card>
        <Card className="border-blue-100 bg-blue-50/40 p-4">
          <p className="text-xs font-medium text-slate-500">Pay this week</p>
          <p className="mt-1 text-xl font-semibold text-blue-800">
            {duesCalendar != null ? formatINR(duesCalendar.totalDue) : '—'}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {duesCalendar != null ? `${duesCalendar.billCount} bill(s) due` : 'Calendar unavailable'}
          </p>
        </Card>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <Link href="/dashboard/purchase-bills?unpaidOnly=1" className="font-medium text-teal-700 underline">
          All unpaid bills
        </Link>
        <Link href="/dashboard/reports?tab=supplier" className="font-medium text-teal-700 underline">
          Statement PDF
        </Link>
        <Button type="button" variant="secondary" disabled={bulkSending} onClick={() => void handleBulkReminder()}>
          {bulkSending ? 'Sending…' : 'Message all overdue'}
        </Button>
      </div>

      {payables.length > 0 ? (
        <Card className="border-slate-200 p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-base font-semibold text-slate-900">Who you owe</h2>
              <p className="text-xs text-slate-500">Highest outstanding first — settle from the ledger</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <ExportDropdown
                onExport={(format) => {
                  void (async () => {
                    try {
                      setSuccess(await fetchAndApplyExport('/reports/payables', format));
                    } catch (e) {
                      setError(parseError(e));
                    }
                  })();
                }}
              />
            </div>
          </div>
          {bulkResult != null ? (
            <div className="mb-3 rounded-xl border border-teal-200 bg-teal-50 p-3 text-xs text-teal-900">
              <p className="font-semibold">Sent to {bulkResult.count} supplier(s)</p>
              {(bulkResult.items ?? []).filter((r) => r.waUrl).length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {(bulkResult.items ?? []).filter((r) => r.waUrl).map((r) => (
                    <a
                      key={r.supplierId}
                      href={r.waUrl!}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-teal-700 underline"
                    >
                      WA: {r.name}
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className={tableHeaderClassName}>Supplier</th>
                  <th className={tableHeaderClassName}>Contact</th>
                  <th className={tableHeaderClassName}>GSTIN / Address</th>
                  <th className={tableHeaderClassName}>Outstanding</th>
                  <th className={tableHeaderClassName}>Open bills</th>
                  <th className={tableHeaderClassName}>Status</th>
                  <th className={tableHeaderClassName} />
                </tr>
              </thead>
              <tbody>
                {payables.slice(0, 10).map((row) => {
                  const stateName = row.stateCode
                    ? INDIAN_STATE_OPTIONS.find((s) => s.code === row.stateCode)?.name ?? row.stateCode
                    : null;
                  const addr = [row.address, row.addressLine2, row.city, stateName, row.pincode]
                    .filter(Boolean)
                    .join(', ');
                  return (
                  <tr key={row.supplierId || row.name} className="border-t border-slate-100">
                    <td className={tableCellClassName}>
                      <div className="font-medium text-slate-900">{row.name}</div>
                      <div className="mt-0.5 flex flex-wrap gap-1">
                        {row.isMsme ? (
                          <span className="inline-flex rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-800">
                            MSME
                          </span>
                        ) : null}
                        {row.paymentTermsDays != null ? (
                          <span className="inline-flex rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                            {row.paymentTermsDays}d
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className={tableCellClassName}>
                      <div>{row.phone || '—'}</div>
                      {row.email ? <div className="text-xs text-slate-500">{row.email}</div> : null}
                      {row.bankName || row.ifsc ? (
                        <div className="text-[11px] text-slate-500">
                          {[row.bankName, row.ifsc].filter(Boolean).join(' · ')}
                        </div>
                      ) : null}
                    </td>
                    <td className={tableCellClassName}>
                      <div className="font-mono text-xs">{row.gstin || '—'}</div>
                      {addr ? <div className="mt-0.5 text-xs text-slate-500">{addr}</div> : null}
                    </td>
                    <td className={tableCellClassName}>
                      <span className="font-semibold text-rose-700">{formatINR(row.outstanding)}</span>
                    </td>
                    <td className={tableCellClassName}>{row.billCount}</td>
                    <td className={tableCellClassName}>
                      <div className="flex flex-wrap gap-1">
                        {row.overdueCount > 0 ? (
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-900">
                            {row.overdueCount} overdue
                          </span>
                        ) : (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">
                            On track
                          </span>
                        )}
                        {(row.msmeOver45 ?? 0) > 0.009 ? (
                          <span className="rounded border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold text-rose-800">
                            MSME 45d+ {formatINR(row.msmeOver45!)}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className={tableCellClassName}>
                      {row.supplierId ? (
                        <Link href={`/dashboard/suppliers/${row.supplierId}`}>
                          <Button type="button" variant="secondary">
                            Settle
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
        </Card>
      ) : null}

      {showCreate ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/45 p-0 sm:items-start sm:justify-center sm:p-4 sm:pt-6">
          <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={closeCreate} />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-supplier-title"
            className="relative z-10 flex max-h-[min(92vh,880px)] w-[80vw] max-w-[80vw] flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-xl sm:mt-0 sm:rounded-2xl"
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
              <div>
                <h2 id="add-supplier-title" className="text-lg font-semibold text-slate-900">
                  Add supplier
                </h2>
                <p className="mt-0.5 text-sm text-slate-500">Name is enough to start — GSTIN and bank help payments later.</p>
              </div>
              <Button type="button" size="sm" variant="secondary" onClick={closeCreate} disabled={saving}>
                Close
              </Button>
            </div>

            <form onSubmit={(e) => void handleCreate(e)} className="flex min-h-0 flex-1 flex-col">
              <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4">
                {createError ? (
                  <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{createError}</p>
                ) : null}

                <section className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Contact</h3>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <label className="space-y-1 text-sm font-medium text-slate-700 sm:col-span-2 lg:col-span-3">
                      <span>
                        Supplier name <span className="text-rose-600">*</span>
                      </span>
                      <input
                        className={inputClassName}
                        autoFocus
                        required
                        value={form.name}
                        onChange={(e) => setForm({ ...form, name: e.target.value })}
                        placeholder="Supplier / firm name"
                      />
                    </label>
                    <label className="space-y-1 text-sm font-medium text-slate-700">
                      <span>Phone</span>
                      <input
                        className={inputClassName}
                        inputMode="tel"
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        placeholder="WhatsApp / landline"
                      />
                    </label>
                    <label className="space-y-1 text-sm font-medium text-slate-700">
                      <span>GSTIN</span>
                      <input
                        className={inputClassName}
                        value={form.gstin}
                        onChange={(e) => {
                          const gstin = normalizeGstin(e.target.value);
                          const stateCode = stateCodeFromGstin(gstin);
                          setForm({
                            ...form,
                            gstin,
                            ...(stateCode ? { stateCode } : {}),
                          });
                        }}
                        placeholder="15-character GSTIN"
                        maxLength={15}
                      />
                    </label>
                    <label className="space-y-1 text-sm font-medium text-slate-700">
                      <span>Email</span>
                      <input
                        className={inputClassName}
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        placeholder="accounts@…"
                      />
                    </label>
                  </div>
                </section>

                <section className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Address</h3>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <label className="space-y-1 text-sm font-medium text-slate-700 sm:col-span-2 lg:col-span-3">
                      <span>Address line 1</span>
                      <input
                        className={inputClassName}
                        value={form.address}
                        onChange={(e) => setForm({ ...form, address: e.target.value })}
                        placeholder="Building / street / market"
                      />
                    </label>
                    <label className="space-y-1 text-sm font-medium text-slate-700 sm:col-span-2 lg:col-span-3">
                      <span>Address line 2</span>
                      <input
                        className={inputClassName}
                        value={form.addressLine2}
                        onChange={(e) => setForm({ ...form, addressLine2: e.target.value })}
                        placeholder="Area / landmark"
                      />
                    </label>
                    <label className="space-y-1 text-sm font-medium text-slate-700">
                      <span>City</span>
                      <input
                        className={inputClassName}
                        value={form.city}
                        onChange={(e) => setForm({ ...form, city: e.target.value })}
                      />
                    </label>
                    <label className="space-y-1 text-sm font-medium text-slate-700">
                      <span>State</span>
                      <select
                        className={selectClassName}
                        value={form.stateCode}
                        onChange={(e) => setForm({ ...form, stateCode: e.target.value })}
                      >
                        <option value="">Select state</option>
                        {INDIAN_STATE_OPTIONS.map((s) => (
                          <option key={s.code} value={s.code}>
                            {s.name} ({s.code})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="space-y-1 text-sm font-medium text-slate-700">
                      <span>PIN code</span>
                      <input
                        className={inputClassName}
                        value={form.pincode}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            pincode: e.target.value.replace(/\D/g, '').slice(0, 6),
                          })
                        }
                        inputMode="numeric"
                        maxLength={6}
                      />
                    </label>
                    <label className="space-y-1 text-sm font-medium text-slate-700">
                      <span>Country</span>
                      <input
                        className={inputClassName}
                        value={form.country}
                        onChange={(e) => setForm({ ...form, country: e.target.value.toUpperCase() })}
                        maxLength={2}
                        placeholder="IN"
                      />
                    </label>
                  </div>
                </section>

                <section className="space-y-3">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Credit terms</h3>
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    <label className="space-y-1 text-sm font-medium text-slate-700">
                      <span>Payment terms (days)</span>
                      <input
                        className={inputClassName}
                        type="number"
                        min={1}
                        value={form.paymentTermsDays}
                        onChange={(e) => setForm({ ...form, paymentTermsDays: e.target.value })}
                      />
                    </label>
                    <label className="flex min-h-[2.75rem] items-center gap-2.5 self-end rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-medium text-slate-700">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-600"
                        checked={form.isMsme}
                        onChange={(e) => setForm({ ...form, isMsme: e.target.checked })}
                      />
                      MSME registered
                    </label>
                  </div>
                </section>

                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bank details</h3>
                    <Button type="button" size="sm" variant="secondary" onClick={() => setShowBankDetails((v) => !v)}>
                      {showBankDetails ? 'Hide' : 'Add for NEFT'}
                    </Button>
                  </div>
                  {showBankDetails ? (
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="space-y-1 text-sm font-medium text-slate-700">
                        <span>Bank name</span>
                        <input
                          className={inputClassName}
                          value={form.bankName}
                          onChange={(e) => setForm({ ...form, bankName: e.target.value })}
                        />
                      </label>
                      <label className="space-y-1 text-sm font-medium text-slate-700">
                        <span>Account no.</span>
                        <input
                          className={inputClassName}
                          value={form.bankAccount}
                          onChange={(e) => setForm({ ...form, bankAccount: e.target.value })}
                        />
                      </label>
                      <label className="space-y-1 text-sm font-medium text-slate-700">
                        <span>IFSC</span>
                        <input
                          className={inputClassName}
                          value={form.ifsc}
                          onChange={(e) => setForm({ ...form, ifsc: e.target.value.toUpperCase() })}
                          maxLength={11}
                        />
                      </label>
                      <label className="space-y-1 text-sm font-medium text-slate-700">
                        <span>Branch</span>
                        <input
                          className={inputClassName}
                          value={form.bankBranch}
                          onChange={(e) => setForm({ ...form, bankBranch: e.target.value })}
                        />
                      </label>
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">Optional — useful when you pay by NEFT/RTGS from the ledger.</p>
                  )}
                </section>
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/80 px-5 py-3">
                <Button type="button" variant="secondary" onClick={closeCreate} disabled={saving}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? 'Saving…' : 'Add supplier'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="min-w-[12rem] flex-1 space-y-1 text-sm font-medium text-slate-700">
            <span>Search</span>
            <input
              className={inputClassName}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Name, GSTIN, phone, bank…"
            />
          </label>
          <button
            type="button"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
          >
            Filters
            {(filter !== 'all' || sort !== 'pending') && !filtersOpen ? (
              <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-semibold text-teal-800">
                {filter !== 'all' ? filter : ''}
                {filter !== 'all' && sort !== 'pending' ? ' · ' : ''}
                {sort !== 'pending' ? sort : ''}
              </span>
            ) : null}
            <span className="text-slate-400" aria-hidden>
              {filtersOpen ? '▾' : '▸'}
            </span>
          </button>
          <p className="pb-2 text-xs text-slate-500">{rows.length} shown</p>
        </div>
        {filtersOpen ? (
          <div className="flex flex-wrap items-end gap-3 border-t border-slate-100 pt-3">
            <label className="space-y-1 text-sm font-medium text-slate-700">
              <span>Show</span>
              <select
                className={selectClassName}
                value={filter}
                onChange={(e) => setFilter(e.target.value as FilterKey)}
              >
                <option value="all">All suppliers</option>
                <option value="due">With payable</option>
                <option value="clear">Settled (₹0)</option>
              </select>
            </label>
            <label className="space-y-1 text-sm font-medium text-slate-700">
              <span>Sort</span>
              <select
                className={selectClassName}
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
              >
                <option value="pending">Highest payable</option>
                <option value="open">Most open bills</option>
                <option value="name">Name A–Z</option>
              </select>
            </label>
          </div>
        ) : null}
      </div>

      {loading ? (
        <AppLoader label="Loading…" size="sm" />
      ) : rows.length === 0 ? (
        <EmptyState
          title={debouncedQuery || filter !== 'all' ? 'No matches' : 'No suppliers'}
          description={
            debouncedQuery || filter !== 'all'
              ? 'Try another search or clear the filter.'
              : 'Add a vendor, or confirm stock-in — suppliers are created from invoices automatically.'
          }
          action={
            !debouncedQuery && filter === 'all' ? (
              <Button type="button" onClick={openCreate}>
                + Add supplier
              </Button>
            ) : undefined
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className={tableHeaderClassName}>Supplier</th>
                <th className={tableHeaderClassName}>GSTIN</th>
                <th className={tableHeaderClassName}>Pending payable</th>
                <th className={tableHeaderClassName}>Bills</th>
                <th className={tableHeaderClassName}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} className="border-t border-slate-100">
                  <td className={tableCellClassName}>
                    {editingId === s.id ? (
                      <div className="grid max-w-xl gap-2 sm:grid-cols-2">
                        <input
                          className={cn(inputClassName, 'sm:col-span-2')}
                          value={editForm.name}
                          onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                          placeholder="Name"
                        />
                        <input
                          className={inputClassName}
                          placeholder="Phone"
                          value={editForm.phone}
                          onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                        />
                        <input
                          className={inputClassName}
                          placeholder="Email"
                          value={editForm.email}
                          onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                        />
                        <input
                          className={cn(inputClassName, 'sm:col-span-2')}
                          placeholder="Address line 1"
                          value={editForm.address}
                          onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                        />
                        <input
                          className={cn(inputClassName, 'sm:col-span-2')}
                          placeholder="Address line 2"
                          value={editForm.addressLine2}
                          onChange={(e) => setEditForm({ ...editForm, addressLine2: e.target.value })}
                        />
                        <input
                          className={inputClassName}
                          placeholder="City"
                          value={editForm.city}
                          onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                        />
                        <select
                          className={selectClassName}
                          value={editForm.stateCode}
                          onChange={(e) => setEditForm({ ...editForm, stateCode: e.target.value })}
                        >
                          <option value="">State</option>
                          {INDIAN_STATE_OPTIONS.map((st) => (
                            <option key={st.code} value={st.code}>
                              {st.name} ({st.code})
                            </option>
                          ))}
                        </select>
                        <input
                          className={inputClassName}
                          placeholder="PIN"
                          value={editForm.pincode}
                          onChange={(e) =>
                            setEditForm({
                              ...editForm,
                              pincode: e.target.value.replace(/\D/g, '').slice(0, 6),
                            })
                          }
                          maxLength={6}
                        />
                        <input
                          className={inputClassName}
                          placeholder="Country"
                          value={editForm.country}
                          onChange={(e) => setEditForm({ ...editForm, country: e.target.value.toUpperCase() })}
                          maxLength={2}
                        />
                        <input
                          className={inputClassName}
                          placeholder="Bank name"
                          value={editForm.bankName}
                          onChange={(e) => setEditForm({ ...editForm, bankName: e.target.value })}
                        />
                        <input
                          className={inputClassName}
                          placeholder="Account"
                          value={editForm.bankAccount}
                          onChange={(e) => setEditForm({ ...editForm, bankAccount: e.target.value })}
                        />
                        <input
                          className={inputClassName}
                          placeholder="IFSC"
                          value={editForm.ifsc}
                          onChange={(e) => setEditForm({ ...editForm, ifsc: e.target.value.toUpperCase() })}
                        />
                        <label className="flex items-center gap-2 text-sm">
                          <input
                            type="checkbox"
                            checked={editForm.isMsme}
                            onChange={(e) => setEditForm({ ...editForm, isMsme: e.target.checked })}
                          />
                          MSME
                        </label>
                        <input
                          className={inputClassName}
                          type="number"
                          min="1"
                          placeholder="Payment terms (days)"
                          value={editForm.paymentTermsDays}
                          onChange={(e) => setEditForm({ ...editForm, paymentTermsDays: e.target.value })}
                        />
                      </div>
                    ) : (
                      <>
                        <Link href={`/dashboard/suppliers/${s.id}`} className="font-medium text-teal-700 underline">
                          {s.name}
                        </Link>
                        <div className="text-xs text-slate-500">{s.phone || s.email || '—'}</div>
                        {s.bankName || s.ifsc ? (
                          <div className="text-xs text-slate-400">
                            {[s.bankName, s.ifsc].filter(Boolean).join(' · ')}
                          </div>
                        ) : null}
                      </>
                    )}
                  </td>
                  <td className={tableCellClassName}>
                    {editingId === s.id ? (
                      <input
                        className={inputClassName}
                        value={editForm.gstin}
                        onChange={(e) => setEditForm({ ...editForm, gstin: e.target.value.toUpperCase() })}
                      />
                    ) : (
                      s.gstin || '—'
                    )}
                  </td>
                  <td className={tableCellClassName}>
                    <span className={cn('font-semibold', s.pending > 0.009 ? 'text-rose-700' : 'text-teal-800')}>
                      {formatINR(s.pending)}
                    </span>
                    {(s.summary?.clearedPayments ?? 0) > 0 ? (
                      <div className="text-xs text-slate-500">
                        Cleared {formatINR(Number(s.summary?.clearedPayments))}
                      </div>
                    ) : null}
                  </td>
                  <td className={tableCellClassName}>
                    <span className="text-slate-700">{s.summary?.openBillCount ?? 0} open</span>
                    <div className="text-xs text-slate-500">
                      {s.summary?.paidBillCount ?? 0} paid
                      {(s.summary?.paymentCount ?? 0) > 0 ? ` · ${s.summary?.paymentCount} payments` : ''}
                    </div>
                  </td>
                  <td className={tableCellClassName}>
                    {editingId === s.id ? (
                      <div className="flex flex-wrap gap-2">
                        <Button type="button" onClick={() => void handleSave(s.id)}>
                          Save
                        </Button>
                        <Button type="button" variant="secondary" onClick={() => setEditingId(null)}>
                          Cancel
                        </Button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        <Link href={`/dashboard/suppliers/${s.id}`}>
                          <Button type="button" variant="secondary">
                            Ledger
                          </Button>
                        </Link>
                        <Button type="button" variant="secondary" onClick={() => startEdit(s)}>
                          Edit
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
