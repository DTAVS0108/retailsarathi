'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Button, Card, formatINR } from '@retail-sarathi/ui';
import { apiWithAuth } from '@/lib/helpers';
import {
  pageShellClassName,
  MessageBanner,
  PageHeader,
  cn,
  inputClassName,
  parseError,
  textareaClassName,
  toNumber,
} from '../_components/dashboard-ui';
import { GstSlabSelect } from '../_components/gst-slab-select';
import { CategorySelect } from '../_components/category-select';

type EnrichmentRow = {
  id: string;
  status: string;
  missingFields: string[];
  draftName: string | null;
  notes: string | null;
  product: {
    id: string;
    sku: string;
    name: string;
    barcode: string | null;
    salePrice: number | string;
    purchasePrice: number | string;
    model: string | null;
    brand: string | null;
    category: string | null;
    hsnCode: string;
    gstRate: number | string;
    trackSerial: boolean;
    stockQty: number | string;
    needsEnrichment: boolean;
  };
};

type FormState = {
  barcode: string;
  salePrice: string;
  model: string;
  brand: string;
  category: string;
  hsnCode: string;
  gstRate: string;
  serialNumbers: string;
  addStockQty: string;
  trackSerial: boolean;
};

const FIELD_LABELS: Record<string, string> = {
  barcode: 'Barcode',
  salePrice: 'Sale price',
  model: 'Model',
  brand: 'Brand',
  category: 'Category',
  hsnCode: 'HSN',
  gstRate: 'GST',
};

function missingFromForm(row: EnrichmentRow, form: FormState | undefined): string[] {
  const prior = row.missingFields?.length ? row.missingFields : ['barcode', 'salePrice'];
  const out: string[] = [];
  if (prior.includes('barcode') && !(form?.barcode || '').trim()) out.push('barcode');
  if (prior.includes('salePrice') && !(toNumber(form?.salePrice) > 0)) out.push('salePrice');
  if (prior.includes('model') && !(form?.model || '').trim()) out.push('model');
  // Always require a positive sale price to leave the queue
  if (!(toNumber(form?.salePrice) > 0) && !out.includes('salePrice')) {
    if (!(toNumber(row.product.salePrice) > 0)) out.push('salePrice');
  }
  return out;
}

