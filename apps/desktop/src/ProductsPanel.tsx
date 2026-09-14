import { FormEvent, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useToastMessage } from './toast';

type ProductRow = {
  id: string;
  sku: string;
  name: string;
  barcode?: string | null;
  hsnCode: string;
  salePrice: number | string;
  purchasePrice?: number | string;
  gstRate: number | string;
  stockQty: number | string;
  lowStockThreshold?: number | string;
  trackSerial?: boolean;
  trackBatch?: boolean;
  mrp?: number | string | null;
  category?: string | null;
  brand?: string | null;
  model?: string | null;
  unit?: string | null;
  variantLabel?: string | null;
  abcGrade?: string | null;
  imageUrl?: string | null;
  isActive?: boolean;
  needsEnrichment?: boolean;
  createdAt?: string;
  updatedAt?: string;
  archivedAt?: string | null;
  soldQty?: number;
  invoiceCount?: number;
  customerCount?: number;
  lastSoldAt?: string | null;
  lastInvoiceNumber?: string | null;
  lastCustomerName?: string | null;
  buyers?: Array<{
    id: string;
    name: string;
    phone?: string | null;
    email?: string | null;
    times: number;
    qty?: number;
  }>;
};

type ProductDetail = ProductRow & {
  serials?: Array<{
    id: string;
    serialNumber: string;
    imei?: string | null;
    status: string;
    condition?: string;
    warrantyEnd?: string | null;
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
    customer?: {
      id: string;
      name: string;
      phone?: string | null;
      email?: string | null;
      gstin?: string | null;
    } | null;
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

type Facets = {
  totalSkus: number;
  lowStockCount: number;
  outOfStockCount: number;
  categories?: string[];
  brands?: string[];
};

type StockFilter = 'all' | 'low' | 'out' | 'in';
type ViewMode = 'active' | 'inactive';

const GST_SLABS = ['0', '5', '12', '18', '28', '40'];
const DEFAULT_CATEGORIES = ['Battery', 'Inverter', 'Stabilizer', 'Accessories', 'General', 'Mobile', 'Spare'];
const OTHER = '__other__';
const ADJUST_REASONS = ['Miscounted', 'Damaged', 'Theft', 'Opening stock', 'Return to stock', 'Other'];

type FormState = {
  sku: string;
  name: string;
  barcode: string;
  hsnCode: string;
  salePrice: string;
  purchasePrice: string;
  gstRate: string;
  stockQty: string;
  lowStockThreshold: string;
  category: string;
  brand: string;
  model: string;
  trackSerial: boolean;
};

const EMPTY: FormState = {
  sku: '',
  name: '',
  barcode: '',
  hsnCode: '',
  salePrice: '',
  purchasePrice: '',
  gstRate: '18',
  stockQty: '0',
  lowStockThreshold: '5',
  category: '',
  brand: '',
  model: '',
  trackSerial: false,
};

function num(v: number | string | null | undefined) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function rowToForm(p: ProductRow): FormState {
  return {
    sku: p.sku,
    name: p.name,
    barcode: p.barcode ?? '',
    hsnCode: p.hsnCode,
    salePrice: String(num(p.salePrice)),
    purchasePrice: String(num(p.purchasePrice)),
    gstRate: String(num(p.gstRate)),
    stockQty: String(num(p.stockQty)),
    lowStockThreshold: String(num(p.lowStockThreshold ?? 5)),
    category: p.category ?? '',
    brand: p.brand ?? '',
    model: p.model ?? '',
    trackSerial: Boolean(p.trackSerial),
  };
}

function marginPct(sale: number, purchase: number) {
  if (!(purchase > 0)) return null;
  return Math.round(((sale - purchase) / purchase) * 1000) / 10;
}

function isLow(p: ProductRow) {
  const qty = num(p.stockQty);
  const thr = num(p.lowStockThreshold ?? 5);
  return qty > 0 && qty <= thr;
}

function fmtWhen(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtInr(n: number) {
  return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  if (value == null || value === '') return null;
  return (
    <div
      className="grid grid-cols-[6.5rem_1fr] gap-x-3 border-b py-2 text-sm last:border-b-0"
      style={{ borderColor: 'var(--rs-border)' }}
    >
      <dt className="text-xs font-medium" style={{ color: 'var(--rs-muted)' }}>
        {label}
      </dt>
      <dd
        className={`min-w-0 break-words font-medium ${mono ? 'font-mono text-[13px]' : ''}`}
        style={{ color: 'var(--rs-ink)' }}
      >
        {value}
      </dd>
    </div>
  );
}

function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section
      className="rounded-xl border px-3.5 py-3"
      style={{ borderColor: 'var(--rs-border)', background: 'var(--rs-surface)' }}
    >
      <h4
        className="mb-1 text-[10px] font-bold uppercase tracking-wider"
        style={{ color: 'var(--rs-muted)' }}
      >
        {title}
      </h4>
      <dl>{children}</dl>
    </section>
  );
}

function MetricCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  tone?: 'ok' | 'warn' | 'danger' | 'muted';
}) {
  const color =
    tone === 'danger'
      ? '#b91c1c'
      : tone === 'warn'
        ? '#a16207'
        : tone === 'ok'
          ? 'var(--rs-accent)'
          : 'var(--rs-ink)';
  return (
    <div
      className="rounded-xl px-3 py-2.5"
      style={{ background: 'var(--rs-surface-2)', border: '1px solid var(--rs-border)' }}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--rs-muted)' }}>
        {label}
      </p>
      <p className="mt-0.5 text-lg font-bold tabular-nums leading-tight" style={{ color }}>
        {value}
      </p>
      {hint ? (
        <p className="mt-0.5 text-[10px]" style={{ color: 'var(--rs-muted)' }}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

function Chip({ children, tone }: { children: ReactNode; tone?: 'neutral' | 'ok' | 'warn' | 'danger' }) {
  const styles =
    tone === 'ok'
      ? { background: 'color-mix(in srgb, var(--rs-accent) 14%, transparent)', color: 'var(--rs-accent)' }
      : tone === 'warn'
        ? { background: 'color-mix(in srgb, #ca8a04 18%, transparent)', color: '#a16207' }
        : tone === 'danger'
          ? { background: 'color-mix(in srgb, #dc2626 14%, transparent)', color: '#b91c1c' }
          : { background: 'var(--rs-surface-2)', color: 'var(--rs-ink)' };
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={styles}
    >
      {children}
    </span>
  );
}

function ProductDetailBody({ detail }: { detail: ProductDetail }) {
  const sale = num(detail.salePrice);
  const purchase = num(detail.purchasePrice);
  const stock = num(detail.stockQty);
  const thr = num(detail.lowStockThreshold ?? 5);
  const m = marginPct(sale, purchase);
  const serials = detail.serials ?? [];
  const ledger = detail.stockLedger ?? [];
  const inStockSerials = serials.filter((s) => s.status === 'IN_STOCK');
  const out = stock <= 0;
  const low = !out && stock <= thr;
  const archived = detail.isActive === false;

  const stockTone = out ? 'danger' : low ? 'warn' : 'ok';
  const marginTone = m == null ? 'muted' : m < 0 ? 'danger' : m < 10 ? 'warn' : 'ok';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1.5">
        <Chip tone={archived ? 'danger' : 'ok'}>{archived ? 'Archived' : 'Active'}</Chip>
        {out ? <Chip tone="danger">Out of stock</Chip> : low ? <Chip tone="warn">Low stock</Chip> : null}
        <Chip>{num(detail.gstRate)}% GST</Chip>
        {detail.category ? <Chip>{detail.category}</Chip> : null}
        {detail.trackSerial ? <Chip tone="warn">IMEI tracked</Chip> : null}
        {detail.needsEnrichment ? <Chip tone="warn">Needs details</Chip> : null}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <MetricCard
          label="Stock"
          value={stock}
          hint={`Low at ≤ ${thr}`}
          tone={stockTone}
        />
        <MetricCard label="Sale" value={fmtInr(sale)} hint={`${num(detail.gstRate)}% GST`} />
        <MetricCard
          label="Cost"
          value={purchase > 0 ? fmtInr(purchase) : '—'}
          tone={purchase > 0 ? 'muted' : 'muted'}
        />
        <MetricCard
          label="Margin"
          value={m == null ? '—' : `${m}%`}
          hint={m != null && purchase > 0 ? `₹${(sale - purchase).toLocaleString('en-IN')} / unit` : undefined}
          tone={marginTone}
        />
      </div>

      <DetailSection title="Identity">
        <DetailRow label="SKU" value={detail.sku} mono />
        <DetailRow label="Barcode" value={detail.barcode} mono />
        <DetailRow label="HSN" value={detail.hsnCode} />
        <DetailRow
          label="Brand / model"
          value={
            [detail.brand, detail.model].filter(Boolean).join(' · ') || null
          }
        />
        <DetailRow label="Variant" value={detail.variantLabel} />
        <DetailRow label="Unit" value={detail.unit || 'pcs'} />
        <DetailRow label="ABC grade" value={detail.abcGrade} />
      </DetailSection>

      <DetailSection title="Tracking">
        <DetailRow
          label="Serial / IMEI"
          value={detail.trackSerial ? `Yes · ${inStockSerials.length} in stock` : 'Not tracked'}
        />
        <DetailRow label="Batch" value={detail.trackBatch ? 'Tracked' : 'Not tracked'} />
      </DetailSection>

      {detail.trackSerial ? (
        <section className="rounded-xl border px-3.5 py-3" style={{ borderColor: 'var(--rs-border)' }}>
          <h4
            className="mb-2 text-[10px] font-bold uppercase tracking-wider"
            style={{ color: 'var(--rs-muted)' }}
          >
            Serials · {inStockSerials.length} in stock · {serials.length} total
          </h4>
          {!serials.length ? (
            <p className="text-xs" style={{ color: 'var(--rs-muted)' }}>
              No serial numbers on file.
            </p>
          ) : (
            <ul className="max-h-40 space-y-1 overflow-auto text-xs">
              {serials.slice(0, 40).map((s) => (
                <li
                  key={s.id}
                  className="flex justify-between gap-2 rounded-lg px-2 py-1.5 font-mono"
                  style={{ background: 'var(--rs-surface-2)' }}
                >
                  <span>
                    {s.serialNumber}
                    {s.imei ? ` · ${s.imei}` : ''}
                  </span>
                  <span style={{ color: 'var(--rs-muted)' }}>{s.status.replace(/_/g, ' ')}</span>
                </li>
              ))}
              {serials.length > 40 ? (
                <li className="px-2 text-[11px]" style={{ color: 'var(--rs-muted)' }}>
                  …and {serials.length - 40} more
                </li>
              ) : null}
            </ul>
          )}
        </section>
      ) : null}

      {(detail.buyers?.length || detail.salesHistory?.length) ? (
        <section className="rounded-xl border px-3.5 py-3" style={{ borderColor: 'var(--rs-border)' }}>
          <h4
            className="mb-2 text-[10px] font-bold uppercase tracking-wider"
            style={{ color: 'var(--rs-muted)' }}
          >
            Sold to · {detail.buyers?.length ?? 0} customer{(detail.buyers?.length ?? 0) === 1 ? '' : 's'}
          </h4>
          {detail.buyers?.length ? (
            <ul className="mb-3 space-y-1.5 text-xs">
              {detail.buyers.slice(0, 12).map((b) => (
                <li
                  key={b.id}
                  className="flex items-start justify-between gap-2 rounded-lg px-2.5 py-2"
                  style={{ background: 'var(--rs-surface-2)' }}
                >
                  <div className="min-w-0">
                    <div className="font-semibold" style={{ color: 'var(--rs-ink)' }}>
                      {b.name}
                    </div>
                    <div style={{ color: 'var(--rs-muted)' }}>
                      {[b.phone, b.email].filter(Boolean).join(' · ') || 'No contact'}
                    </div>
                  </div>
                  <span className="shrink-0 tabular-nums" style={{ color: 'var(--rs-muted)' }}>
                    {b.times}×{b.qty != null ? ` · qty ${b.qty}` : ''}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {detail.salesHistory?.length ? (
            <>
              <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider" style={{ color: 'var(--rs-muted)' }}>
                Recent bills
              </p>
              <ul className="max-h-48 space-y-1 overflow-auto text-xs">
                {detail.salesHistory.slice(0, 20).map((s) => (
                  <li
                    key={s.lineId}
                    className="flex justify-between gap-2 rounded-lg border px-2.5 py-2"
                    style={{ borderColor: 'var(--rs-border)' }}
                  >
                    <div className="min-w-0">
                      <div className="font-semibold" style={{ color: 'var(--rs-accent)' }}>
                        {s.invoiceNumber}
                        {s.documentType === 'CREDIT_NOTE' ? ' · return' : ''}
                      </div>
                      <div style={{ color: 'var(--rs-ink)' }}>{s.customerName}</div>
                      <div style={{ color: 'var(--rs-muted)' }}>
                        {fmtWhen(s.date)}
                        {s.customerPhone ? ` · ${s.customerPhone}` : ''}
                      </div>
                    </div>
                    <div className="shrink-0 text-right tabular-nums">
                      <div className="font-semibold">qty {s.quantity}</div>
                      <div style={{ color: 'var(--rs-muted)' }}>₹{s.lineTotal.toLocaleString('en-IN')}</div>
                    </div>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </section>
      ) : archived ? (
        <section className="rounded-xl border px-3.5 py-3" style={{ borderColor: 'var(--rs-border)' }}>
          <h4
            className="mb-1 text-[10px] font-bold uppercase tracking-wider"
            style={{ color: 'var(--rs-muted)' }}
          >
            Sold to
          </h4>
          <p className="text-xs" style={{ color: 'var(--rs-muted)' }}>
            No finalized sales found for this SKU.
          </p>
        </section>
      ) : null}

      <section className="rounded-xl border px-3.5 py-3" style={{ borderColor: 'var(--rs-border)' }}>
        <h4
          className="mb-2 text-[10px] font-bold uppercase tracking-wider"
          style={{ color: 'var(--rs-muted)' }}
        >
          Recent stock movements
        </h4>
        {!ledger.length ? (
          <p className="text-xs" style={{ color: 'var(--rs-muted)' }}>
            No ledger entries yet.
          </p>
        ) : (
          <ul className="space-y-1.5 text-xs">
            {ledger.slice(0, 12).map((mvt) => (
              <li
                key={mvt.id}
                className="flex items-start justify-between gap-2 rounded-lg px-2.5 py-2"
                style={{ background: 'var(--rs-surface-2)' }}
              >
                <div className="min-w-0">
                  <div className="font-semibold" style={{ color: 'var(--rs-ink)' }}>
                    {mvt.type.replace(/_/g, ' ')}
                  </div>
                  <div style={{ color: 'var(--rs-muted)' }}>{fmtWhen(mvt.createdAt)}</div>
                  {mvt.notes ? <div style={{ color: 'var(--rs-muted)' }}>{mvt.notes}</div> : null}
                </div>
                <span
                  className="shrink-0 font-bold tabular-nums"
                  style={{ color: num(mvt.quantity) < 0 ? 'var(--rs-danger)' : 'var(--rs-accent)' }}
                >
                  {num(mvt.quantity) > 0 ? '+' : ''}
                  {num(mvt.quantity)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="text-[10px]" style={{ color: 'var(--rs-muted)' }}>
        Created {fmtWhen(detail.createdAt)} · Updated {fmtWhen(detail.updatedAt)}
      </p>
    </div>
  );
}

function ProductFormFields({
  value,
  onChange,
  categoryOptions,
  showSku,
  showStock,
}: {
  value: FormState;
  onChange: (patch: Partial<FormState>) => void;
  categoryOptions: string[];
  showSku?: boolean;
  showStock?: boolean;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {showSku ? (
        <label className="space-y-1 text-xs font-medium" style={{ color: 'var(--rs-muted)' }}>
          <span>SKU *</span>
          <input
            className="rs-input w-full text-sm"
            value={value.sku}
            onChange={(e) => onChange({ sku: e.target.value })}
            autoFocus
          />
        </label>
      ) : null}
      <label className="space-y-1 text-xs font-medium" style={{ color: 'var(--rs-muted)' }}>
        <span>Name *</span>
        <input
          className="rs-input w-full text-sm"
          value={value.name}
          onChange={(e) => onChange({ name: e.target.value })}
          autoFocus={!showSku}
        />
      </label>
      <label className="space-y-1 text-xs font-medium" style={{ color: 'var(--rs-muted)' }}>
        <span>Barcode</span>
        <input
          className="rs-input w-full font-mono text-sm"
          value={value.barcode}
          onChange={(e) => onChange({ barcode: e.target.value })}
        />
      </label>
      <label className="space-y-1 text-xs font-medium" style={{ color: 'var(--rs-muted)' }}>
        <span>HSN *</span>
        <input
          className="rs-input w-full text-sm"
          value={value.hsnCode}
          onChange={(e) => onChange({ hsnCode: e.target.value })}
        />
      </label>
      <label className="space-y-1 text-xs font-medium" style={{ color: 'var(--rs-muted)' }}>
        <span>Category</span>
        <DesktopCategorySelect
          value={value.category}
          options={categoryOptions}
          onChange={(category) => onChange({ category })}
        />
      </label>
      <label className="space-y-1 text-xs font-medium" style={{ color: 'var(--rs-muted)' }}>
        <span>Brand</span>
        <input
          className="rs-input w-full text-sm"
          value={value.brand}
          onChange={(e) => onChange({ brand: e.target.value })}
        />
      </label>
      <label className="space-y-1 text-xs font-medium" style={{ color: 'var(--rs-muted)' }}>
        <span>Model</span>
        <input
          className="rs-input w-full text-sm"
          value={value.model}
          onChange={(e) => onChange({ model: e.target.value })}
        />
      </label>
      <label className="space-y-1 text-xs font-medium" style={{ color: 'var(--rs-muted)' }}>
        <span>Sale ₹ *</span>
        <input
          className="rs-input w-full text-sm"
          value={value.salePrice}
          onChange={(e) => onChange({ salePrice: e.target.value })}
          inputMode="decimal"
        />
      </label>
      <label className="space-y-1 text-xs font-medium" style={{ color: 'var(--rs-muted)' }}>
        <span>Purchase ₹</span>
        <input
          className="rs-input w-full text-sm"
          value={value.purchasePrice}
          onChange={(e) => onChange({ purchasePrice: e.target.value })}
          inputMode="decimal"
        />
      </label>
      <label className="space-y-1 text-xs font-medium" style={{ color: 'var(--rs-muted)' }}>
        <span>GST %</span>
        <select
          className="rs-input w-full text-sm"
          value={value.gstRate}
          onChange={(e) => onChange({ gstRate: e.target.value })}
        >
          {GST_SLABS.map((r) => (
            <option key={r} value={r}>
              {r}%
            </option>
          ))}
        </select>
      </label>
      {showStock ? (
        <label className="space-y-1 text-xs font-medium" style={{ color: 'var(--rs-muted)' }}>
          <span>Opening stock</span>
          <input
            className="rs-input w-full text-sm"
            value={value.stockQty}
            onChange={(e) => onChange({ stockQty: e.target.value })}
            inputMode="decimal"
          />
        </label>
      ) : null}
      <label className="space-y-1 text-xs font-medium" style={{ color: 'var(--rs-muted)' }}>
        <span>Low-stock at</span>
        <input
          className="rs-input w-full text-sm"
          value={value.lowStockThreshold}
          onChange={(e) => onChange({ lowStockThreshold: e.target.value })}
          inputMode="decimal"
        />
      </label>
      <label className="flex items-center gap-2 self-end pb-2 text-sm" style={{ color: 'var(--rs-ink)' }}>
        <input
          type="checkbox"
          checked={value.trackSerial}
          onChange={(e) => onChange({ trackSerial: e.target.checked })}
        />
        Track IMEI / serial
      </label>
    </div>
  );
}

function DesktopCategorySelect({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  const merged = Array.from(new Set([...DEFAULT_CATEGORIES, ...options])).sort((a, b) =>
    a.localeCompare(b),
  );
  const matched = merged.find((c) => c.toLowerCase() === value.trim().toLowerCase()) || '';
  const isOther = Boolean(value.trim() && !matched);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState(isOther ? value : '');
  const showOther = adding || isOther;

  return (
    <div className="space-y-1">
      <select
        className="rs-input w-full text-sm"
        value={showOther ? OTHER : matched}
        onChange={(e) => {
          if (e.target.value === OTHER) {
            setAdding(true);
            setDraft('');
            return;
          }
          setAdding(false);
          setDraft('');
          onChange(e.target.value);
        }}
      >
        <option value="">Select category</option>
        {merged.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
        <option value={OTHER}>Other (add new)…</option>
      </select>
      {showOther ? (
        <input
          className="rs-input w-full text-sm"
          placeholder="New category name"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            onChange(draft.trim());
            setAdding(false);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onChange(draft.trim());
              setAdding(false);
            }
          }}
        />
      ) : null}
    </div>
  );
}

export function ProductsPanel({
  token,
  apiFetch,
  onCatalogChanged,
}: {
  token: string;
  apiFetch: <T>(token: string, path: string, init?: RequestInit) => Promise<T>;
  onCatalogChanged?: () => void | Promise<void>;
}) {
  const [items, setItems] = useState<ProductRow[]>([]);
  const [inactive, setInactive] = useState<ProductRow[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [editId, setEditId] = useState<string | null>(null);
  const [edit, setEdit] = useState<FormState>(EMPTY);
  const [query, setQuery] = useState('');
  const [stockFilter, setStockFilter] = useState<StockFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [brandFilter, setBrandFilter] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('active');
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  useToastMessage(msg, setMsg);
  useToastMessage(error, 'error', setError);
  const searchRef = useRef<HTMLInputElement>(null);

  const [adjust, setAdjust] = useState<{
    id: string;
    name: string;
    stock: number;
    delta: string;
    reason: string;
  } | null>(null);

  const [serialQ, setSerialQ] = useState('');
  const [serialHits, setSerialHits] = useState<
    Array<{ serialNumber: string; status: string; productName: string; productSku: string }>
  >([]);
  const [serialBusy, setSerialBusy] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ProductDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ pageSize: '500' });
      if (stockFilter === 'low') params.set('lowStock', '1');
      if (stockFilter === 'out') params.set('outOfStock', '1');
      if (categoryFilter) params.set('category', categoryFilter);
      if (brandFilter) params.set('brand', brandFilter);
      if (query.trim()) params.set('search', query.trim());

      const [catalog, cats, fac, inactiveRes] = await Promise.all([
        apiFetch<{ items: ProductRow[] }>(token, `/products?${params}`),
        apiFetch<Array<{ name: string }>>(token, '/categories').catch(() => []),
        apiFetch<Facets>(token, '/products/facets').catch(() => null),
        apiFetch<ProductRow[]>(token, '/products/inactive').catch(() => []),
      ]);
      setItems(catalog.items ?? []);
      setCategories((cats ?? []).map((c) => c.name).filter(Boolean));
      setFacets(fac);
      setInactive(Array.isArray(inactiveRes) ? inactiveRes : []);
      await apiFetch(token, '/categories/sync-from-products', { method: 'POST' }).catch(() => null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load products');
    } finally {
      setLoading(false);
    }
  }, [token, apiFetch, stockFilter, categoryFilter, brandFilter, query]);

  useEffect(() => {
    const t = window.setTimeout(() => void load(), 200);
    return () => window.clearTimeout(t);
  }, [load]);

  const openDetail = useCallback(
    async (id: string) => {
      setDetailId(id);
      setDetailLoading(true);
      setDetail(null);
      try {
        const d = await apiFetch<ProductDetail>(token, `/products/${id}`);
        setDetail(d);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load product');
        setDetailId(null);
      } finally {
        setDetailLoading(false);
      }
    },
    [apiFetch, token],
  );

  const formOpen = showCreate || Boolean(editId);

  const closeProductForm = useCallback(() => {
    setShowCreate(false);
    setEditId(null);
  }, []);

  const openCreateForm = useCallback((seed?: Partial<FormState>) => {
    setEditId(null);
    setForm({ ...EMPTY, ...seed });
    setShowCreate(true);
  }, []);

  const openEditForm = useCallback((p: ProductRow) => {
    setShowCreate(false);
    setEditId(p.id);
    setEdit(rowToForm(p));
  }, []);

  useEffect(() => {
    if (!detailId && !formOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (formOpen) {
        closeProductForm();
        return;
      }
      setDetailId(null);
      setDetail(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detailId, formOpen, closeProductForm]);

  const categorySuggestions = useMemo(() => {
    const set = new Set([...(facets?.categories ?? []), ...categories]);
    for (const p of items) {
      if (p.category?.trim()) set.add(p.category.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [categories, facets, items]);

  const brandSuggestions = useMemo(() => {
    const set = new Set(facets?.brands ?? []);
    for (const p of items) {
      if (p.brand?.trim()) set.add(p.brand.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [facets, items]);

  const sourceList = viewMode === 'active' ? items : inactive;

  const visible = useMemo(() => {
    let list = sourceList;
    if (stockFilter === 'in') list = list.filter((p) => num(p.stockQty) > 0);
    // server already filters low/out when active; still apply client low for inactive view
    if (viewMode === 'inactive' && stockFilter === 'low') list = list.filter(isLow);
    if (viewMode === 'inactive' && stockFilter === 'out') list = list.filter((p) => num(p.stockQty) <= 0);
    return list;
  }, [sourceList, stockFilter, viewMode]);

  async function lookupBarcode() {
    const code = query.trim();
    if (!code) return;
    setSaving(true);
    setError('');
    try {
      const p = await apiFetch<ProductRow>(token, `/products/barcode/${encodeURIComponent(code)}`);
      setMsg(`Found ${p.name} · stock ${num(p.stockQty)}`);
      openEditForm(p);
    } catch {
      setMsg(`No product for barcode/SKU “${code}” — create one?`);
      openCreateForm({ barcode: code, sku: code });
    } finally {
      setSaving(false);
    }
  }

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setMsg('');
    setError('');
    try {
      if (!form.sku.trim() || !form.name.trim() || !form.hsnCode.trim()) {
        throw new Error('SKU, name, and HSN are required');
      }
      await apiFetch(token, '/products', {
        method: 'POST',
        body: JSON.stringify({
          sku: form.sku.trim(),
          name: form.name.trim(),
          barcode: form.barcode.trim() || undefined,
          hsnCode: form.hsnCode.trim(),
          salePrice: Number(form.salePrice) || 0,
          purchasePrice: Number(form.purchasePrice) || 0,
          gstRate: Number(form.gstRate) || 18,
          stockQty: Number(form.stockQty) || 0,
          lowStockThreshold: Number(form.lowStockThreshold) || 5,
          category: form.category.trim() || undefined,
          brand: form.brand.trim() || undefined,
          model: form.model.trim() || undefined,
          trackSerial: form.trackSerial,
        }),
      });
      setForm(EMPTY);
      closeProductForm();
      setMsg('Product created');
      await load();
      await onCatalogChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveEdit(e?: FormEvent) {
    e?.preventDefault();
    if (!editId) return;
    setSaving(true);
    setMsg('');
    setError('');
    try {
      if (!edit.name.trim() || !edit.hsnCode.trim()) {
        throw new Error('Name and HSN are required');
      }
      await apiFetch(token, `/products/${editId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: edit.name.trim(),
          barcode: edit.barcode.trim() || null,
          hsnCode: edit.hsnCode.trim(),
          salePrice: Number(edit.salePrice) || 0,
          purchasePrice: Number(edit.purchasePrice) || 0,
          gstRate: Number(edit.gstRate) || 18,
          lowStockThreshold: Number(edit.lowStockThreshold) || 5,
          category: edit.category.trim() || null,
          brand: edit.brand.trim() || null,
          model: edit.model.trim() || null,
          trackSerial: edit.trackSerial,
        }),
      });
      closeProductForm();
      setMsg('Product updated');
      await load();
      await onCatalogChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  }

  async function submitAdjust() {
    if (!adjust) return;
    const quantity = Number(adjust.delta);
    if (!Number.isFinite(quantity) || quantity === 0) {
      setError('Enter a non-zero quantity delta (+/-)');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiFetch(token, `/products/${adjust.id}/stock`, {
        method: 'POST',
        body: JSON.stringify({ quantity, notes: adjust.reason || 'ADJUSTMENT' }),
      });
      setMsg(`Stock adjusted for ${adjust.name} (${quantity > 0 ? '+' : ''}${quantity})`);
      setAdjust(null);
      await load();
      await onCatalogChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Stock adjust failed');
    } finally {
      setSaving(false);
    }
  }

  async function archiveProduct(p: ProductRow) {
    if (num(p.stockQty) > 0) {
      setError('Archive only when stock is 0 — adjust stock first');
      return;
    }
    if (!window.confirm(`Archive ${p.name}?\n\nHidden from POS. Stays in Archived forever with customer sales history.`)) return;
    setSaving(true);
    try {
      await apiFetch(token, `/products/${p.id}`, { method: 'DELETE' });
      setMsg(`Archived ${p.sku}`);
      await load();
      await onCatalogChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Archive failed');
    } finally {
      setSaving(false);
    }
  }

  async function restoreProduct(p: ProductRow) {
    setSaving(true);
    try {
      await apiFetch(token, `/products/${p.id}/restore`, { method: 'POST' });
      setMsg(`Restored ${p.sku}`);
      await load();
      await onCatalogChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Restore failed');
    } finally {
      setSaving(false);
    }
  }

  async function exportCsv() {
    setSaving(true);
    try {
      const res = await apiFetch<{ filename?: string; csv: string }>(token, '/products/export');
      const blob = new Blob([res.csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.filename || 'products.csv';
      a.click();
      URL.revokeObjectURL(url);
      setMsg('CSV exported');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => {
    if (serialQ.trim().length < 3) {
      setSerialHits([]);
      return;
    }
    const t = window.setTimeout(() => {
      void (async () => {
        setSerialBusy(true);
        try {
          const hits = await apiFetch<
            Array<{ serialNumber: string; status: string; productName: string; productSku: string }>
          >(token, `/products/serials/search?q=${encodeURIComponent(serialQ.trim())}`);
          setSerialHits(Array.isArray(hits) ? hits.slice(0, 8) : []);
        } catch {
          setSerialHits([]);
        } finally {
          setSerialBusy(false);
        }
      })();
    }, 280);
    return () => window.clearTimeout(t);
  }, [serialQ, token, apiFetch]);

  if (loading && !items.length) {
    return (
      <div className="flex flex-1 items-center justify-center text-sm" style={{ color: 'var(--rs-muted)' }}>
        Loading products…
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold" style={{ color: 'var(--rs-ink)' }}>
            Products &amp; inventory
          </h2>
          <p className="text-sm" style={{ color: 'var(--rs-muted)' }}>
            Counter catalog · stock adjust · barcode · serial lookup · archive
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="rs-btn-secondary text-sm" disabled={saving} onClick={() => void exportCsv()}>
            Export CSV
          </button>
          <button
            type="button"
            className="rs-btn-primary text-sm"
            onClick={() => openCreateForm()}
          >
            Add product
          </button>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-4">
        {(
          [
            ['SKUs', facets?.totalSkus ?? items.length],
            ['Low stock', facets?.lowStockCount ?? items.filter(isLow).length],
            ['Out of stock', facets?.outOfStockCount ?? items.filter((p) => num(p.stockQty) <= 0).length],
            ['Archived', inactive.length],
          ] as const
        ).map(([label, value]) => (
          <div
            key={label}
            className="rounded-xl px-3 py-2"
            style={{ background: 'var(--rs-surface)', border: '1px solid var(--rs-border)' }}
          >
            <p className="text-[10px] font-semibold uppercase" style={{ color: 'var(--rs-muted)' }}>
              {label}
            </p>
            <p className="text-xl font-bold" style={{ color: 'var(--rs-ink)' }}>
              {value}
            </p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ['all', 'All'],
            ['in', 'In stock'],
            ['low', 'Low'],
            ['out', 'Out'],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            className={stockFilter === id ? 'rs-btn-primary text-xs' : 'rs-btn-secondary text-xs'}
            style={{ minHeight: 32 }}
            onClick={() => setStockFilter(id)}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          className={viewMode === 'active' ? 'rs-btn-primary text-xs' : 'rs-btn-secondary text-xs'}
          style={{ minHeight: 32 }}
          onClick={() => setViewMode('active')}
        >
          Active
        </button>
        <button
          type="button"
          className={viewMode === 'inactive' ? 'rs-btn-primary text-xs' : 'rs-btn-secondary text-xs'}
          style={{ minHeight: 32 }}
          onClick={() => setViewMode('inactive')}
        >
          Archived ({inactive.length})
        </button>
        <select
          className="rs-input max-w-[160px] text-sm"
          style={{ minHeight: 32 }}
          value={categoryFilter}
          onChange={(e) => setCategoryFilter(e.target.value)}
        >
          <option value="">All categories</option>
          {categorySuggestions.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          className="rs-input max-w-[140px] text-sm"
          style={{ minHeight: 32 }}
          value={brandFilter}
          onChange={(e) => setBrandFilter(e.target.value)}
        >
          <option value="">All brands</option>
          {brandSuggestions.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-wrap gap-2">
        <form
          className="flex min-w-[240px] flex-1 gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void lookupBarcode();
          }}
        >
          <input
            ref={searchRef}
            className="rs-input flex-1 font-mono text-sm"
            placeholder="Search or scan barcode / SKU…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button type="submit" className="rs-btn-secondary text-sm" disabled={saving}>
            Find
          </button>
        </form>
        <input
          className="rs-input min-w-[180px] flex-1 font-mono text-sm"
          placeholder="IMEI / serial lookup…"
          value={serialQ}
          onChange={(e) => setSerialQ(e.target.value)}
        />
      </div>

      {serialQ.trim().length >= 3 ? (
        <div className="rounded-xl p-2 text-sm" style={{ background: 'var(--rs-surface)', border: '1px solid var(--rs-border)' }}>
          {serialBusy ? (
            <p style={{ color: 'var(--rs-muted)' }}>Searching serials…</p>
          ) : serialHits.length ? (
            <ul className="space-y-1">
              {serialHits.map((h) => (
                <li key={`${h.serialNumber}-${h.productSku}`}>
                  <span className="font-mono font-semibold" style={{ color: 'var(--rs-accent)' }}>
                    {h.serialNumber}
                  </span>{' '}
                  · {h.productName} · {h.status}
                </li>
              ))}
            </ul>
          ) : (
            <p style={{ color: 'var(--rs-muted)' }}>No serial matches</p>
          )}
        </div>
      ) : null}

      {error ? (
        <p className="rounded-lg px-3 py-2 text-sm text-red-700" style={{ background: 'color-mix(in srgb, #dc2626 12%, var(--rs-surface))' }}>
          {error}
        </p>
      ) : null}
      {msg ? (
        <p className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--rs-surface-2)', color: 'var(--rs-ink)' }}>
          {msg}
        </p>
      ) : null}

      <div
        className="min-h-0 flex-1 overflow-auto rounded-xl"
        style={{ background: 'var(--rs-surface)', border: '1px solid var(--rs-border)' }}
      >
        <table className="min-w-full text-sm">
          <thead
            className="sticky top-0 text-left text-xs uppercase tracking-wide"
            style={{ background: 'var(--rs-surface-2)', color: 'var(--rs-muted)' }}
          >
            <tr>
              <th className="px-3 py-2">SKU</th>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Cat</th>
              {viewMode === 'inactive' ? <th className="px-3 py-2">Sold to</th> : null}
              <th className="px-3 py-2">GST</th>
              <th className="px-3 py-2">Sale</th>
              <th className="px-3 py-2">Cost</th>
              <th className="px-3 py-2">Margin</th>
              <th className="px-3 py-2">Stock</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => {
              const sale = num(p.salePrice);
              const purchase = num(p.purchasePrice);
              const m = marginPct(sale, purchase);
              const low = isLow(p);
              const out = num(p.stockQty) <= 0;
              return (
                <tr
                  key={p.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => void openDetail(p.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      void openDetail(p.id);
                    }
                  }}
                  className="cursor-pointer transition-colors hover:bg-black/[0.03]"
                  style={{
                    borderTop: '1px solid var(--rs-border)',
                    background: out
                      ? 'color-mix(in srgb, #dc2626 8%, transparent)'
                      : low
                        ? 'color-mix(in srgb, #ca8a04 10%, transparent)'
                        : undefined,
                  }}
                >
                  <td className="px-3 py-2 font-medium" style={{ color: 'var(--rs-ink)' }}>
                    {p.sku}
                    {p.trackSerial ? (
                      <span className="ml-1 text-[10px]" style={{ color: 'var(--rs-warn)' }}>
                        IMEI
                      </span>
                    ) : null}
                  </td>
                  <td className="px-3 py-2" style={{ color: 'var(--rs-ink)' }}>
                    <div>{p.name}</div>
                    {p.barcode ? (
                      <div className="font-mono text-[10px]" style={{ color: 'var(--rs-muted)' }}>
                        {p.barcode}
                      </div>
                    ) : null}
                  </td>
                  <td className="px-3 py-2" style={{ color: 'var(--rs-muted)' }}>
                    {p.category || '—'}
                  </td>
                  {viewMode === 'inactive' ? (
                    <td className="px-3 py-2">
                      {p.lastCustomerName || p.customerCount ? (
                        <>
                          <div className="font-medium" style={{ color: 'var(--rs-ink)' }}>
                            {p.lastCustomerName || '—'}
                          </div>
                          <div className="text-[10px]" style={{ color: 'var(--rs-muted)' }}>
                            {(p.customerCount ?? 0) > 1
                              ? `${p.customerCount} customers`
                              : p.customerCount === 1
                                ? '1 customer'
                                : 'No sales'}
                            {p.invoiceCount ? ` · ${p.invoiceCount} bill(s)` : ''}
                            {p.lastInvoiceNumber ? ` · ${p.lastInvoiceNumber}` : ''}
                          </div>
                        </>
                      ) : (
                        <span style={{ color: 'var(--rs-muted)' }}>No sales</span>
                      )}
                    </td>
                  ) : null}
                  <td className="px-3 py-2">{num(p.gstRate)}%</td>
                  <td className="px-3 py-2">₹{sale.toFixed(0)}</td>
                  <td className="px-3 py-2" style={{ color: 'var(--rs-muted)' }}>
                    {purchase > 0 ? `₹${purchase.toFixed(0)}` : '—'}
                  </td>
                  <td className="px-3 py-2">
                    {m == null ? (
                      '—'
                    ) : (
                      <span style={{ color: m < 0 ? '#b91c1c' : 'var(--rs-ink)', fontWeight: m < 0 ? 700 : 400 }}>
                        {m}%
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 font-semibold" style={{ color: out ? '#b91c1c' : low ? '#a16207' : 'var(--rs-ink)' }}>
                    {num(p.stockQty)}
                    <span className="ml-1 text-[10px] font-normal" style={{ color: 'var(--rs-muted)' }}>
                      /{num(p.lowStockThreshold ?? 5)}
                    </span>
                  </td>
                  <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                    <div className="flex flex-wrap gap-1">
                      {viewMode === 'active' ? (
                        <>
                          <button
                            type="button"
                            className="rs-btn-secondary text-xs"
                            style={{ minHeight: 28 }}
                            onClick={() => openEditForm(p)}
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="rs-btn-secondary text-xs"
                            style={{ minHeight: 28 }}
                            onClick={() =>
                              setAdjust({
                                id: p.id,
                                name: p.name,
                                stock: num(p.stockQty),
                                delta: '',
                                reason: 'Miscounted',
                              })
                            }
                          >
                            Adjust
                          </button>
                          <button
                            type="button"
                            className="text-xs font-semibold"
                            style={{ color: 'var(--rs-danger)', minHeight: 28 }}
                            onClick={() => void archiveProduct(p)}
                          >
                            Archive
                          </button>
                        </>
                      ) : (
                        <button type="button" className="rs-btn-primary text-xs" style={{ minHeight: 28 }} onClick={() => void restoreProduct(p)}>
                          Restore
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {!visible.length ? (
          <p className="p-4 text-sm" style={{ color: 'var(--rs-muted)' }}>
            No products match these filters.
          </p>
        ) : null}
      </div>

      {detailId ? (
        <div
          className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/45"
          onClick={() => {
            setDetailId(null);
            setDetail(null);
          }}
        >
          <div
            className="flex h-full w-full max-w-lg flex-col shadow-xl"
            style={{ background: 'var(--rs-surface)', borderLeft: '1px solid var(--rs-border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex shrink-0 items-center gap-2 border-b px-4 py-3"
              style={{ borderColor: 'var(--rs-border)', background: 'var(--rs-surface-2)' }}
            >
              <button
                type="button"
                className="rs-btn-secondary inline-flex shrink-0 items-center gap-1 px-2.5 py-1.5 text-xs font-semibold"
                onClick={() => {
                  setDetailId(null);
                  setDetail(null);
                }}
              >
                ← Back
              </button>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-base font-semibold" style={{ color: 'var(--rs-ink)' }}>
                  {detailLoading ? 'Loading…' : detail?.name ?? 'Product'}
                </h3>
                <p className="truncate text-xs" style={{ color: 'var(--rs-muted)' }}>
                  {[
                    detail?.sku,
                    detail?.brand,
                    detail?.category,
                    detail?.isActive === false ? 'Archived' : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              {detail && viewMode === 'active' ? (
                <button
                  type="button"
                  className="rs-btn-primary text-xs"
                  onClick={() => {
                    openEditForm(detail);
                    setDetailId(null);
                    setDetail(null);
                  }}
                >
                  Edit
                </button>
              ) : null}
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-4">
              {detailLoading ? (
                <p className="text-sm" style={{ color: 'var(--rs-muted)' }}>
                  Loading product details…
                </p>
              ) : detail ? (
                <ProductDetailBody detail={detail} />
              ) : (
                <p className="text-sm" style={{ color: 'var(--rs-danger)' }}>
                  Product not found.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {formOpen ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="product-form-title"
          onClick={closeProductForm}
        >
          <div
            className="flex max-h-[92vh] w-[80vw] max-w-[80vw] flex-col overflow-hidden rounded-2xl shadow-xl"
            style={{ background: 'var(--rs-surface)', border: '1px solid var(--rs-border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div
              className="flex shrink-0 items-center gap-2 border-b px-4 py-3"
              style={{ borderColor: 'var(--rs-border)', background: 'var(--rs-surface-2)' }}
            >
              <button
                type="button"
                className="rs-btn-secondary inline-flex shrink-0 items-center gap-1 px-2.5 py-1.5 text-xs font-semibold"
                onClick={closeProductForm}
                title="Back (Esc)"
              >
                ← Back
              </button>
              <div className="min-w-0 flex-1">
                <h3 id="product-form-title" className="truncate text-base font-semibold" style={{ color: 'var(--rs-ink)' }}>
                  {showCreate ? 'Add product' : 'Edit product'}
                </h3>
                <p className="truncate text-xs" style={{ color: 'var(--rs-muted)' }}>
                  {showCreate ? 'New catalog item' : `SKU ${edit.sku || '—'}`}
                </p>
              </div>
            </div>

            <form
              className="flex min-h-0 flex-1 flex-col"
              onSubmit={(e) => void (showCreate ? handleCreate(e) : handleSaveEdit(e))}
            >
              <div className="min-h-0 flex-1 overflow-auto p-4">
                <ProductFormFields
                  value={showCreate ? form : edit}
                  onChange={(patch) =>
                    showCreate ? setForm((f) => ({ ...f, ...patch })) : setEdit((f) => ({ ...f, ...patch }))
                  }
                  categoryOptions={categorySuggestions}
                  showSku={showCreate}
                  showStock={showCreate}
                />
              </div>
              <div
                className="flex shrink-0 justify-end gap-2 border-t px-4 py-3"
                style={{ borderColor: 'var(--rs-border)' }}
              >
                <button type="button" className="rs-btn-secondary text-sm" onClick={closeProductForm}>
                  Cancel
                </button>
                <button type="submit" className="rs-btn-primary text-sm" disabled={saving}>
                  {saving ? 'Saving…' : showCreate ? 'Create product' : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {adjust ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <div
            className="w-full max-w-sm rounded-2xl p-5 shadow-xl"
            style={{ background: 'var(--rs-surface)', border: '1px solid var(--rs-border)' }}
          >
            <h3 className="mb-1 font-bold" style={{ color: 'var(--rs-ink)' }}>
              Adjust stock
            </h3>
            <p className="mb-3 text-sm" style={{ color: 'var(--rs-muted)' }}>
              {adjust.name} · now {adjust.stock}
            </p>
            <label className="mb-2 block text-xs font-semibold" style={{ color: 'var(--rs-muted)' }}>
              Delta (+ add / − remove)
              <input
                autoFocus
                className="rs-input mt-1 text-sm"
                value={adjust.delta}
                onChange={(e) => setAdjust({ ...adjust, delta: e.target.value })}
                placeholder="e.g. -2 or 5"
              />
            </label>
            <label className="mb-3 block text-xs font-semibold" style={{ color: 'var(--rs-muted)' }}>
              Reason
              <select
                className="rs-input mt-1 text-sm"
                value={adjust.reason}
                onChange={(e) => setAdjust({ ...adjust, reason: e.target.value })}
              >
                {ADJUST_REASONS.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </label>
            <div className="mb-3 flex flex-wrap gap-1">
              {['-1', '+1', '-5', '+5'].map((d) => (
                <button
                  key={d}
                  type="button"
                  className="rs-btn-secondary text-xs"
                  style={{ minHeight: 28 }}
                  onClick={() => setAdjust({ ...adjust, delta: d })}
                >
                  {d}
                </button>
              ))}
            </div>
            <div className="flex gap-2">
              <button type="button" className="rs-btn-primary flex-1" disabled={saving} onClick={() => void submitAdjust()}>
                Apply
              </button>
              <button type="button" className="rs-btn-secondary flex-1" onClick={() => setAdjust(null)}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
