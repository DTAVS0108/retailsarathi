'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button } from '@retail-sarathi/ui';
import { apiWithAuth, fmtINR } from '@/lib/helpers';
import { cn, formatDateTime, parseError, toNumber } from './dashboard-ui';

export type ProductDetail = {
  id: string;
  sku: string;
  name: string;
  barcode?: string | null;
  hsnCode?: string | null;
  category?: string | null;
  brand?: string | null;
  model?: string | null;
  variantLabel?: string | null;
  unit?: string | null;
  abcGrade?: string | null;
  salePrice: number | string;
  purchasePrice?: number | string | null;
  gstRate: number | string;
  stockQty: number | string;
  lowStockThreshold?: number | string | null;
  trackSerial?: boolean;
  trackBatch?: boolean;
  needsEnrichment?: boolean;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
  serials?: Array<{
    id: string;
    serialNumber: string;
    imei?: string | null;
    status: string;
  }>;
  stockLedger?: Array<{
    id: string;
    type: string;
    quantity: number | string;
    notes?: string | null;
    createdAt: string;
  }>;
  salesHistory?: Array<{
    lineId: string;
    invoiceId: string;
    invoiceNumber: string;
    documentType?: string;
    date: string;
    quantity: number;
    lineTotal: number;
    customerName: string;
    customerPhone?: string | null;
  }>;
  buyers?: Array<{
    id: string;
    name: string;
    phone?: string | null;
    email?: string | null;
    times: number;
    qty: number;
  }>;
};

function marginPct(sale: number, cost: number) {
  if (!(sale > 0) || !(cost > 0)) return null;
  return Math.round(((sale - cost) / sale) * 1000) / 10;
}

function Chip({
  children,
  tone = 'neutral',
}: {
  children: React.ReactNode;
  tone?: 'neutral' | 'ok' | 'warn' | 'danger';
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold',
        tone === 'ok' && 'bg-teal-50 text-teal-800',
        tone === 'warn' && 'bg-amber-50 text-amber-800',
        tone === 'danger' && 'bg-rose-50 text-rose-800',
        tone === 'neutral' && 'bg-slate-100 text-slate-700',
      )}
    >
      {children}
    </span>
  );
}

function MetricCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  tone?: 'ok' | 'warn' | 'danger' | 'muted';
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
      <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p
        className={cn(
          'mt-0.5 text-lg font-bold tabular-nums leading-tight text-slate-900',
          tone === 'danger' && 'text-rose-700',
          tone === 'warn' && 'text-amber-700',
          tone === 'ok' && 'text-teal-700',
        )}
      >
        {value}
      </p>
      {hint ? <p className="mt-0.5 text-[10px] text-slate-500">{hint}</p> : null}
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-3 py-1 text-sm">
      <dt className="text-slate-500">{label}</dt>
      <dd className={cn('text-right font-medium text-slate-900', mono && 'font-mono text-xs')}>{value}</dd>
    </div>
  );
}