export default function ProductsNeedingDetailsPage() {
  const [rows, setRows] = useState<EnrichmentRow[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [forms, setForms] = useState<Record<string, FormState>>({});

  const load = useCallback(async () => {
    try {
      setError('');
      const data = await apiWithAuth<EnrichmentRow[]>('/scan/enrichments?status=PENDING');
      setRows(data);
      const next: Record<string, FormState> = {};
      for (const row of data) {
        next[row.id] = {
          barcode: row.product.barcode || '',
          salePrice:
            row.product.salePrice != null && toNumber(row.product.salePrice) > 0
              ? String(toNumber(row.product.salePrice))
              : '',
          model: row.product.model || '',
          brand: row.product.brand || '',
          category: row.product.category || '',
          hsnCode: row.product.hsnCode || '',
          gstRate: String(toNumber(row.product.gstRate) || 18),
          serialNumbers: '',
          addStockQty: '',
          trackSerial: row.product.trackSerial,
        };
      }
      setForms(next);
      setExpandedId((prev) => {
        if (data.length === 0) return null;
        if (prev && data.some((r) => r.id === prev)) return prev;
        return data[0].id;
      });
    } catch (err) {
      setError(parseError(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  function patchForm(id: string, patch: Partial<FormState>) {
    setForms((prev) => ({
      ...prev,
      [id]: { ...prev[id], ...patch },
    }));
  }

  async function complete(id: string, skip = false) {
    try {
      setError('');
      setSuccess('');
      const form = forms[id];
      const row = rows.find((r) => r.id === id);
      if (!skip && row) {
        const still = missingFromForm(row, form);
        if (still.length) {
          setError(
            `Fill required fields before saving: ${still.map((f) => FIELD_LABELS[f] || f).join(', ')}`,
          );
          setExpandedId(id);
          return;
        }
      }
      setSavingId(id);
      const serials = (form?.serialNumbers || '')
        .split(/[\n,]+/)
        .map((s) => s.trim())
        .filter(Boolean);
      const result = await apiWithAuth<{
        success: boolean;
        status: string;
        missingFields?: string[];
      }>(`/scan/enrichments/${id}/complete`, {
        method: 'POST',
        body: JSON.stringify(
          skip
            ? { skip: true }
            : {
                barcode: form?.barcode || undefined,
                salePrice: form?.salePrice ? toNumber(form.salePrice) : undefined,
                model: form?.model || undefined,
                brand: form?.brand || undefined,
                category: form?.category || undefined,
                hsnCode: form?.hsnCode || undefined,
                gstRate: form?.gstRate ? toNumber(form.gstRate) : undefined,
                trackSerial: form?.trackSerial,
                serialNumbers: serials.length ? serials : undefined,
                addStockQty: form?.addStockQty ? toNumber(form.addStockQty) : undefined,
              },
        ),
      });
      if (skip) {
        setSuccess('Dismissed from queue. Product stays flagged until details are filled.');
      } else if (result.status === 'DONE') {
        setSuccess('Product details saved — removed from queue.');
      } else {
        const left = (result.missingFields || []).map((f) => FIELD_LABELS[f] || f).join(', ');
        setSuccess(`Saved, but still missing: ${left || 'details'}.`);
      }
      await load();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className={pageShellClassName}>
      <PageHeader
        title="Products needing details"
        description="Incomplete SKUs from stock-in — usually barcode, sale price, or model. Fill required chips, then Save. Skip only dismisses the card."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/stock-in">
              <Button type="button" variant="secondary">
                Stock-in
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

      {rows.length === 0 ? (
        <Card className="border-slate-200 p-10 text-center">
          <p className="text-base font-semibold text-slate-800">Queue is empty</p>
          <p className="mt-2 text-sm text-slate-500">
            After stock-in, new or incomplete items (missing barcode, sale price, or model) appear here.
          </p>
        </Card>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">
            <span className="font-semibold text-slate-800">{rows.length}</span> item
            {rows.length === 1 ? '' : 's'} waiting for catalog details
          </p>
          {rows.map((row) => {
            const form = forms[row.id];
            const open = expandedId === row.id;
            const busy = savingId === row.id;
            const requiredLeft = missingFromForm(row, form);
            const highlight = (field: string) =>
              (row.missingFields.includes(field) || requiredLeft.includes(field)) &&
              requiredLeft.includes(field);
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
                        d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                      />
                    </svg>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-semibold text-slate-900">{row.product.name}</span>
                    <span className="mt-0.5 block text-sm text-slate-500">
                      {row.product.sku} · HSN {row.product.hsnCode || '—'} · stock{' '}
                      {String(row.product.stockQty)} · purchase{' '}
                      {formatINR(Number(row.product.purchasePrice))}
                      {row.notes ? ` · ${row.notes}` : ''}
                    </span>
                    <span className="mt-2 flex flex-wrap gap-1.5">
                      {(row.missingFields.length ? row.missingFields : ['details']).map((field) => (
                        <span
                          key={field}
                          className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800"
                        >
                          {FIELD_LABELS[field] || field}
                        </span>
                      ))}
                    </span>
                  </span>
                  <span className="mt-1 shrink-0 text-slate-400" aria-hidden>
                    {open ? '▾' : '▸'}
                  </span>
                </button>

                {open ? (
                  <div className="border-t border-slate-100 bg-slate-50/40 px-4 py-4 sm:px-5">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      <label
                        className={cn(
                          'space-y-1.5 text-xs font-semibold uppercase tracking-wide sm:col-span-2 lg:col-span-1',
                          highlight('barcode') ? 'text-amber-800' : 'text-slate-500',
                        )}
                      >
                        Barcode {row.missingFields.includes('barcode') ? '*' : ''}
                        <input
                          className={cn(
                            inputClassName,
                            highlight('barcode') ? 'border-amber-300 ring-1 ring-amber-100' : '',
                          )}
                          placeholder="Scan or type"
                          value={form?.barcode || ''}
                          onChange={(e) => patchForm(row.id, { barcode: e.target.value })}
                        />
                      </label>
                      <label
                        className={cn(
                          'space-y-1.5 text-xs font-semibold uppercase tracking-wide',
                          highlight('salePrice') ? 'text-amber-800' : 'text-slate-500',
                        )}
                      >
                        Sale price {row.missingFields.includes('salePrice') ? '*' : ''}
                        <input
                          className={cn(
                            inputClassName,
                            highlight('salePrice') ? 'border-amber-300 ring-1 ring-amber-100' : '',
                          )}
                          type="number"
                          min="0"
                          step="0.01"
                          placeholder="₹"
                          value={form?.salePrice || ''}
                          onChange={(e) => patchForm(row.id, { salePrice: e.target.value })}
                        />
                      </label>
                      <label className="space-y-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Add stock (optional)
                        <input
                          className={inputClassName}
                          type="number"
                          min="0"
                          step="0.001"
                          value={form?.addStockQty || ''}
                          onChange={(e) => patchForm(row.id, { addStockQty: e.target.value })}
                        />
                      </label>
                      <label className="space-y-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Brand
                        <input
                          className={inputClassName}
                          value={form?.brand || ''}
                          onChange={(e) => patchForm(row.id, { brand: e.target.value })}
                        />
                      </label>
                      <label className="space-y-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Category
                        <CategorySelect
                          value={form?.category || ''}
                          onChange={(category) => patchForm(row.id, { category })}
                          autoLoad
                          allowEmpty
                          emptyLabel="Select category"
                        />
                      </label>
                      <label className="space-y-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        HSN
                        <input
                          className={inputClassName}
                          value={form?.hsnCode || ''}
                          onChange={(e) => patchForm(row.id, { hsnCode: e.target.value })}
                          placeholder="e.g. 8507"
                        />
                      </label>
                      <label className="space-y-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        GST slab
                        <GstSlabSelect
                          value={form?.gstRate || '18'}
                          onChange={(value) => patchForm(row.id, { gstRate: value })}
                        />
                      </label>
                      <label
                        className={cn(
                          'space-y-1.5 text-xs font-semibold uppercase tracking-wide',
                          highlight('model') ? 'text-amber-800' : 'text-slate-500',
                        )}
                      >
                        Model {row.missingFields.includes('model') ? '*' : ''}
                        <input
                          className={cn(
                            inputClassName,
                            highlight('model') ? 'border-amber-300 ring-1 ring-amber-100' : '',
                          )}
                          value={form?.model || ''}
                          onChange={(e) => patchForm(row.id, { model: e.target.value })}
                        />
                      </label>
                      <label className="flex items-end gap-2 pb-2.5 text-sm font-medium text-slate-700">
                        <input
                          type="checkbox"
                          className="h-4 w-4 rounded border-slate-300 text-teal-700 focus:ring-teal-500"
                          checked={Boolean(form?.trackSerial)}
                          onChange={(e) => patchForm(row.id, { trackSerial: e.target.checked })}
                        />
                        Track serial / IMEI
                      </label>
                      {form?.trackSerial ? (
                        <label className="space-y-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:col-span-2 lg:col-span-3">
                          Serial numbers
                          <textarea
                            className={`${textareaClassName} min-h-[72px] font-mono text-xs`}
                            placeholder="One per line or comma-separated"
                            value={form?.serialNumbers || ''}
                            onChange={(e) => patchForm(row.id, { serialNumbers: e.target.value })}
                          />
                        </label>
                      ) : null}
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        disabled={busy || requiredLeft.length > 0}
                        title={
                          requiredLeft.length
                            ? `Still need: ${requiredLeft.map((f) => FIELD_LABELS[f] || f).join(', ')}`
                            : undefined
                        }
                        onClick={() => void complete(row.id)}
                      >
                        {busy ? 'Saving…' : 'Save details'}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => void complete(row.id, true)}
                      >
                        Skip for now
                      </Button>
                      <Link
                        href="/dashboard/products"
                        className="text-sm font-medium text-teal-700 hover:underline"
                      >
                        Open catalog
                      </Link>
                      {requiredLeft.length ? (
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
