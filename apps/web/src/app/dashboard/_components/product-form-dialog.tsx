'use client';

import { FormEvent, useEffect, useRef, useState } from 'react';
import Script from 'next/script';
import { Button } from '@retail-sarathi/ui';
import { apiWithAuth } from '@/lib/helpers';
import { documentKind, resolveUploadUrl } from '@/lib/upload-url';
import { runInvoiceOcr } from '@/lib/invoice-ocr';
import { DocumentViewer, DocumentViewerLink } from '@/app/_components/document-viewer';
import { GstSlabSelect } from './gst-slab-select';
import { CategorySelect } from './category-select';
import {
  cn,
  inputClassName,
  parseError,
  selectClassName,
  toNumber,
} from './dashboard-ui';

export type ProductAttachment = {
  url: string;
  name: string;
  mimeType?: string;
  size?: number;
};

export type ProductFormValues = {
  sku: string;
  name: string;
  barcode: string;
  hsnCode: string;
  category: string;
  brand: string;
  model: string;
  unit: string;
  salePrice: string;
  purchasePrice: string;
  gstRate: string;
  stockQty: string;
  lowStockThreshold: string;
  trackSerial: boolean;
  trackBatch: boolean;
  variantLabel: string;
  parentProductId: string;
  imageUrl: string;
  attachments: ProductAttachment[];
};

export const EMPTY_PRODUCT_FORM: ProductFormValues = {
  sku: '',
  name: '',
  barcode: '',
  hsnCode: '',
  category: '',
  brand: '',
  model: '',
  unit: 'pcs',
  salePrice: '',
  purchasePrice: '0',
  gstRate: '18',
  stockQty: '0',
  lowStockThreshold: '5',
  trackSerial: false,
  trackBatch: false,
  variantLabel: '',
  parentProductId: '',
  imageUrl: '',
  attachments: [],
};

export type ProductFormInitial = {
  id?: string;
  sku?: string;
  name?: string;
  barcode?: string | null;
  hsnCode?: string;
  category?: string | null;
  brand?: string | null;
  model?: string | null;
  unit?: string | null;
  salePrice?: number | string;
  purchasePrice?: number | string | null;
  gstRate?: number | string;
  stockQty?: number | string;
  lowStockThreshold?: number | string;
  trackSerial?: boolean;
  trackBatch?: boolean;
  variantLabel?: string | null;
  parentProductId?: string | null;
  imageUrl?: string | null;
  attachments?: ProductAttachment[] | null;
};

export type SavedProductSummary = {
  id: string;
  sku: string;
  name: string;
  barcode: string | null;
  trackSerial: boolean;
  salePrice: number;
};

function normalizeAttachments(raw: unknown): ProductAttachment[] {
  if (!Array.isArray(raw)) return [];
  const out: ProductAttachment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const a = item as Record<string, unknown>;
    const url = typeof a.url === 'string' ? a.url.trim() : '';
    if (!url) continue;
    out.push({
      url,
      name:
        typeof a.name === 'string' && a.name.trim()
          ? a.name.trim()
          : url.split('/').pop() || 'File',
      mimeType: typeof a.mimeType === 'string' ? a.mimeType : undefined,
      size: typeof a.size === 'number' ? a.size : undefined,
    });
  }
  return out;
}

function toFormValues(p?: ProductFormInitial | null): ProductFormValues {
  if (!p) return { ...EMPTY_PRODUCT_FORM };
  return {
    sku: p.sku ?? '',
    name: p.name ?? '',
    barcode: p.barcode ?? '',
    hsnCode: p.hsnCode ?? '',
    category: p.category ?? '',
    brand: p.brand ?? '',
    model: p.model ?? '',
    unit: p.unit || 'pcs',
    salePrice: String(toNumber(p.salePrice)),
    purchasePrice: String(toNumber(p.purchasePrice)),
    gstRate: String(toNumber(p.gstRate) || 18),
    stockQty: String(toNumber(p.stockQty)),
    lowStockThreshold: String(toNumber(p.lowStockThreshold) || 5),
    trackSerial: Boolean(p.trackSerial),
    trackBatch: Boolean(p.trackBatch),
    variantLabel: p.variantLabel ?? '',
    parentProductId: p.parentProductId ?? '',
    imageUrl: p.imageUrl ?? '',
    attachments: normalizeAttachments(p.attachments),
  };
}

