'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Button, Card, formatINR } from '@retail-sarathi/ui';
import { confirmDialog } from '@/app/_components/confirm-dialog';
import { apiWithAuth } from '@/lib/helpers';
import {
  pageShellClassName,
  MessageBanner,
  PageHeader,
  cn,
  inputClassName,
  parseError,
  selectClassName,
  textareaClassName,
  toNumber,
} from '../_components/dashboard-ui';

type CustomerOption = { id: string; name: string; phone: string };

type TradeInRow = {
  id: string;
  deviceModel: string;
  imei: string | null;
  condition: string;
  quotedValue: number | string;
  finalValue: number | string | null;
  status: string;
  notes: string | null;
  customerId: string | null;
  refurbProductId: string | null;
  missingFields: string[];
  updatedAt: string;
  customer: CustomerOption | null;
};

type EditForm = {
  deviceModel: string;
  imei: string;
  condition: string;
  quotedValue: string;
  finalValue: string;
  notes: string;
  salePrice: string;
};

const FIELD_LABELS: Record<string, string> = {
  deviceModel: 'Device model',
  quotedValue: 'Quote ₹',
  imei: 'IMEI',
  finalValue: 'Final ₹',
};

const STATUS_FILTERS = [
  { value: 'OPEN', label: 'Open pipeline' },
  { value: 'QUOTED', label: 'Quoted' },
  { value: 'ACCEPTED', label: 'Accepted' },
  { value: 'RECEIVED', label: 'Received' },
  { value: 'REFURBISHED', label: 'Refurbished' },
  { value: 'REJECTED', label: 'Rejected' },
  { value: 'ALL', label: 'All' },
];

function editFromRow(row: TradeInRow): EditForm {
  return {
    deviceModel: row.deviceModel || '',
    imei: row.imei || '',
    condition: row.condition || 'REFURB',
    quotedValue: row.quotedValue != null ? String(toNumber(row.quotedValue)) : '',
    finalValue: row.finalValue != null ? String(toNumber(row.finalValue)) : '',
    notes: row.notes || '',
    salePrice: '',
  };
}

function missingFromEdit(row: TradeInRow, form: EditForm | undefined): string[] {
  const prior = row.missingFields?.length ? row.missingFields : [];
  const out: string[] = [];
  if (!(form?.deviceModel || '').trim()) out.push('deviceModel');
  if (!(toNumber(form?.quotedValue) > 0)) out.push('quotedValue');
  if (
    (prior.includes('imei') || ['ACCEPTED', 'RECEIVED'].includes(row.status)) &&
    !(form?.imei || '').trim()
  ) {
    out.push('imei');
  }
  return [...new Set(out)];
}