export function ProductDetailBody({ detail }: { detail: ProductDetail }) {
  const sale = toNumber(detail.salePrice);
  const purchase = toNumber(detail.purchasePrice);
  const stock = toNumber(detail.stockQty);
  const thr = toNumber(detail.lowStockThreshold ?? 5);
  const m = marginPct(sale, purchase);
  const serials = detail.serials ?? [];
  const ledger = detail.stockLedger ?? [];
  const inStockSerials = serials.filter((s) => s.status === 'IN_STOCK');
  const out = stock <= 0;
  const low = !out && stock <= thr;
  const archived = detail.isActive === false;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        <Chip tone={archived ? 'danger' : 'ok'}>{archived ? 'Archived' : 'Active'}</Chip>
        {out ? <Chip tone="danger">Out of stock</Chip> : low ? <Chip tone="warn">Low stock</Chip> : null}
        <Chip>{toNumber(detail.gstRate)}% GST</Chip>
        {detail.category ? <Chip>{detail.category}</Chip> : null}
        {detail.trackSerial ? <Chip tone="warn">IMEI tracked</Chip> : null}
        {detail.needsEnrichment ? <Chip tone="warn">Needs details</Chip> : null}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <MetricCard label="Stock" value={stock} hint={`Low at ≤ ${thr}`} tone={out ? 'danger' : low ? 'warn' : 'ok'} />
        <MetricCard label="Sale" value={fmtINR(sale)} hint={`${toNumber(detail.gstRate)}% GST`} />
        <MetricCard label="Cost" value={purchase > 0 ? fmtINR(purchase) : '—'} />
        <MetricCard
          label="Margin"
          value={m == null ? '—' : `${m}%`}
          hint={m != null && purchase > 0 ? `₹${(sale - purchase).toLocaleString('en-IN')} / unit` : undefined}
          tone={m == null ? 'muted' : m < 0 ? 'danger' : m < 10 ? 'warn' : 'ok'}
        />
      </div>

      <section className="rounded-xl border border-slate-200 px-3.5 py-3">
        <h4 className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Identity</h4>
        <dl>
          <DetailRow label="SKU" value={detail.sku} mono />
          <DetailRow label="Barcode" value={detail.barcode} mono />
          <DetailRow label="HSN" value={detail.hsnCode} />
          <DetailRow
            label="Brand / model"
            value={[detail.brand, detail.model].filter(Boolean).join(' · ') || null}
          />
          <DetailRow label="Variant" value={detail.variantLabel} />
          <DetailRow label="Unit" value={detail.unit || 'pcs'} />
          <DetailRow label="ABC grade" value={detail.abcGrade} />
        </dl>
      </section>

      <section className="rounded-xl border border-slate-200 px-3.5 py-3">
        <h4 className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Tracking</h4>
        <dl>
          <DetailRow
            label="Serial / IMEI"
            value={detail.trackSerial ? `Yes · ${inStockSerials.length} in stock` : 'Not tracked'}
          />
          <DetailRow label="Batch" value={detail.trackBatch ? 'Tracked' : 'Not tracked'} />
        </dl>
      </section>

      {detail.trackSerial ? (
        <section className="rounded-xl border border-slate-200 px-3.5 py-3">
          <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Serials · {inStockSerials.length} in stock · {serials.length} total
          </h4>
          {!serials.length ? (
            <p className="text-xs text-slate-500">No serial numbers on file.</p>
          ) : (
            <ul className="max-h-40 space-y-1 overflow-auto text-xs">
              {serials.slice(0, 40).map((s) => (
                <li key={s.id} className="flex justify-between gap-2 rounded-lg bg-slate-50 px-2 py-1.5 font-mono">
                  <span>
                    {s.serialNumber}
                    {s.imei ? ` · ${s.imei}` : ''}
                  </span>
                  <span className="text-slate-500">{s.status.replace(/_/g, ' ')}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}

      {detail.buyers?.length || detail.salesHistory?.length ? (
        <section className="rounded-xl border border-slate-200 px-3.5 py-3">
          <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Sold to · {detail.buyers?.length ?? 0} customer{(detail.buyers?.length ?? 0) === 1 ? '' : 's'}
          </h4>
          {detail.buyers?.length ? (
            <ul className="mb-3 space-y-1.5 text-xs">
              {detail.buyers.slice(0, 12).map((b) => (
                <li key={b.id} className="flex items-start justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-2">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-900">{b.name}</div>
                    <div className="text-slate-500">{[b.phone, b.email].filter(Boolean).join(' · ') || 'No contact'}</div>
                  </div>
                  <span className="shrink-0 tabular-nums text-slate-500">
                    {b.times}× · qty {b.qty}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {detail.salesHistory?.length ? (
            <>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-500">Recent bills</p>
              <ul className="max-h-48 space-y-1 overflow-auto text-xs">
                {detail.salesHistory.slice(0, 20).map((s) => (
                  <li key={s.lineId} className="flex justify-between gap-2 rounded-lg border border-slate-200 px-2.5 py-2">
                    <div className="min-w-0">
                      <Link
                        href={`/dashboard/invoices/${s.invoiceId}`}
                        className="font-semibold text-teal-700 hover:underline"
                      >
                        {s.invoiceNumber}
                        {s.documentType === 'CREDIT_NOTE' ? ' · return' : ''}
                      </Link>
                      <div className="text-slate-900">{s.customerName}</div>
                      <div className="text-slate-500">
                        {formatDateTime(s.date)}
                        {s.customerPhone ? ` · ${s.customerPhone}` : ''}
                      </div>
                    </div>
                    <div className="shrink-0 text-right tabular-nums">
                      <div className="font-semibold">qty {s.quantity}</div>
                      <div className="text-slate-500">₹{s.lineTotal.toLocaleString('en-IN')}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      ) : archived ? (
        <section className="rounded-xl border border-slate-200 px-3.5 py-3">
          <h4 className="mb-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">Sold to</h4>
          <p className="text-xs text-slate-500">No finalized sales found for this SKU.</p>
        </section>
      ) : null}

      <section className="rounded-xl border border-slate-200 px-3.5 py-3">
        <h4 className="mb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">Recent stock movements</h4>
        {!ledger.length ? (
          <p className="text-xs text-slate-500">No ledger entries yet.</p>
        ) : (
          <ul className="space-y-1.5 text-xs">
            {ledger.slice(0, 12).map((mvt) => (
              <li key={mvt.id} className="flex items-start justify-between gap-2 rounded-lg bg-slate-50 px-2.5 py-2">
                <div className="min-w-0">
                  <div className="font-semibold text-slate-900">{mvt.type.replace(/_/g, ' ')}</div>
                  <div className="text-slate-500">{formatDateTime(mvt.createdAt)}</div>
                  {mvt.notes ? <div className="text-slate-500">{mvt.notes}</div> : null}
                </div>
                <span
                  className={cn(
                    'shrink-0 font-bold tabular-nums',
                    toNumber(mvt.quantity) < 0 ? 'text-rose-700' : 'text-teal-700',
                  )}
                >
                  {toNumber(mvt.quantity) > 0 ? '+' : ''}
                  {toNumber(mvt.quantity)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {detail.createdAt || detail.updatedAt ? (
        <p className="text-[10px] text-slate-500">
          {detail.createdAt ? `Created ${formatDateTime(detail.createdAt)}` : null}
          {detail.createdAt && detail.updatedAt ? ' · ' : null}
          {detail.updatedAt ? `Updated ${formatDateTime(detail.updatedAt)}` : null}
        </p>
      ) : null}
    </div>
  );
}

export function ProductDetailPanel({
  productId,
  onClose,
  onEdit,
}: {
  productId: string | null;
  onClose: () => void;
  onEdit?: (detail: ProductDetail) => void;
}) {
  const [detail, setDetail] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!productId) {
      setDetail(null);
      setError('');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        setError('');
        const res = await apiWithAuth<ProductDetail>(`/products/${productId}`);
        if (!cancelled) setDetail(res);
      } catch (err) {
        if (!cancelled) {
          setDetail(null);
          setError(parseError(err));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [productId]);

  useEffect(() => {
    if (!productId) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [productId, onClose]);

  if (!productId) return null;

  const canEdit = detail?.isActive !== false && onEdit;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40" role="dialog" aria-modal="true">
      <button type="button" className="absolute inset-0 cursor-default" aria-label="Close" onClick={onClose} />
      <div className="relative z-10 flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-xl">
        <div className="flex shrink-0 items-center gap-2 border-b border-slate-100 bg-slate-50 px-4 py-3">
          <Button type="button" size="sm" variant="secondary" onClick={onClose}>
            ← Back
          </Button>
          <div className="min-w-0 flex-1">
            <h3 className="truncate text-base font-semibold text-slate-900">
              {loading ? 'Loading…' : detail?.name ?? 'Product'}
            </h3>
            <p className="truncate text-xs text-slate-500">
              {[detail?.sku, detail?.brand, detail?.category, detail?.isActive === false ? 'Archived' : null]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          {canEdit && detail ? (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                onEdit(detail);
                onClose();
              }}
            >
              Edit
            </Button>
          ) : null}
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-4">
          {loading ? (
            <p className="text-sm text-slate-500">Loading product details…</p>
          ) : error ? (
            <p className="text-sm text-rose-700">{error}</p>
          ) : detail ? (
            <ProductDetailBody detail={detail} />
          ) : (
            <p className="text-sm text-rose-700">Product not found.</p>
          )}
        </div>
      </div>
    </div>
  );
}