export function ProductFormDialog({
  open,
  mode,
  initial,
  categories = [],
  brands = [],
  receiveMode = false,
  onClose,
  onSaved,
  onCategoryAdded,
}: {
  open: boolean;
  mode: 'create' | 'edit';
  initial?: ProductFormInitial | null;
  categories?: string[];
  brands?: string[];
  /** When true (stock-in), opening stock stays 0 — qty is added on confirm. */
  receiveMode?: boolean;
  onClose: () => void;
  onSaved: (product?: SavedProductSummary) => void | Promise<void>;
  onCategoryAdded?: (name: string) => void;
}) {
  const [form, setForm] = useState<ProductFormValues>(EMPTY_PRODUCT_FORM);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState('');
  const [parseNote, setParseNote] = useState('');
  const [labelText, setLabelText] = useState('');
  const [showParser, setShowParser] = useState(true);
  const [loadingMedia, setLoadingMedia] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const ocrInputRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const parentWrapRef = useRef<HTMLDivElement>(null);

  const [parentQuery, setParentQuery] = useState('');
  const [parentResults, setParentResults] = useState<Array<{ id: string; name: string; sku: string }>>([]);
  const [parentSearching, setParentSearching] = useState(false);
  const [parentOpen, setParentOpen] = useState(false);
  const [parentSelectedLabel, setParentSelectedLabel] = useState('');

  useEffect(() => {
    if (!open) return;
    setForm(toFormValues(initial ?? null));
    setError('');
    setParseNote('');
    setLabelText('');
    setShowParser(mode === 'create');
    const t = window.setTimeout(() => nameRef.current?.focus(), 60);

    let cancelled = false;
    if (mode === 'edit' && initial?.id) {
      setLoadingMedia(true);
      void apiWithAuth<{
        imageUrl?: string | null;
        attachments?: unknown;
        sku?: string;
        name?: string;
        barcode?: string | null;
        hsnCode?: string;
        category?: string | null;
        brand?: string | null;
        model?: string | null;
        unit?: string | null;
        salePrice?: number | string;
        purchasePrice?: number | string | null;
        gstRate?: number | string;
        stockQty?: number | string;
        lowStockThreshold?: number | string;
        trackSerial?: boolean;
        trackBatch?: boolean;
        variantLabel?: string | null;
        parentProductId?: string | null;
      }>(`/products/${initial.id}`)
        .then((fresh) => {
          if (cancelled) return;
          setForm(
            toFormValues({
              ...initial,
              ...fresh,
              id: initial.id,
              imageUrl: fresh.imageUrl ?? initial.imageUrl,
              attachments: normalizeAttachments(fresh.attachments ?? initial.attachments),
            }),
          );
        })
        .catch(() => {
          /* keep list-row values if detail fetch fails */
        })
        .finally(() => {
          if (!cancelled) setLoadingMedia(false);
        });
    } else {
      setLoadingMedia(false);
    }

    return () => {
      cancelled = true;
      window.clearTimeout(t);
    };
  }, [open, mode, initial]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !saving) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, saving, onClose]);

  // Parent-product picker: resolve the current parentProductId's display name once (edit mode, or
  // right after the detail fetch above sets it), and reset the search box whenever the dialog
  // (re)opens for a different product.
  useEffect(() => {
    if (!open) {
      setParentQuery('');
      setParentResults([]);
      setParentOpen(false);
      setParentSelectedLabel('');
      return;
    }
    const pid = initial?.parentProductId;
    if (!pid) {
      setParentSelectedLabel('');
      return;
    }
    let cancelled = false;
    void apiWithAuth<{ name: string; sku: string }>(`/products/${pid}`)
      .then((p) => {
        if (!cancelled) setParentSelectedLabel(`${p.name} (${p.sku})`);
      })
      .catch(() => {
        /* leave label blank if the parent lookup fails — id is still saved */
      });
    return () => {
      cancelled = true;
    };
  }, [open, initial?.parentProductId]);

  useEffect(() => {
    const q = parentQuery.trim();
    if (q.length < 2) {
      setParentResults([]);
      return;
    }
    const t = window.setTimeout(() => {
      void (async () => {
        setParentSearching(true);
        try {
          const res = await apiWithAuth<{ items: Array<{ id: string; name: string; sku: string }> }>(
            `/products?search=${encodeURIComponent(q)}&pageSize=8`,
          );
          setParentResults((res.items ?? []).filter((p) => p.id !== initial?.id));
        } catch {
          setParentResults([]);
        } finally {
          setParentSearching(false);
        }
      })();
    }, 300);
    return () => window.clearTimeout(t);
  }, [parentQuery, initial?.id]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (parentWrapRef.current && !parentWrapRef.current.contains(e.target as Node)) setParentOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  if (!open) return null;

  function patch(partial: Partial<ProductFormValues>) {
    setForm((current) => ({ ...current, ...partial }));
  }

  async function uploadFile(file: File, asImage: boolean) {
    setUploading(true);
    setError('');
    try {
      const body = new FormData();
      body.append('file', file);
      if (asImage) body.append('asImage', 'true');
      if (mode === 'edit' && initial?.id) body.append('productId', initial.id);
      const res = await apiWithAuth<
        ProductAttachment & {
          asImage?: boolean;
          product?: { imageUrl?: string | null; attachments?: unknown };
        }
      >('/products/attachments', { method: 'POST', body });

      if (res.product) {
        patch({
          imageUrl: res.product.imageUrl ?? (asImage ? res.url : form.imageUrl),
          attachments: normalizeAttachments(res.product.attachments),
        });
      } else if (asImage) {
        patch({ imageUrl: res.url });
      } else {
        const next: ProductAttachment = {
          url: res.url,
          name: res.name || file.name,
          mimeType: res.mimeType || file.type,
          size: res.size || file.size,
        };
        patch({
          attachments: [...form.attachments.filter((a) => a.url !== res.url), next],
          ...(!form.imageUrl ? { imageUrl: res.url } : {}),
        });
      }
    } catch (err) {
      setError(parseError(err));
    } finally {
      setUploading(false);
    }
  }

  async function applyParsedText(text: string) {
    const cleaned = text.trim();
    if (!cleaned) {
      setError('Paste label text or OCR a photo first.');
      return;
    }
    setParsing(true);
    setError('');
    setParseNote('');
    try {
      const res = await apiWithAuth<{
        mapped: Record<string, string | number | boolean | undefined>;
        fieldsFilled: number;
      }>('/products/parse-label', {
        method: 'POST',
        body: JSON.stringify({ text: cleaned }),
      });
      const m = res.mapped ?? {};
      setForm((current) => ({
        ...current,
        ...(m.sku != null && !current.sku ? { sku: String(m.sku) } : m.sku != null ? { sku: String(m.sku) } : {}),
        ...(m.name != null ? { name: String(m.name) } : {}),
        ...(m.barcode != null ? { barcode: String(m.barcode) } : {}),
        ...(m.hsnCode != null ? { hsnCode: String(m.hsnCode) } : {}),
        ...(m.category != null ? { category: String(m.category) } : {}),
        ...(m.brand != null ? { brand: String(m.brand) } : {}),
        ...(m.model != null ? { model: String(m.model) } : {}),
        ...(m.unit != null ? { unit: String(m.unit) } : {}),
        ...(m.salePrice != null ? { salePrice: String(m.salePrice) } : {}),
        ...(m.purchasePrice != null ? { purchasePrice: String(m.purchasePrice) } : {}),
        ...(m.gstRate != null ? { gstRate: String(m.gstRate) } : {}),
        ...(m.trackSerial != null ? { trackSerial: Boolean(m.trackSerial) } : {}),
      }));
      setParseNote(
        res.fieldsFilled
          ? `Mapped ${res.fieldsFilled} field${res.fieldsFilled === 1 ? '' : 's'} from label. Review before saving.`
          : 'No fields detected — try clearer text or a sharper photo.',
      );
    } catch (err) {
      setError(parseError(err));
    } finally {
      setParsing(false);
    }
  }

  async function handleOcrFile(file: File) {
    setParsing(true);
    setError('');
    try {
      const text = await runInvoiceOcr(file);
      setLabelText(text);
      await applyParsedText(text);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'OCR failed');
      setParsing(false);
    }
  }

  function validate(): string | null {
    if (!form.sku.trim()) return 'SKU is required.';
    if (!form.name.trim()) return 'Product name is required.';
    if (!form.hsnCode.trim()) return 'HSN code is required.';
    if (toNumber(form.salePrice) < 0) return 'Sale price cannot be negative.';
    if (toNumber(form.gstRate) < 0) return 'GST rate cannot be negative.';
    if (mode === 'create' && toNumber(form.stockQty) < 0) return 'Opening stock cannot be negative.';
    return null;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const problem = validate();
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError('');
    try {
      const payload = {
        name: form.name.trim(),
        barcode: form.barcode.trim() || undefined,
        hsnCode: form.hsnCode.trim(),
        category: form.category.trim() || undefined,
        brand: form.brand.trim() || undefined,
        model: form.model.trim() || undefined,
        unit: form.unit.trim() || 'pcs',
        salePrice: toNumber(form.salePrice),
        purchasePrice: toNumber(form.purchasePrice),
        gstRate: toNumber(form.gstRate),
        lowStockThreshold: toNumber(form.lowStockThreshold) || 5,
        trackSerial: form.trackSerial,
        trackBatch: form.trackBatch,
        variantLabel: form.variantLabel.trim() || undefined,
        parentProductId: form.parentProductId.trim() || undefined,
        imageUrl: form.imageUrl.trim() || undefined,
        attachments: form.attachments,
      };
      let saved: SavedProductSummary | undefined;
      if (mode === 'create') {
        const created = await apiWithAuth<{
          id: string;
          sku: string;
          name: string;
          barcode: string | null;
          trackSerial: boolean;
          salePrice: number | string;
        }>('/products', {
          method: 'POST',
          body: JSON.stringify({
            ...payload,
            sku: form.sku.trim(),
            stockQty: receiveMode ? 0 : toNumber(form.stockQty),
          }),
        });
        saved = {
          id: created.id,
          sku: created.sku,
          name: created.name,
          barcode: created.barcode,
          trackSerial: Boolean(created.trackSerial),
          salePrice: toNumber(created.salePrice),
        };
      } else if (initial?.id) {
        const updated = await apiWithAuth<{
          id: string;
          sku: string;
          name: string;
          barcode: string | null;
          trackSerial: boolean;
          salePrice: number | string;
        }>(`/products/${initial.id}`, {
          method: 'PATCH',
          body: JSON.stringify({
            ...payload,
            barcode: form.barcode.trim() || null,
            category: form.category.trim() || null,
            brand: form.brand.trim() || null,
            model: form.model.trim() || null,
            trackBatch: form.trackBatch,
            variantLabel: form.variantLabel.trim() || null,
            parentProductId: form.parentProductId.trim() || null,
            imageUrl: form.imageUrl.trim() || null,
          }),
        });
        saved = {
          id: updated.id,
          sku: updated.sku,
          name: updated.name,
          barcode: updated.barcode,
          trackSerial: Boolean(updated.trackSerial),
          salePrice: toNumber(updated.salePrice),
        };
      }
      await onSaved(saved);
      onClose();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setSaving(false);
    }
  }

  const imagePreview = resolveUploadUrl(form.imageUrl);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/45 p-0 sm:items-center sm:p-4">
      <Script src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js" strategy="afterInteractive" />
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="product-form-title"
        className="relative z-10 flex max-h-[min(92vh,900px)] w-[80vw] max-w-[80vw] flex-col overflow-hidden rounded-t-2xl border border-slate-200 bg-white shadow-xl sm:rounded-2xl"
      >
        <div className="flex items-start gap-3 border-b border-slate-100 px-5 py-4 sm:px-6">
          <Button type="button" size="sm" variant="secondary" onClick={onClose} disabled={saving}>
            ← Back
          </Button>
          <div className="min-w-0 flex-1">
            <h2 id="product-form-title" className="text-lg font-semibold text-slate-900">
              {mode === 'create' ? 'Add product' : 'Edit product'}
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              All catalog fields, photo, attachments, and label auto-fill.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-4 sm:px-6">
            {error ? (
              <p className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{error}</p>
            ) : null}
            {parseNote ? (
              <p className="rounded-xl border border-teal-200 bg-teal-50 px-3 py-2 text-sm text-teal-900">{parseNote}</p>
            ) : null}

            <section className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">Auto-fill from label</h3>
                  <p className="text-xs text-slate-500">
                    Paste datasheet text or OCR a pack photo — fields map automatically.
                  </p>
                </div>
                <Button type="button" size="sm" variant="secondary" onClick={() => setShowParser((v) => !v)}>
                  {showParser ? 'Hide' : 'Show'}
                </Button>
              </div>
              {showParser ? (
                <div className="space-y-3">
                  <textarea
                    className={cn(inputClassName, 'min-h-[88px] font-mono text-xs')}
                    placeholder={'Name: Exide Invatubular 150Ah\nBrand: Exide\nHSN: 85071000\nGST: 18%\nMRP: 18500'}
                    value={labelText}
                    onChange={(e) => setLabelText(e.target.value)}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={parsing}
                      onClick={() => void applyParsedText(labelText)}
                    >
                      {parsing ? 'Parsing…' : 'Parse & map fields'}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      disabled={parsing}
                      onClick={() => ocrInputRef.current?.click()}
                    >
                      OCR label photo
                    </Button>
                    <input
                      ref={ocrInputRef}
                      type="file"
                      accept="image/*,.pdf"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handleOcrFile(file);
                        e.target.value = '';
                      }}
                    />
                  </div>
                </div>
              ) : null}
            </section>

            <section className="grid gap-4 sm:grid-cols-[160px_1fr]">
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Photo</p>
                {imagePreview ? (
                  <DocumentViewer
                    path={form.imageUrl}
                    fileName="Product photo"
                    mimeType="image/*"
                    height={148}
                    className="w-full"
                  />
                ) : (
                  <div className="flex aspect-square items-center justify-center overflow-hidden rounded-xl border border-dashed border-slate-300 bg-white">
                    <span className="px-2 text-center text-xs text-slate-400">
                      {loadingMedia ? 'Loading…' : 'No image'}
                    </span>
                  </div>
                )}
                <div className="flex flex-col gap-1.5">
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    className="w-full"
                    disabled={uploading}
                    onClick={() => imageInputRef.current?.click()}
                  >
                    {uploading ? 'Uploading…' : imagePreview ? 'Replace photo' : 'Upload photo'}
                  </Button>
                  {imagePreview ? (
                    <button
                      type="button"
                      className="text-xs font-semibold text-rose-700 hover:underline"
                      onClick={() => patch({ imageUrl: '' })}
                    >
                      Remove photo
                    </button>
                  ) : null}
                </div>
                <input
                  ref={imageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadFile(file, true);
                    e.target.value = '';
                  }}
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="space-y-1 text-sm font-medium text-slate-700 sm:col-span-2">
                  <span>Product name *</span>
                  <input
                    ref={nameRef}
                    className={inputClassName}
                    value={form.name}
                    onChange={(e) => patch({ name: e.target.value })}
                  />
                </label>
                <label className="space-y-1 text-sm font-medium text-slate-700">
                  <span>SKU *</span>
                  <input
                    className={inputClassName}
                    value={form.sku}
                    disabled={mode === 'edit'}
                    onChange={(e) => patch({ sku: e.target.value })}
                  />
                </label>
                <label className="space-y-1 text-sm font-medium text-slate-700">
                  <span>Barcode</span>
                  <input
                    className={inputClassName}
                    value={form.barcode}
                    onChange={(e) => patch({ barcode: e.target.value })}
                  />
                </label>
                <label className="space-y-1 text-sm font-medium text-slate-700">
                  <span>HSN *</span>
                  <input
                    className={inputClassName}
                    value={form.hsnCode}
                    onChange={(e) => patch({ hsnCode: e.target.value })}
                  />
                </label>
                <label className="space-y-1 text-sm font-medium text-slate-700">
                  <span>Unit</span>
                  <input
                    className={inputClassName}
                    list="product-unit-suggestions"
                    value={form.unit}
                    onChange={(e) => patch({ unit: e.target.value })}
                  />
                </label>
                <label className="space-y-1 text-sm font-medium text-slate-700">
                  <span>Category</span>
                  <CategorySelect
                    value={form.category}
                    onChange={(v) => patch({ category: v })}
                    categories={categories}
                    onCategoryAdded={onCategoryAdded}
                    allowEmpty
                    emptyLabel="Select category"
                    autoLoad
                  />
                </label>
                <label className="space-y-1 text-sm font-medium text-slate-700">
                  <span>Brand</span>
                  <input
                    className={inputClassName}
                    list="product-form-brands"
                    value={form.brand}
                    onChange={(e) => patch({ brand: e.target.value })}
                  />
                </label>
                <label className="space-y-1 text-sm font-medium text-slate-700 sm:col-span-2">
                  <span>Model</span>
                  <input
                    className={inputClassName}
                    value={form.model}
                    onChange={(e) => patch({ model: e.target.value })}
                  />
                </label>
              </div>
            </section>

            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="space-y-1 text-sm font-medium text-slate-700">
                <span>Sale price *</span>
                <input
                  className={inputClassName}
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.salePrice}
                  onChange={(e) => patch({ salePrice: e.target.value })}
                />
              </label>
              <label className="space-y-1 text-sm font-medium text-slate-700">
                <span>Purchase price</span>
                <input
                  className={inputClassName}
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.purchasePrice}
                  onChange={(e) => patch({ purchasePrice: e.target.value })}
                />
              </label>
              <label className="space-y-1 text-sm font-medium text-slate-700">
                <span>GST slab *</span>
                <GstSlabSelect value={form.gstRate} onChange={(v) => patch({ gstRate: v })} />
              </label>
              <label className="space-y-1 text-sm font-medium text-slate-700">
                <span>Low stock alert</span>
                <input
                  className={inputClassName}
                  type="number"
                  min="0"
                  step="1"
                  value={form.lowStockThreshold}
                  onChange={(e) => patch({ lowStockThreshold: e.target.value })}
                />
              </label>
              {mode === 'create' && !receiveMode ? (
                <label className="space-y-1 text-sm font-medium text-slate-700">
                  <span>Opening stock</span>
                  <input
                    className={inputClassName}
                    type="number"
                    min="0"
                    step="0.001"
                    value={form.stockQty}
                    onChange={(e) => patch({ stockQty: e.target.value })}
                  />
                </label>
              ) : null}
              {mode === 'create' && receiveMode ? (
                <p className="sm:col-span-2 text-xs text-slate-500">
                  Opening stock stays 0 here — quantity is added when you confirm stock-in.
                </p>
              ) : null}
              <label className="flex items-center gap-2 pt-6 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300"
                  checked={form.trackSerial}
                  onChange={(e) => patch({ trackSerial: e.target.checked })}
                />
                Track IMEI / serial
              </label>
              <label className="flex items-center gap-2 pt-6 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300"
                  checked={form.trackBatch}
                  onChange={(e) => patch({ trackBatch: e.target.checked })}
                />
                Track batch / expiry
              </label>
              <label className="space-y-1 text-sm font-medium text-slate-700 sm:col-span-2">
                <span>Variant label (optional)</span>
                <input
                  className={inputClassName}
                  placeholder="e.g. 128GB Black"
                  value={form.variantLabel}
                  onChange={(e) => patch({ variantLabel: e.target.value })}
                />
              </label>
              <div ref={parentWrapRef} className="relative space-y-1 text-sm font-medium text-slate-700 sm:col-span-2">
                <span>Parent product (optional, for variants)</span>
                <div className="flex items-center gap-2">
                  <input
                    className={inputClassName}
                    placeholder="Search product name or SKU…"
                    value={parentQuery}
                    onChange={(e) => {
                      setParentQuery(e.target.value);
                      setParentOpen(true);
                      if (form.parentProductId) {
                        patch({ parentProductId: '' });
                        setParentSelectedLabel('');
                      }
                    }}
                    onFocus={() => setParentOpen(true)}
                  />
                  {form.parentProductId ? (
                    <button
                      type="button"
                      className="shrink-0 text-xs font-semibold text-slate-500 hover:text-slate-700"
                      onClick={() => {
                        patch({ parentProductId: '' });
                        setParentSelectedLabel('');
                        setParentQuery('');
                      }}
                    >
                      Clear
                    </button>
                  ) : null}
                </div>
                {form.parentProductId && parentSelectedLabel ? (
                  <p className="text-xs font-normal text-emerald-700">Linked to: {parentSelectedLabel}</p>
                ) : null}
                {parentOpen && (parentResults.length > 0 || parentSearching) ? (
                  <div className="absolute left-0 right-0 top-full z-20 mt-1 max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg">
                    {parentSearching ? (
                      <p className="px-3 py-2 text-xs font-normal text-slate-400">Searching…</p>
                    ) : (
                      parentResults.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          className="block w-full px-3 py-2 text-left text-sm font-normal hover:bg-slate-50"
                          onClick={() => {
                            patch({ parentProductId: p.id });
                            setParentSelectedLabel(`${p.name} (${p.sku})`);
                            setParentQuery('');
                            setParentOpen(false);
                          }}
                        >
                          <span className="font-medium text-slate-800">{p.name}</span>{' '}
                          <span className="text-slate-400">· {p.sku}</span>
                        </button>
                      ))
                    )}
                  </div>
                ) : null}
              </div>
            </section>

            <section className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-semibold text-slate-800">Attachments</h3>
                  <p className="text-xs text-slate-500">
                    View datasheets, warranty cards, manuals, or photos already uploaded.
                  </p>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  disabled={uploading}
                  onClick={() => fileInputRef.current?.click()}
                >
                  Add file
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*,.pdf,.doc,.docx,.xls,.xlsx"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadFile(file, false);
                    e.target.value = '';
                  }}
                />
              </div>
              {loadingMedia ? (
                <p className="text-sm text-slate-500">Loading attachments…</p>
              ) : form.attachments.length ? (
                <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
                  {form.attachments.map((a) => {
                    const href = resolveUploadUrl(a.url) ?? a.url;
                    const kind = documentKind(href, a.mimeType, a.name);
                    return (
                      <li key={a.url} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                        <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                          {kind === 'image' ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={href} alt="" className="h-full w-full object-cover" />
                          ) : (
                            <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                              {kind === 'pdf' ? 'PDF' : 'FILE'}
                            </span>
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium text-slate-800">{a.name}</p>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                            <DocumentViewerLink
                              path={a.url}
                              mimeType={a.mimeType}
                              fileName={a.name}
                            >
                              View
                            </DocumentViewerLink>
                            <a
                              href={href}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs font-medium text-slate-500 hover:text-teal-700"
                            >
                              Open in tab
                            </a>
                          </div>
                        </div>
                        <button
                          type="button"
                          className="shrink-0 text-xs font-semibold text-rose-700"
                          onClick={() =>
                            patch({
                              attachments: form.attachments.filter((x) => x.url !== a.url),
                              ...(form.imageUrl === a.url ? { imageUrl: '' } : {}),
                            })
                          }
                        >
                          Remove
                        </button>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="text-sm text-slate-500">No attachments yet.</p>
              )}
            </section>

            <datalist id="product-form-brands">
              {brands.map((b) => (
                <option key={b} value={b} />
              ))}
            </datalist>
            <datalist id="product-unit-suggestions">
              {['pcs', 'nos', 'set', 'box', 'pair', 'kg', 'mtr'].map((u) => (
                <option key={u} value={u} />
              ))}
            </datalist>
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-slate-50/80 px-5 py-3 sm:px-6">
            <Button type="button" variant="secondary" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" disabled={saving || uploading || parsing}>
              {saving ? 'Saving…' : mode === 'create' ? 'Create product' : 'Save changes'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