export default function TradeInPage() {
  const [items, setItems] = useState<TradeInRow[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [statusFilter, setStatusFilter] = useState('OPEN');
  const [form, setForm] = useState({
    customerId: '',
    deviceModel: '',
    imei: '',
    quotedValue: '',
    condition: 'REFURB',
    notes: '',
  });
  const [edits, setEdits] = useState<Record<string, EditForm>>({});
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const load = useCallback(async (status = statusFilter) => {
    try {
      setError('');
      const [rows, customerRes] = await Promise.all([
        apiWithAuth<TradeInRow[]>(`/trade-in?status=${encodeURIComponent(status)}`),
        apiWithAuth<{ items: CustomerOption[] }>('/customers?pageSize=200'),
      ]);
      setItems(rows);
      setCustomers(customerRes.items || []);
      const next: Record<string, EditForm> = {};
      for (const row of rows) next[row.id] = editFromRow(row);
      setEdits(next);
      setExpandedId((prev) => {
        if (rows.length === 0) return null;
        if (prev && rows.some((r) => r.id === prev)) return prev;
        return rows[0].id;
      });
    } catch (err) {
      setError(parseError(err));
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  function patchEdit(id: string, patch: Partial<EditForm>) {
    setEdits((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  async function createQuote(e: React.FormEvent) {
    e.preventDefault();
    const missing: string[] = [];
    if (!form.deviceModel.trim()) missing.push('deviceModel');
    if (!(toNumber(form.quotedValue) > 0)) missing.push('quotedValue');
    if (missing.length) {
      setError(`Fill required fields: ${missing.map((f) => FIELD_LABELS[f] || f).join(', ')}`);
      return;
    }
    try {
      setCreating(true);
      setError('');
      setSuccess('');
      await apiWithAuth('/trade-in', {
        method: 'POST',
        body: JSON.stringify({
          customerId: form.customerId || undefined,
          deviceModel: form.deviceModel.trim(),
          imei: form.imei.trim() || undefined,
          quotedValue: toNumber(form.quotedValue),
          condition: form.condition,
          notes: form.notes.trim() || undefined,
        }),
      });
      setForm({
        customerId: '',
        deviceModel: '',
        imei: '',
        quotedValue: '',
        condition: 'REFURB',
        notes: '',
      });
      setSuccess('Trade-in quoted — accept when the customer agrees.');
      await load();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setCreating(false);
    }
  }

  async function saveDetails(id: string) {
    const formState = edits[id];
    const row = items.find((r) => r.id === id);
    if (!formState || !row) return;
    // Allow saving IMEI even when still quoted; block empty model/quote
    if (!(formState.deviceModel || '').trim() || !(toNumber(formState.quotedValue) > 0)) {
      setError('Device model and quote ₹ are required.');
      setExpandedId(id);
      return;
    }
    try {
      setBusyId(id);
      setError('');
      setSuccess('');
      const updated = await apiWithAuth<TradeInRow>(`/trade-in/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          deviceModel: formState.deviceModel.trim(),
          imei: formState.imei.trim() || undefined,
          condition: formState.condition,
          quotedValue: toNumber(formState.quotedValue),
          finalValue: formState.finalValue ? toNumber(formState.finalValue) : undefined,
          notes: formState.notes.trim() || undefined,
        }),
      });
      setSuccess(
        updated.missingFields?.length
          ? `Saved — still need: ${updated.missingFields.map((f) => FIELD_LABELS[f] || f).join(', ')}`
          : 'Details saved.',
      );
      await load();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setBusyId(null);
    }
  }

  async function setStatus(id: string, status: string) {
    const formState = edits[id];
    const row = items.find((r) => r.id === id);
    if (status === 'REJECTED') {
      const ok = await confirmDialog.confirm({
        title: 'Reject trade-in?',
        message: 'This closes the quote. It will leave the open pipeline.',
        confirmLabel: 'Reject',
        tone: 'danger',
      });
      if (!ok) return;
    }
    if ((status === 'RECEIVED' || status === 'ACCEPTED') && row) {
      const still = missingFromEdit(row, formState);
      if (status === 'RECEIVED' && still.includes('imei')) {
        setError('Fill IMEI / serial before marking received.');
        setExpandedId(id);
        return;
      }
    }
    try {
      setBusyId(id);
      setError('');
      setSuccess('');
      // Persist IMEI/final before status move when present
      if (formState && (formState.imei.trim() || formState.finalValue)) {
        await apiWithAuth(`/trade-in/${id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            imei: formState.imei.trim() || undefined,
            finalValue: formState.finalValue ? toNumber(formState.finalValue) : undefined,
          }),
        });
      }
      await apiWithAuth(`/trade-in/${id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          finalValue: formState?.finalValue
            ? toNumber(formState.finalValue)
            : formState?.quotedValue
              ? toNumber(formState.quotedValue)
              : undefined,
        }),
      });
      setSuccess(
        status === 'ACCEPTED'
          ? 'Accepted — add IMEI if missing, then receive or convert.'
          : status === 'RECEIVED'
            ? 'Device received — convert to refurb inventory.'
            : status === 'REJECTED'
              ? 'Trade-in rejected.'
              : `Status → ${status}`,
      );
      await load();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setBusyId(null);
    }
  }

  async function convert(id: string) {
    const formState = edits[id];
    const row = items.find((r) => r.id === id);
    if (!row || !formState) return;
    const still = missingFromEdit(row, formState);
    if (still.length) {
      setError(`Fill required fields before inventory: ${still.map((f) => FIELD_LABELS[f] || f).join(', ')}`);
      setExpandedId(id);
      return;
    }
    const ok = await confirmDialog.confirm({
      title: 'Add to refurb inventory?',
      message: 'Creates a tracked-serial product, queues it for barcode/details, and marks this trade-in refurbished.',
      confirmLabel: 'Convert',
    });
    if (!ok) return;
    try {
      setBusyId(id);
      setError('');
      setSuccess('');
      await apiWithAuth(`/trade-in/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          imei: formState.imei.trim(),
          finalValue: formState.finalValue
            ? toNumber(formState.finalValue)
            : toNumber(formState.quotedValue),
        }),
      });
      const result = await apiWithAuth<{ product?: { sku: string; name: string } }>(
        `/trade-in/${id}/convert-to-inventory`,
        {
          method: 'POST',
          body: JSON.stringify({
            salePrice: formState.salePrice ? toNumber(formState.salePrice) : undefined,
          }),
        },
      );
      setSuccess(
        result.product
          ? `Added ${result.product.name} (${result.product.sku}) — finish barcode in Products needing details.`
          : 'Added to refurb inventory.',
      );
      await load();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setBusyId(null);
    }
  }

  const createMissing = [
    ...(!form.deviceModel.trim() ? ['deviceModel'] : []),
    ...(!(toNumber(form.quotedValue) > 0) ? ['quotedValue'] : []),
  ];

  return (
    <div className={pageShellClassName}>
      <PageHeader
        title="Trade-in"
        description="Quote buy-back, accept, receive the device, then convert to refurb stock. Required chips must be clear before inventory."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/products-needing-details">
              <Button type="button" variant="secondary">
                Needing details
              </Button>
            </Link>
            <Button type="button" variant="secondary" onClick={() => void load()}>
              Refresh
            </Button>
          </div>
        }
      />
      {error ? <MessageBanner tone="error">{error}</MessageBanner> : null}
      {success ? <MessageBanner tone="success">{success}</MessageBanner> : null}

      <Card className="border-slate-200 p-4 sm:p-5">
        <h2 className="text-base font-semibold text-slate-900">New quote</h2>
        <p className="mt-1 text-sm text-slate-500">
          Capture model and offer price. IMEI can wait until accept / receive.
        </p>
        <form className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3" onSubmit={(e) => void createQuote(e)}>
          <label
            className={cn(
              'space-y-1.5 text-xs font-semibold uppercase tracking-wide',
              createMissing.includes('deviceModel') ? 'text-amber-800' : 'text-slate-500',
            )}
          >
            Device model *
            <input
              className={cn(
                inputClassName,
                createMissing.includes('deviceModel') ? 'border-amber-300 ring-1 ring-amber-100' : '',
              )}
              placeholder="e.g. iPhone 12 128GB"
              value={form.deviceModel}
              onChange={(e) => setForm({ ...form, deviceModel: e.target.value })}
            />
          </label>
          <label className="space-y-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            IMEI / serial
            <input
              className={inputClassName}
              placeholder="Optional at quote"
              value={form.imei}
              onChange={(e) => setForm({ ...form, imei: e.target.value })}
            />
          </label>
          <label
            className={cn(
              'space-y-1.5 text-xs font-semibold uppercase tracking-wide',
              createMissing.includes('quotedValue') ? 'text-amber-800' : 'text-slate-500',
            )}
          >
            Quote ₹ *
            <input
              className={cn(
                inputClassName,
                createMissing.includes('quotedValue') ? 'border-amber-300 ring-1 ring-amber-100' : '',
              )}
              type="number"
              min="0.01"
              step="0.01"
              placeholder="₹"
              value={form.quotedValue}
              onChange={(e) => setForm({ ...form, quotedValue: e.target.value })}
            />
          </label>
          <label className="space-y-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Condition
            <select
              className={selectClassName}
              value={form.condition}
              onChange={(e) => setForm({ ...form, condition: e.target.value })}
            >
              {['NEW', 'REFURB', 'OPEN_BOX'].map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Customer
            <select
              className={selectClassName}
              value={form.customerId}
              onChange={(e) => setForm({ ...form, customerId: e.target.value })}
            >
              <option value="">Walk-in / none</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.phone})
                </option>
              ))}
          </select>
          </label>
          <label className="space-y-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:col-span-2 lg:col-span-3">
            Notes
            <textarea
              className={`${textareaClassName} min-h-[64px]`}
              placeholder="Screen condition, box, accessories…"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
            />
          </label>
          <div className="flex flex-wrap items-center gap-2 sm:col-span-2 lg:col-span-3">
            <Button type="submit" disabled={creating || createMissing.length > 0}>
              {creating ? 'Saving…' : 'Create quote'}
            </Button>
            {createMissing.length ? (
              <span className="text-xs text-amber-800">
                Required: {createMissing.map((f) => FIELD_LABELS[f] || f).join(', ')}
              </span>
            ) : null}
          </div>
        </form>
      </Card>

      <div className="flex flex-wrap items-center gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            className={cn(
              'rounded-full border px-3 py-1 text-xs font-semibold transition',
              statusFilter === f.value
                ? 'border-teal-600 bg-teal-50 text-teal-900'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50',
            )}
            onClick={() => setStatusFilter(f.value)}
          >
            {f.label}
          </button>
        ))}
      </div>

      {items.length === 0 ? (
        <Card className="border-slate-200 p-10 text-center">
          <p className="text-base font-semibold text-slate-800">No trade-ins in this view</p>
          <p className="mt-2 text-sm text-slate-500">
            Create a quote above, then move it Accept → Receive → Inventory.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">
            <span className="font-semibold text-slate-800">{items.length}</span> trade-in
            {items.length === 1 ? '' : 's'}
          </p>
          {items.map((row) => {
            const formState = edits[row.id];
            const open = expandedId === row.id;
            const busy = busyId === row.id;
            const requiredLeft = missingFromEdit(row, formState);
            const highlight = (field: string) => requiredLeft.includes(field);
            const canConvert =
              ['ACCEPTED', 'RECEIVED'].includes(row.status) && requiredLeft.length === 0;
            return (
              <Card key={row.id} className="overflow-hidden border-slate-200 p-0">
                <button
                  type="button"
                  className="flex w-full items-start gap-3 px-4 py-4 text-left transition hover:bg-slate-50/80 sm:px-5"
                  onClick={() => setExpandedId(open ? null : row.id)}
                >
                  <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-800">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.75}
                        d="M8 7h8m-8 4h5m-9 8h14a2 2 0 002-2V7a2 2 0 00-2-2H6a2 2 0 00-2 2v10a2 2 0 002 2z"
                      />
                    </svg>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-semibold text-slate-900">{row.deviceModel}</span>
                    <span className="mt-0.5 block text-sm text-slate-500">
                      {row.status} · {formatINR(toNumber(row.quotedValue))}
                      {row.finalValue != null ? ` → final ${formatINR(toNumber(row.finalValue))}` : ''}
                      {row.imei ? ` · ${row.imei}` : ''}
                      {row.customer ? ` · ${row.customer.name}` : ''}
                      {' · '}
                      {new Date(row.updatedAt).toLocaleString('en-IN')}
                    </span>
                    <span className="mt-2 flex flex-wrap gap-1.5">
                      {(row.missingFields.length ? row.missingFields : []).map((field) => (
                        <span
                          key={field}
                          className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800"
                        >
                          {FIELD_LABELS[field] || field}
                        </span>
                      ))}
                      {!row.missingFields.length && !['REFURBISHED', 'REJECTED', 'SOLD'].includes(row.status) ? (
                        <span className="inline-flex rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-teal-800">
                          Ready
                        </span>
                      ) : null}
                      {row.status === 'REFURBISHED' ? (
                        <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                          In inventory
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <span className="mt-1 shrink-0 text-slate-400" aria-hidden>
                    {open ? '▾' : '▸'}
                  </span>
                </button>

                {open ? (
                  <div className="border-t border-slate-100 bg-slate-50/40 px-4 py-4 sm:px-5">
                    {['QUOTED', 'ACCEPTED', 'RECEIVED'].includes(row.status) ? (
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <label
                          className={cn(
                            'space-y-1.5 text-xs font-semibold uppercase tracking-wide',
                            highlight('deviceModel') ? 'text-amber-800' : 'text-slate-500',
                          )}
                        >
                          Device model *
                          <input
                            className={cn(
                              inputClassName,
                              highlight('deviceModel') ? 'border-amber-300 ring-1 ring-amber-100' : '',
                            )}
                            value={formState?.deviceModel || ''}
                            onChange={(e) => patchEdit(row.id, { deviceModel: e.target.value })}
                          />
                        </label>
                        <label
                          className={cn(
                            'space-y-1.5 text-xs font-semibold uppercase tracking-wide',
                            highlight('imei') ? 'text-amber-800' : 'text-slate-500',
                          )}
                        >
                          IMEI / serial {['ACCEPTED', 'RECEIVED'].includes(row.status) ? '*' : ''}
                          <input
                            className={cn(
                              inputClassName,
                              highlight('imei') ? 'border-amber-300 ring-1 ring-amber-100' : '',
                            )}
                            value={formState?.imei || ''}
                            onChange={(e) => patchEdit(row.id, { imei: e.target.value })}
                          />
                        </label>
                        <label
                          className={cn(
                            'space-y-1.5 text-xs font-semibold uppercase tracking-wide',
                            highlight('quotedValue') ? 'text-amber-800' : 'text-slate-500',
                          )}
                        >
                          Quote ₹ *
                          <input
                            className={cn(
                              inputClassName,
                              highlight('quotedValue') ? 'border-amber-300 ring-1 ring-amber-100' : '',
                            )}
                            type="number"
                            min="0.01"
                            step="0.01"
                            value={formState?.quotedValue || ''}
                            onChange={(e) => patchEdit(row.id, { quotedValue: e.target.value })}
                          />
                        </label>
                        <label className="space-y-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Final ₹
                          <input
                            className={inputClassName}
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="Defaults to quote"
                            value={formState?.finalValue || ''}
                            onChange={(e) => patchEdit(row.id, { finalValue: e.target.value })}
                          />
                        </label>
                        <label className="space-y-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Sale price (on convert)
                          <input
                            className={inputClassName}
                            type="number"
                            min="0"
                            step="0.01"
                            placeholder="Default quote × 1.2"
                            value={formState?.salePrice || ''}
                            onChange={(e) => patchEdit(row.id, { salePrice: e.target.value })}
                          />
                        </label>
                        <label className="space-y-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Condition
                          <select
                            className={selectClassName}
                            value={formState?.condition || 'REFURB'}
                            onChange={(e) => patchEdit(row.id, { condition: e.target.value })}
                          >
                            {['NEW', 'REFURB', 'OPEN_BOX'].map((c) => (
                              <option key={c} value={c}>
                                {c}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label className="space-y-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:col-span-2 lg:col-span-3">
                          Notes
                          <textarea
                            className={`${textareaClassName} min-h-[64px]`}
                            value={formState?.notes || ''}
                            onChange={(e) => patchEdit(row.id, { notes: e.target.value })}
                          />
                        </label>
                      </div>
                    ) : (
                      <p className="text-sm text-slate-600">
                        {row.status === 'REFURBISHED' && row.refurbProductId
                          ? 'Converted to catalog stock with serial tracking.'
                          : `Status: ${row.status}`}
                      </p>
                    )}

                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      {['QUOTED', 'ACCEPTED', 'RECEIVED'].includes(row.status) ? (
                        <Button type="button" variant="secondary" disabled={busy} onClick={() => void saveDetails(row.id)}>
                          {busy ? 'Saving…' : 'Save details'}
                        </Button>
                      ) : null}
                      {row.status === 'QUOTED' ? (
                        <Button type="button" disabled={busy} onClick={() => void setStatus(row.id, 'ACCEPTED')}>
                          Accept
                        </Button>
                      ) : null}
                      {row.status === 'ACCEPTED' ? (
                        <Button type="button" disabled={busy} onClick={() => void setStatus(row.id, 'RECEIVED')}>
                          Mark received
                        </Button>
                      ) : null}
                      {['ACCEPTED', 'RECEIVED'].includes(row.status) ? (
                        <Button
                          type="button"
                          disabled={busy || !canConvert}
                          title={
                            !canConvert
                              ? `Still need: ${requiredLeft.map((f) => FIELD_LABELS[f] || f).join(', ')}`
                              : undefined
                          }
                          onClick={() => void convert(row.id)}
                        >
                          → Inventory
                        </Button>
                      ) : null}
                      {['QUOTED', 'ACCEPTED', 'RECEIVED'].includes(row.status) ? (
                        <Button
                          type="button"
                          variant="secondary"
                          disabled={busy}
                          onClick={() => void setStatus(row.id, 'REJECTED')}
                        >
                          Reject
                        </Button>
                      ) : null}
                      {row.refurbProductId ? (
                        <Link
                          href="/dashboard/products-needing-details"
                          className="text-sm font-medium text-teal-700 hover:underline"
                        >
                          Open needing details
                        </Link>
                      ) : null}
                      {requiredLeft.length && ['ACCEPTED', 'RECEIVED'].includes(row.status) ? (
                        <span className="text-xs text-amber-800">
                          Required: {requiredLeft.map((f) => FIELD_LABELS[f] || f).join(', ')}
                        </span>
                      ) : null}
                    </div>
                  </div>
                ) : null}
      </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
