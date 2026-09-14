'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Button, formatINR } from '@retail-sarathi/ui';
import { cn, inputClassName, selectClassName, toNumber } from './dashboard-ui';
import { CategorySelect } from './category-select';

export type PickerProduct = {
  id: string;
  sku: string;
  barcode?: string | null;
  name: string;
  category?: string | null;
  brand?: string | null;
  model?: string | null;
  salePrice: number;
  gstRate?: number;
  stockQty: number;
  lowStockThreshold?: number;
  trackSerial?: boolean;
  serials?: Array<{ id?: string; serialNumber: string; status?: string }>;
};

type StockFilter = 'all' | 'in' | 'low' | 'out';

export function ProductPickerDialog({
  open,
  products,
  onClose,
  onSelect,
  /** Qty already on the current bill, keyed by product id. */
  reservedQtyByProductId = {},
}: {
  open: boolean;
  products: PickerProduct[];
  onClose: () => void;
  onSelect: (product: PickerProduct) => void;
  reservedQtyByProductId?: Record<string, number>;
}) {
  const searchRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [brand, setBrand] = useState('');
  const [gstRate, setGstRate] = useState('all');
  const [stock, setStock] = useState<StockFilter>('all');
  const [serialOnly, setSerialOnly] = useState(false);

  const GST_PICKER_SLABS = [0, 5, 12, 18, 28, 40];

  function availableQty(p: PickerProduct) {
    const reserved = toNumber(reservedQtyByProductId[p.id]);
    const warehouse = toNumber(p.stockQty);
    // IMEI products can only sell units that have IN_STOCK serials
    if (p.trackSerial) {
      const serialCount = (p.serials ?? []).length;
      return Math.max(0, Math.min(warehouse, serialCount) - reserved);
    }
    return Math.max(0, warehouse - reserved);
  }

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setCategory('');
    setBrand('');
    setGstRate('all');
    setStock('all');
    setSerialOnly(false);
    const t = window.setTimeout(() => searchRef.current?.focus(), 50);
    return () => window.clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      const c = p.category?.trim();
      if (c) set.add(c);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [products]);

  const brands = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      if (category && (p.category ?? '').toLowerCase() !== category.toLowerCase()) continue;
      const b = p.brand?.trim();
      if (b) set.add(b);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [products, category]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return products.filter((p) => {
      if (category && (p.category ?? '').toLowerCase() !== category.toLowerCase()) return false;
      if (brand && (p.brand ?? '').toLowerCase() !== brand.toLowerCase()) return false;
      if (gstRate !== 'all' && toNumber(p.gstRate) !== toNumber(gstRate)) return false;
      if (serialOnly && !p.trackSerial) return false;

      const reserved = toNumber(reservedQtyByProductId[p.id]);
      const warehouse = toNumber(p.stockQty);
      const qty = p.trackSerial
        ? Math.max(0, Math.min(warehouse, (p.serials ?? []).length) - reserved)
        : Math.max(0, warehouse - reserved);
      const lowAt = toNumber(p.lowStockThreshold) || 5;
      // Default ("All stock") and "In stock": only sellable items. Use "Out of stock" to find the rest.
      if ((stock === 'all' || stock === 'in') && qty <= 0) return false;
      if (stock === 'out' && qty > 0) return false;
      if (stock === 'low' && !(qty > 0 && qty <= lowAt)) return false;

      if (!q) return true;
      return (
        p.name.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.barcode && p.barcode.toLowerCase().includes(q)) ||
        (p.brand && p.brand.toLowerCase().includes(q)) ||
        (p.model && p.model.toLowerCase().includes(q)) ||
        (p.category && p.category.toLowerCase().includes(q))
      );
    });
  }, [products, query, category, brand, gstRate, stock, serialOnly, reservedQtyByProductId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Browse products"
        className="relative flex max-h-[92dvh] w-full max-w-4xl flex-col rounded-t-2xl bg-white shadow-2xl sm:max-h-[85vh] sm:rounded-2xl"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Browse products</h2>
            <p className="text-sm text-slate-500">
              Filter by GST slab, category, brand, or stock — tap to add to bill.
            </p>
          </div>
          <Button type="button" size="sm" variant="secondary" onClick={onClose}>
            Close
          </Button>
        </div>

        <div className="space-y-3 border-b border-slate-100 px-4 py-3 sm:px-5">
          <input
            ref={searchRef}
            className={inputClassName}
            placeholder="Search name, SKU, barcode, brand, model…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setGstRate('all')}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-medium transition',
                gstRate === 'all'
                  ? 'bg-teal-800 text-white'
                  : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50',
              )}
            >
              All GST
            </button>
            {Array.from(
              new Set([
                ...GST_PICKER_SLABS,
                ...products.map((p) => toNumber(p.gstRate)).filter((n) => Number.isFinite(n)),
              ]),
            )
              .sort((a, b) => a - b)
              .map((rate) => (
                <button
                  key={rate}
                  type="button"
                  onClick={() => setGstRate(String(rate))}
                  className={cn(
                    'rounded-full px-3 py-1.5 text-xs font-medium transition',
                    gstRate === String(rate)
                      ? 'bg-teal-800 text-white'
                      : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50',
                  )}
                >
                  {rate}%
                </button>
              ))}
          </div>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <CategorySelect
              mode="filter"
              value={category}
              categories={categories}
              onChange={(v) => {
                setCategory(v);
                setBrand('');
              }}
            />
            <select
              className={selectClassName}
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
            >
              <option value="">All brands</option>
              {brands.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
            <select
              className={selectClassName}
              value={stock}
              onChange={(e) => setStock(e.target.value as StockFilter)}
            >
              <option value="all">Available</option>
              <option value="in">In stock</option>
              <option value="low">Low stock</option>
              <option value="out">Out of stock</option>
            </select>
            <label className="flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={serialOnly}
                onChange={(e) => setSerialOnly(e.target.checked)}
              />
              IMEI / serial only
            </label>
          </div>
          <p className="text-xs text-slate-500">
            {stock === 'out'
              ? `Showing ${filtered.length} out of stock`
              : `Showing ${filtered.length} available`}
            {stock !== 'out' && products.length > filtered.length
              ? ` · ${products.length - filtered.length} out of stock hidden`
              : ''}
            {Object.keys(reservedQtyByProductId).length
              ? ' · excludes items already on this bill'
              : ''}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-3 sm:p-4">
          {filtered.length === 0 ? (
            <p className="py-12 text-center text-sm text-slate-500">No products match these filters.</p>
          ) : (
            <ul className="grid gap-2 sm:grid-cols-2">
              {filtered.map((p) => {
                const qty = availableQty(p);
                const reserved = toNumber(reservedQtyByProductId[p.id]);
                const out = qty <= 0;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      disabled={out}
                      onClick={() => {
                        if (out) return;
                        onSelect(p);
                      }}
                      className={cn(
                        'flex w-full flex-col rounded-xl border px-3 py-3 text-left transition',
                        out
                          ? 'cursor-not-allowed border-slate-100 bg-slate-50 opacity-60'
                          : 'border-slate-200 bg-white hover:border-teal-300 hover:bg-teal-50/50 active:scale-[0.99]',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-900">{p.name}</p>
                          <p className="mt-0.5 truncate text-xs text-slate-500">
                            {p.sku}
                            {p.brand ? ` · ${p.brand}` : ''}
                            {p.model ? ` · ${p.model}` : ''}
                          </p>
                        </div>
                        <p className="shrink-0 font-semibold text-brand">{formatINR(toNumber(p.salePrice))}</p>
                      </div>
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {p.category ? (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-600">
                            {p.category}
                          </span>
                        ) : null}
                        {p.trackSerial ? (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-800">
                            IMEI
                          </span>
                        ) : null}
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-[10px] font-medium',
                            out
                              ? 'bg-red-50 text-red-700'
                              : qty <= (toNumber(p.lowStockThreshold) || 5)
                                ? 'bg-amber-50 text-amber-800'
                                : 'bg-emerald-50 text-emerald-800',
                          )}
                        >
                          {out ? 'No stock left' : `Available ${qty}`}
                          {reserved > 0 ? ` · ${reserved} on bill` : ''}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
