'use client';

import { AppLoader } from '@/app/_components/app-loader';
import { confirmDialog } from '@/app/_components/confirm-dialog';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Button, Card, formatINR, generateBarcodeLabelsHtml } from '@retail-sarathi/ui';
import { apiWithAuth, fmtINR } from '@/lib/helpers';
import { openPrintWindow } from '@/lib/invoice-print';
import { useShopBranding } from '@/lib/shop-branding';
import {
  EmptyState,
  MessageBanner,
  PageHeader,
  StatusBadge,
  cn,
  formatDateTime,
  inputClassName,
  pageShellClassName,
  parseError,
  selectClassName,
  tableCellClassName,
  tableHeaderClassName,
  toNumber,
} from '../_components/dashboard-ui';
import {
  ProductFormDialog,
  type ProductFormInitial,
} from '../_components/product-form-dialog';
import { ProductDetailPanel, type ProductDetail } from '../_components/product-detail-panel';
import { CategorySelect } from '../_components/category-select';
import { RowActionsMenu } from '../_components/row-actions-menu';

function ActionWithTooltip({
  tip,
  placement = 'top',
  children,
}: {
  tip: string;
  placement?: 'top' | 'bottom';
  children: ReactNode;
}) {
  return (
    <span className="group relative inline-flex w-full">
      {children}
      <span
        role="tooltip"
        className={cn(
          'pointer-events-none absolute left-1/2 z-[80] w-64 -translate-x-1/2 rounded-lg bg-slate-900 px-3 py-2 text-center text-xs font-medium leading-snug text-white opacity-0 shadow-xl transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100',
          placement === 'top' ? 'bottom-full mb-2' : 'top-full mt-2',
        )}
      >
        {tip}
      </span>
    </span>
  );
}

const CSV_COLUMNS = [
  'sku',
  'barcode',
  'name',
  'hsnCode',
  'category',
  'brand',
  'model',
  'unit',
  'salePrice',
  'purchasePrice',
  'gstRate',
  'stockQty',
  'lowStockThreshold',
  'trackSerial',
  'isActive',
] as const;

// ─── Types ────────────────────────────────────────────────────────────────────

interface Product {
  id: string;
  sku: string;
  name: string;
  barcode?: string | null;
  hsnCode: string;
  category?: string | null;
  brand?: string | null;
  model?: string | null;
  unit?: string | null;
  salePrice: number;
  purchasePrice?: number | null;
  gstRate: number;
  stockQty: number;
  lowStockThreshold: number;
  trackSerial?: boolean;
  trackBatch?: boolean;
  variantLabel?: string | null;
  parentProductId?: string | null;
  parentProduct?: { id: string; name: string } | null;
  imageUrl?: string | null;
  attachments?: unknown[] | null;
  supplierId?: string | null;
  supplierName?: string | null;
  updatedAt: string;
}

interface ProductListResponse {
  items: Product[];
  total: number;
  page: number;
  pageSize: number;
}

interface StockSummary {
  totalSkus?: number;
  totalStockQty?: number;
  byCategory?: Array<{
    category: string;
    skuCount: number;
    stockQty: number;
    stockValue: number;
    lowStockCount: number;
  }>;
  byGstSlab?: Array<{
    gstRate: number;
    skuCount: number;
    stockQty: number;
    stockValue: number;
    lowStockCount: number;
  }>;
}

interface ProductFacets {
  totalSkus?: number;
  lowStockCount?: number;
  outOfStockCount?: number;
  avgSalePrice?: number;
  brands?: string[];
  categories?: string[];
}

type StockFilter = 'all' | 'low' | 'out';

// ─── Constants ────────────────────────────────────────────────────────────────

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

type ListFilters = {
  search: string;
  category: string;
  brand: string;
  supplierId: string;
  stock: StockFilter;
  gstRate: string;
  page: number;
  pageSize: number;
};

// ─── URL helpers ──────────────────────────────────────────────────────────────

function parsePageSize(raw: string | null) {
  const n = Number(raw);
  return PAGE_SIZE_OPTIONS.includes(n as (typeof PAGE_SIZE_OPTIONS)[number]) ? n : 25;
}

function parseStock(raw: string | null): StockFilter {
  if (raw === 'low') return 'low';
  if (raw === 'out') return 'out';
  return 'all';
}

function filtersFromParams(params: URLSearchParams): ListFilters {
  return {
    search: params.get('search') ?? '',
    category: params.get('category') ?? '',
    brand: params.get('brand') ?? '',
    supplierId: params.get('supplierId') ?? '',
    stock: parseStock(params.get('filter')),
    gstRate: params.get('gstRate') ?? '',
    page: Math.max(1, Number(params.get('page')) || 1),
    pageSize: parsePageSize(params.get('pageSize')),
  };
}

function buildApiQuery(f: ListFilters) {
  const p = new URLSearchParams();
  p.set('page', String(f.page));
  p.set('pageSize', String(f.pageSize));
  if (f.search.trim()) p.set('search', f.search.trim());
  if (f.category) p.set('category', f.category);
  if (f.brand) p.set('brand', f.brand);
  if (f.supplierId) p.set('supplierId', f.supplierId);
  if (f.stock === 'low') p.set('lowStock', 'true');
  if (f.stock === 'out') p.set('outOfStock', 'true');
  if (f.gstRate) p.set('gstRate', f.gstRate);
  return p.toString();
}

function buildUrlQuery(f: ListFilters) {
  const p = new URLSearchParams();
  if (f.search.trim()) p.set('search', f.search.trim());
  if (f.category) p.set('category', f.category);
  if (f.brand) p.set('brand', f.brand);
  if (f.supplierId) p.set('supplierId', f.supplierId);
  if (f.stock !== 'all') p.set('filter', f.stock);
  if (f.gstRate) p.set('gstRate', f.gstRate);
  if (f.page > 1) p.set('page', String(f.page));
  if (f.pageSize !== 25) p.set('pageSize', String(f.pageSize));
  return p.toString();
}

function pageWindow(current: number, totalPages: number) {
  const pages: number[] = [];
  const end = Math.min(totalPages, Math.max(1, current - 2) + 4);
  for (let p = Math.max(1, end - 4); p <= end; p += 1) pages.push(p);
  return pages;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ProductsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { shopName } = useShopBranding();

  // ── Filters ──
  const [filters, setFilters] = useState<ListFilters>(() => filtersFromParams(searchParams));
  const [searchDraft, setSearchDraft] = useState(() => filtersFromParams(searchParams).search);

  // ── Data ──
  const [products, setProducts] = useState<Product[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [facets, setFacets] = useState<ProductFacets>({});
  const [stockSummary, setStockSummary] = useState<StockSummary | null>(null);
  const [categories, setCategories] = useState<string[]>([]);
  const [brands, setBrands] = useState<string[]>([]);
  const [suppliers, setSuppliers] = useState<Array<{ id: string; name: string }>>([]);

  // ── Dialog ──
  const [showCreate, setShowCreate] = useState(false);
  const [editProduct, setEditProduct] = useState<ProductFormInitial | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  // ── Stock adjust (inline) ──
  const [adjustingId, setAdjustingId] = useState<string | null>(null);
  const [adjustQty, setAdjustQty] = useState('');
  const [adjustNotes, setAdjustNotes] = useState('');
  const [adjustSaving, setAdjustSaving] = useState(false);

  // ── CSV import ──
  const [showCsvDialog, setShowCsvDialog] = useState(false);
  const [importing, setImporting] = useState(false);
  const [updateStockOnImport, setUpdateStockOnImport] = useState(true);
  const [importResult, setImportResult] = useState<{
    created: number;
    updated: number;
    stockAdjusted: number;
    errors: Array<{ row: number; sku?: string; message: string }>;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Feedback ──
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  // ─── Apply filters ─────────────────────────────────────────────────────────

  function applyFilters(next: ListFilters, opts?: { keepPage?: boolean }) {
    const normalized: ListFilters = {
      ...next,
      page: opts?.keepPage ? Math.max(1, next.page) : 1,
    };
    setFilters(normalized);
    setSearchDraft(normalized.search);
    const qs = buildUrlQuery(normalized);
    router.replace(qs ? `/dashboard/products?${qs}` : '/dashboard/products');
  }

  function goToPage(page: number) {
    applyFilters({ ...filters, page }, { keepPage: true });
  }

  // ─── Data loaders ──────────────────────────────────────────────────────────

  async function loadProducts(next = filters) {
    try {
      setLoading(true);
      setError('');
      const [listRes, summaryRes] = await Promise.all([
        apiWithAuth<ProductListResponse>(`/products?${buildApiQuery(next)}`),
        apiWithAuth<StockSummary>('/products/stock-summary').catch(() => null),
      ]);
      const matched = listRes.total ?? listRes.items.length;
      const pages = Math.max(1, Math.ceil(matched / next.pageSize));
      if (next.page > pages && pages > 0) {
        applyFilters({ ...next, page: pages }, { keepPage: true });
        return;
      }
      setProducts(listRes.items);
      setTotal(matched);
      if (summaryRes) setStockSummary(summaryRes);
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  }

  async function loadFacets() {
    try {
      const res = await apiWithAuth<ProductFacets>('/products/facets');
      setFacets(res ?? {});
      if (res?.brands?.length) setBrands(res.brands);
      if (res?.categories?.length) setCategories(res.categories);
    } catch {
      /* facets are supplementary — page still works without them */
    }
  }

  async function loadCategories() {
    try {
      const res = await apiWithAuth<Array<{ id: string; name: string }> | string[]>('/categories');
      const names: string[] = Array.isArray(res)
        ? res.map((c) => (typeof c === 'string' ? c : c.name)).filter(Boolean)
        : [];
      if (names.length) setCategories((prev) => Array.from(new Set([...prev, ...names])).sort());
    } catch {
      /* optional */
    }
  }

  async function loadSuppliers() {
    try {
      const res = await apiWithAuth<Array<{ id: string; name: string }>>('/suppliers');
      setSuppliers(res ?? []);
    } catch {
      /* optional */
    }
  }

  async function refreshAll(nextFilters = filters) {
    await Promise.all([loadProducts(nextFilters), loadFacets(), loadCategories()]);
  }

  // ─── Effects ───────────────────────────────────────────────────────────────

  useEffect(() => {
    const next = filtersFromParams(searchParams);
    setFilters(next);
    setSearchDraft(next.search);
    void loadProducts(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  useEffect(() => {
    void loadFacets();
    void loadCategories();
    void loadSuppliers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ─── KPI values ───────────────────────────────────────────────────────────

  const catalogSize = facets.totalSkus ?? stockSummary?.totalSkus ?? total;
  const lowStockCount = facets.lowStockCount ?? 0;
  const outOfStockCount = facets.outOfStockCount ?? 0;
  const avgSalePrice = facets.avgSalePrice ?? 0;

  // ─── Filter options derived from facets ───────────────────────────────────

  const filterBrands = useMemo(() => {
    const fromFacets = facets.brands ?? [];
    const fromProducts = products.flatMap((p) => (p.brand ? [p.brand] : []));
    return Array.from(new Set([...brands, ...fromFacets, ...fromProducts])).sort();
  }, [brands, facets.brands, products]);

  const filterCategories = useMemo(() => {
    const fromFacets = facets.categories ?? [];
    const fromProducts = products.flatMap((p) => (p.category ? [p.category] : []));
    return Array.from(new Set([...categories, ...fromFacets, ...fromProducts])).sort();
  }, [categories, facets.categories, products]);

  const hasActiveFilters = Boolean(
    filters.search.trim() ||
      filters.category ||
      filters.brand ||
      filters.supplierId ||
      filters.stock !== 'all' ||
      filters.gstRate && filters.gstRate !== 'all',
  );

  const filtersSummary = useMemo(() => {
    const parts: string[] = [];
    if (filters.search.trim()) parts.push(`“${filters.search.trim()}”`);
    if (filters.category) parts.push(filters.category);
    if (filters.brand) parts.push(filters.brand);
    if (filters.supplierId) {
      const name = suppliers.find((s) => s.id === filters.supplierId)?.name;
      parts.push(name || 'Supplier');
    }
    if (filters.stock === 'low') parts.push('Low stock');
    if (filters.stock === 'out') parts.push('Out of stock');
    if (filters.gstRate) parts.push(`GST ${filters.gstRate}%`);
    return parts.length ? parts.join(' · ') : 'No filters applied';
  }, [filters, suppliers]);

  // ─── Pagination ────────────────────────────────────────────────────────────

  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));
  const rangeFrom = total === 0 ? 0 : (filters.page - 1) * filters.pageSize + 1;
  const rangeTo = Math.min(total, filters.page * filters.pageSize);

  // ─── Stock adjust ─────────────────────────────────────────────────────────

  async function handleAdjustStock(productId: string) {
    try {
      if (!adjustQty || Number.isNaN(Number(adjustQty)) || toNumber(adjustQty) === 0) {
        throw new Error('Enter a non-zero stock adjustment quantity.');
      }
      const delta = toNumber(adjustQty);
      const ok = await confirmDialog.confirm({
        title: 'Adjust stock?',
        message:
          `Apply ${delta > 0 ? '+' : ''}${delta} to on-hand quantity?\n` +
          `For a wrong purchase invoice, prefer Corrections → Void bill (reverses stock + supplier payable).`,
        confirmLabel: 'Adjust stock',
        tone: delta < 0 ? 'danger' : 'default',
      });
      if (!ok) return;
      setAdjustSaving(true);
      setError('');
      await apiWithAuth(`/products/${productId}/stock`, {
        method: 'POST',
        body: JSON.stringify({
          quantity: delta,
          notes: adjustNotes.trim() || undefined,
        }),
      });
      setAdjustingId(null);
      setAdjustQty('');
      setAdjustNotes('');
      setSuccess('Stock adjusted successfully.');
      await loadProducts();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setAdjustSaving(false);
    }
  }

  // ─── Barcode label print ──────────────────────────────────────────────────

  function handlePrintLabel(product: Product) {
    const value = product.barcode?.trim() || product.sku;
    const copiesRaw = window.prompt(`Copies to print for ${product.name}:`, '1');
    if (copiesRaw === null) return;
    const copies = Math.max(1, Math.floor(Number(copiesRaw)) || 1);
    const html = generateBarcodeLabelsHtml(
      [{ value, name: product.name, price: toNumber(product.salePrice), copies }],
      { shopName },
    );
    const err = openPrintWindow(html);
    if (err) setError(err);
  }

  // ─── Remove product ───────────────────────────────────────────────────────

  async function handleRemoveProduct(product: Product) {
    if (toNumber(product.stockQty) > 0) {
      setError('Remove is only allowed when stock quantity is 0.');
      return;
    }
    const confirmed = await confirmDialog.confirm({
      title: 'Remove product',
      message: `Archive "${product.name}" from the catalog?\nStays in Archived forever with customer sales history. Past bills keep item name/SKU.`,
      confirmLabel: 'Archive',
      tone: 'danger',
    });
    if (!confirmed) return;
    try {
      setSaving(true);
      setError('');
      await apiWithAuth(`/products/${product.id}`, { method: 'DELETE' });
      setSuccess('Product removed.');
      await refreshAll();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setSaving(false);
    }
  }

  // ─── CSV helpers ──────────────────────────────────────────────────────────

  function downloadCsvBlob(filename: string, csv: string) {
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleExportCsv() {
    try {
      setError('');
      const res = await apiWithAuth<{ filename: string; csv: string }>('/products/export');
      downloadCsvBlob(res.filename, res.csv);
      setSuccess('Catalog exported as CSV.');
    } catch (err) {
      setError(parseError(err));
    }
  }

  async function handleDownloadTemplate() {
    try {
      setError('');
      const res = await apiWithAuth<{ filename: string; csv: string }>('/products/import/template');
      downloadCsvBlob(res.filename, res.csv);
      setSuccess('Template downloaded. Fill rows and import as CSV or Excel.');
    } catch (err) {
      setError(parseError(err));
    }
  }

  async function handleImportFile(file: File) {
    try {
      setImporting(true);
      setError('');
      setImportResult(null);
      setSuccess('');

      const formData = new FormData();
      formData.append('file', file);
      formData.append('updateStock', updateStockOnImport ? 'true' : 'false');
      formData.append('dryRun', 'false');

      const result = await apiWithAuth<{
        created: number;
        updated: number;
        stockAdjusted: number;
        errors: Array<{ row: number; sku?: string; message: string }>;
      }>('/products/import', { method: 'POST', body: formData });

      setImportResult(result);
      setSuccess(
        `Import done — ${result.created} created, ${result.updated} updated` +
          (result.stockAdjusted ? `, ${result.stockAdjusted} stock changes` : '') +
          (result.errors.length ? `, ${result.errors.length} row error(s)` : ''),
      );
      await refreshAll();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className={pageShellClassName}>
      <PageHeader
        title="Products & Stock"
        description="Catalog master for sellable SKUs. To receive goods with supplier invoice, barcode/SN, or PDF — use Stock-in."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/stock-in">
              <Button type="button" variant="secondary">
                Receive stock
              </Button>
            </Link>
            <Link href="/dashboard/corrections">
              <Button type="button" variant="secondary">
                Corrections
              </Button>
            </Link>
            <Button type="button" variant="secondary" onClick={() => setShowCsvDialog(true)}>
              CSV / Excel
            </Button>
            <Button type="button" onClick={() => setShowCreate(true)}>
              + Add product
            </Button>
          </div>
        }
      />

      {error ? <MessageBanner tone="error">{error}</MessageBanner> : null}
      {success ? <MessageBanner tone="success">{success}</MessageBanner> : null}

      {/* ── CSV import/export dialog ── */}
      {showCsvDialog ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-6">
          <button
            type="button"
            className="absolute inset-0 cursor-default"
            aria-label="Close"
            onClick={() => setShowCsvDialog(false)}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="csv-import-title"
            className="relative z-10 flex max-h-[min(94vh,920px)] w-[min(96vw,64rem)] flex-col overflow-hidden rounded-t-3xl border border-slate-200/80 bg-white shadow-2xl sm:rounded-3xl"
          >
            <div className="relative shrink-0 overflow-hidden border-b border-teal-100/80 bg-gradient-to-br from-teal-50 via-white to-amber-50/40 px-5 py-6 sm:px-8">
              <div
                className="pointer-events-none absolute -right-16 -top-20 h-56 w-56 rounded-full bg-teal-200/30 blur-3xl"
                aria-hidden
              />
              <div
                className="pointer-events-none absolute -bottom-24 left-1/3 h-40 w-40 rounded-full bg-amber-200/25 blur-3xl"
                aria-hidden
              />
              <div className="relative flex items-start gap-4">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-teal-600 text-white shadow-lg shadow-teal-600/25">
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8">
                    <path d="M8 4h7l3 3v13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
                    <path d="M15 4v3h3M9 12h6M9 16h4" strokeLinecap="round" />
                  </svg>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-teal-700/80">
                    Bulk catalog tools
                  </p>
                  <h2 id="csv-import-title" className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
                    Update by CSV / Excel
                  </h2>
                  <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-600">
                    Match rows by <span className="font-semibold text-slate-800">sku</span>. Existing products
                    update in place; new SKUs are created. Works with{' '}
                    <span className="rounded-md bg-white/80 px-1.5 py-0.5 font-mono text-[11px] text-slate-700 ring-1 ring-slate-200">
                      .csv
                    </span>{' '}
                    <span className="rounded-md bg-white/80 px-1.5 py-0.5 font-mono text-[11px] text-slate-700 ring-1 ring-slate-200">
                      .xlsx
                    </span>{' '}
                    <span className="rounded-md bg-white/80 px-1.5 py-0.5 font-mono text-[11px] text-slate-700 ring-1 ring-slate-200">
                      .xls
                    </span>
                  </p>
                </div>
                <Button type="button" size="sm" variant="secondary" onClick={() => setShowCsvDialog(false)}>
                  Close
                </Button>
              </div>
            </div>

            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-6 sm:px-8">
              <div>
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-slate-900">Choose an action</h3>
                  <p className="text-xs text-slate-500">Hover a card for details</p>
                </div>
                <div className="grid gap-3 md:grid-cols-3">
                  <ActionWithTooltip
                    placement="bottom"
                    tip="Download a blank sample file with the correct column headers. Fill in your product rows, then use Import file."
                  >
                    <button
                      type="button"
                      onClick={() => void handleDownloadTemplate()}
                      className="group/card flex h-full w-full flex-col rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-left transition hover:-translate-y-0.5 hover:border-teal-300 hover:bg-white hover:shadow-md"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-teal-700 shadow-sm ring-1 ring-slate-200">
                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M12 4v10m0 0 3.5-3.5M12 14 8.5 10.5M6 18h12" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                      <span className="mt-3 text-sm font-semibold text-slate-900">Download template</span>
                      <span className="mt-1 text-xs leading-relaxed text-slate-500">
                        Blank file with correct headers — start from scratch.
                      </span>
                    </button>
                  </ActionWithTooltip>

                  <ActionWithTooltip
                    placement="bottom"
                    tip="Download your live product catalog as CSV. Edit prices, stock, or details offline, then re-import to update."
                  >
                    <button
                      type="button"
                      onClick={() => void handleExportCsv()}
                      className="group/card flex h-full w-full flex-col rounded-2xl border border-slate-200 bg-slate-50/80 p-4 text-left transition hover:-translate-y-0.5 hover:border-teal-300 hover:bg-white hover:shadow-md"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white text-slate-700 shadow-sm ring-1 ring-slate-200">
                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2M12 4v12m0 0 4-4m-4 4-4-4" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                      <span className="mt-3 text-sm font-semibold text-slate-900">Export current catalog</span>
                      <span className="mt-1 text-xs leading-relaxed text-slate-500">
                        Pull live products, edit offline, then re-upload.
                      </span>
                    </button>
                  </ActionWithTooltip>

                  <ActionWithTooltip
                    placement="bottom"
                    tip="Choose a filled CSV or Excel file from your computer. Rows match on sku — updates existing products and creates new SKUs."
                  >
                    <button
                      type="button"
                      disabled={importing}
                      onClick={() => fileInputRef.current?.click()}
                      className="group/card flex h-full w-full flex-col rounded-2xl border border-teal-600/20 bg-gradient-to-br from-teal-600 to-teal-800 p-4 text-left text-white shadow-lg shadow-teal-700/20 transition hover:-translate-y-0.5 hover:from-teal-500 hover:to-teal-700 disabled:cursor-not-allowed disabled:opacity-70"
                    >
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15 text-white ring-1 ring-white/25">
                        <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                          <path d="M12 16V6m0 0 3.5 3.5M12 6 8.5 9.5M6 18h12" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </span>
                      <span className="mt-3 text-sm font-semibold">
                        {importing ? 'Importing…' : 'Import file'}
                      </span>
                      <span className="mt-1 text-xs leading-relaxed text-teal-50/90">
                        Upload filled CSV/Excel — match & sync by sku.
                      </span>
                    </button>
                  </ActionWithTooltip>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.txt,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void handleImportFile(file);
                  }}
                />
              </div>

              <button
                type="button"
                onClick={() => setUpdateStockOnImport((v) => !v)}
                className={cn(
                  'flex w-full items-start gap-3 rounded-2xl border px-4 py-3.5 text-left transition',
                  updateStockOnImport
                    ? 'border-teal-300 bg-teal-50/70 ring-1 ring-teal-100'
                    : 'border-slate-200 bg-white hover:border-slate-300',
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition',
                    updateStockOnImport
                      ? 'border-teal-600 bg-teal-600 text-white'
                      : 'border-slate-300 bg-white text-transparent',
                  )}
                  aria-hidden
                >
                  <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <path d="M3.5 8.5 6.5 11.5 12.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-900">
                    Also update stock quantities from the file
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">
                    Writes stock ledger entries when <span className="font-mono">stockQty</span> is present.
                    Turn off to update prices/details only.
                  </span>
                </span>
              </button>

              <div className="rounded-2xl border border-slate-200 bg-slate-50/60 p-4">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Supported columns</p>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {CSV_COLUMNS.map((col) => (
                    <span
                      key={col}
                      className={cn(
                        'rounded-lg px-2 py-1 font-mono text-[11px] ring-1',
                        col === 'sku'
                          ? 'bg-teal-600 text-white ring-teal-700'
                          : 'bg-white text-slate-600 ring-slate-200',
                      )}
                    >
                      {col}
                    </span>
                  ))}
                </div>
              </div>

              {importResult ? (
                <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                  <p className="text-sm font-semibold text-slate-900">Last import summary</p>
                  <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <div className="rounded-xl bg-teal-50 px-3 py-2.5">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-teal-700/80">Created</p>
                      <p className="mt-0.5 text-xl font-semibold text-teal-800">{importResult.created}</p>
                    </div>
                    <div className="rounded-xl bg-slate-50 px-3 py-2.5">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Updated</p>
                      <p className="mt-0.5 text-xl font-semibold text-slate-800">{importResult.updated}</p>
                    </div>
                    <div className="rounded-xl bg-amber-50 px-3 py-2.5">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-amber-700/80">Stock</p>
                      <p className="mt-0.5 text-xl font-semibold text-amber-800">{importResult.stockAdjusted}</p>
                    </div>
                    <div className="rounded-xl bg-rose-50 px-3 py-2.5">
                      <p className="text-[11px] font-medium uppercase tracking-wide text-rose-700/80">Errors</p>
                      <p className="mt-0.5 text-xl font-semibold text-rose-800">{importResult.errors.length}</p>
                    </div>
                  </div>
                </div>
              ) : null}

              {importResult?.errors?.length ? (
                <div className="max-h-52 overflow-auto rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-sm text-amber-950">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-amber-800">Row errors</p>
                  {importResult.errors.slice(0, 12).map((e, i) => (
                    <p key={`${e.row}-${i}`} className="border-t border-amber-200/70 py-1.5 first:border-t-0 first:pt-0">
                      Row {e.row}
                      {e.sku ? ` (${e.sku})` : ''}: {e.message}
                    </p>
                  ))}
                  {importResult.errors.length > 12 ? (
                    <p className="pt-1 text-amber-800">…and {importResult.errors.length - 12} more</p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* ── KPI cards ── */}
      <section className="grid gap-4 md:grid-cols-4">
        <button
          type="button"
          onClick={() => applyFilters({ ...filters, stock: 'all', search: searchDraft })}
          className={cn(
            'rounded-2xl border bg-white p-5 text-left transition',
            filters.stock === 'all' && !hasActiveFilters
              ? 'border-teal-300 ring-2 ring-teal-100'
              : 'border-slate-200 hover:border-teal-200',
          )}
        >
          <p className="text-sm font-medium text-slate-500">Catalog size</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{catalogSize || total}</p>
        </button>
        <button
          type="button"
          onClick={() =>
            applyFilters({
              ...filters,
              stock: filters.stock === 'low' ? 'all' : 'low',
              search: searchDraft,
            })
          }
          className={cn(
            'rounded-2xl border bg-white p-5 text-left transition',
            filters.stock === 'low'
              ? 'border-amber-300 ring-2 ring-amber-100'
              : 'border-slate-200 hover:border-amber-200',
          )}
        >
          <p className="text-sm font-medium text-slate-500">Low stock items</p>
          <p className="mt-2 text-3xl font-semibold text-amber-600">{lowStockCount}</p>
        </button>
        <button
          type="button"
          onClick={() =>
            applyFilters({
              ...filters,
              stock: filters.stock === 'out' ? 'all' : 'out',
              search: searchDraft,
            })
          }
          className={cn(
            'rounded-2xl border bg-white p-5 text-left transition',
            filters.stock === 'out'
              ? 'border-rose-300 ring-2 ring-rose-100'
              : 'border-slate-200 hover:border-rose-200',
          )}
        >
          <p className="text-sm font-medium text-slate-500">Out of stock</p>
          <p className="mt-2 text-3xl font-semibold text-rose-600">{outOfStockCount}</p>
        </button>
        <Card className="border-slate-200">
          <p className="text-sm font-medium text-slate-500">Avg. selling price</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{fmtINR(avgSalePrice)}</p>
        </Card>
      </section>

      {/* ── Distribution boards ── */}
      {(stockSummary?.byGstSlab?.length || stockSummary?.byCategory?.length) ? (
        <div className="grid gap-4 md:grid-cols-2">
          {stockSummary?.byGstSlab?.length ? (
            <Card className="border-slate-200">
              <h3 className="mb-3 text-sm font-semibold text-slate-700">Stock by GST slab</h3>
              <div className="flex flex-wrap gap-2">
                {stockSummary.byGstSlab.map((row) => (
                  <button
                    key={row.gstRate}
                    type="button"
                    onClick={() => {
                      const value = String(row.gstRate);
                      applyFilters({
                        ...filters,
                        search: searchDraft,
                        gstRate: filters.gstRate === value ? '' : value,
                      });
                    }}
                    className={cn(
                      'rounded-xl border px-3 py-1.5 text-xs font-medium transition',
                      filters.gstRate === String(row.gstRate)
                        ? 'border-teal-400 bg-teal-50 text-teal-900'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-teal-300 hover:bg-teal-50/50',
                    )}
                  >
                    GST {row.gstRate}% · {row.skuCount} SKUs
                  </button>
                ))}
              </div>
            </Card>
          ) : null}
          {stockSummary?.byCategory?.length ? (
            <Card className="border-slate-200">
              <h3 className="mb-3 text-sm font-semibold text-slate-700">Stock by category</h3>
              <div className="flex flex-wrap gap-2">
                {stockSummary.byCategory.map((row) => (
                  <button
                    key={row.category}
                    type="button"
                    onClick={() => {
                      if (row.category === 'Uncategorized') return;
                      applyFilters({
                        ...filters,
                        search: searchDraft,
                        category: filters.category === row.category ? '' : row.category,
                      });
                    }}
                    className={cn(
                      'rounded-xl border px-3 py-1.5 text-xs font-medium transition',
                      filters.category === row.category
                        ? 'border-teal-400 bg-teal-50 text-teal-900'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-teal-300 hover:bg-teal-50/50',
                    )}
                  >
                    {row.category} · {row.skuCount} SKUs
                  </button>
                ))}
              </div>
            </Card>
          ) : null}
        </div>
      ) : null}

      {/* ── Catalog card ── */}
      <Card className="border-slate-200">
        {/* Catalog header with rows selector */}
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Catalog</h2>
            <p className="text-sm text-slate-500">
              Filter by supplier, category, brand, or stock status. Supplier is taken from the
              latest purchase bill.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-slate-700">
              <span className="whitespace-nowrap">Rows</span>
              <select
                className={`${selectClassName} min-h-9 w-auto py-2`}
                value={filters.pageSize}
                onChange={(e) =>
                  applyFilters({ ...filters, search: searchDraft, pageSize: Number(e.target.value) })
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

        {/* Filters panel */}
        <div className="mb-5 overflow-hidden rounded-xl border border-slate-200 bg-slate-50/80">
          <button
            type="button"
            className="flex w-full items-center gap-2 px-4 py-2.5 text-left"
            onClick={() => setFiltersOpen((o) => !o)}
            aria-expanded={filtersOpen}
          >
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Filters
            </span>
            {!filtersOpen ? (
              <span className="truncate text-xs font-medium text-slate-700">{filtersSummary}</span>
            ) : null}
            {hasActiveFilters && filtersOpen ? (
              <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-800">
                Active
              </span>
            ) : null}
            <span className="ml-auto shrink-0 text-slate-400" aria-hidden>
              {filtersOpen ? '▾' : '▸'}
            </span>
          </button>

          {filtersOpen ? (
            <div className="border-t border-slate-200 px-4 py-4">
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                <label className="space-y-1 text-sm font-medium text-slate-700 sm:col-span-2 xl:col-span-3">
                  <span>Search</span>
                  <input
                    className={inputClassName}
                    placeholder="Name, SKU, barcode, HSN, brand…"
                    value={searchDraft}
                    onChange={(e) => setSearchDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        applyFilters({ ...filters, search: searchDraft });
                      }
                    }}
                  />
                </label>
                <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <span>Category</span>
                  <CategorySelect
                    mode="filter"
                    value={filters.category}
                    categories={filterCategories}
                    onChange={(category) =>
                      applyFilters({ ...filters, search: searchDraft, category })
                    }
                  />
                </label>
                <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <span>Brand</span>
                  <select
                    className={selectClassName}
                    value={filters.brand}
                    onChange={(e) =>
                      applyFilters({ ...filters, search: searchDraft, brand: e.target.value })
                    }
                  >
                    <option value="">All brands</option>
                    {filterBrands.map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <span>Supplier</span>
                  <select
                    className={selectClassName}
                    value={filters.supplierId}
                    onChange={(e) =>
                      applyFilters({ ...filters, search: searchDraft, supplierId: e.target.value })
                    }
                  >
                    <option value="">All suppliers</option>
                    {suppliers.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <span>Stock status</span>
                  <select
                    className={selectClassName}
                    value={filters.stock}
                    onChange={(e) =>
                      applyFilters({
                        ...filters,
                        search: searchDraft,
                        stock: e.target.value as StockFilter,
                      })
                    }
                  >
                    <option value="all">All products</option>
                    <option value="low">Low stock only</option>
                    <option value="out">Out of stock</option>
                  </select>
                </label>
                <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                  <span>GST slab</span>
                  <select
                    className={selectClassName}
                    value={filters.gstRate}
                    onChange={(e) =>
                      applyFilters({ ...filters, search: searchDraft, gstRate: e.target.value })
                    }
                  >
                    <option value="">All slabs</option>
                    {['0', '5', '12', '18', '28'].map((r) => (
                      <option key={r} value={r}>
                        {r}%
                      </option>
                    ))}
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
                  disabled={!hasActiveFilters}
                  onClick={() =>
                    applyFilters({
                      search: '',
                      category: '',
                      brand: '',
                      supplierId: '',
                      stock: 'all',
                      gstRate: '',
                      page: 1,
                      pageSize: filters.pageSize,
                    })
                  }
                >
                  Clear
                </Button>
              </div>
            </div>
          ) : null}
        </div>

        {/* GST chip bar */}
        <div className="mb-4 flex flex-wrap gap-2">
          {['all', 'low', 'out'].map((s) => (
            <Button
              key={s}
              type="button"
              size="sm"
              variant={filters.stock === s && !filters.gstRate ? 'primary' : 'secondary'}
              onClick={() => {
                const next = s as StockFilter;
                applyFilters({
                  ...filters,
                  search: searchDraft,
                  stock: filters.stock === next ? 'all' : next,
                });
              }}
            >
              {s === 'all' ? 'All products' : s === 'low' ? 'Low stock' : 'Out of stock'}
            </Button>
          ))}
        </div>

        {/* Table */}
        <div className="mt-2 overflow-x-auto">
          {loading ? (
            <AppLoader label="Loading products…" />
          ) : !products.length ? (
            <EmptyState
              title={
                filters.stock === 'low'
                  ? 'No low-stock products'
                  : filters.stock === 'out'
                    ? 'No out-of-stock products'
                    : 'No products found'
              }
              description={
                hasActiveFilters
                  ? 'Try clearing filters or broadening the search.'
                  : 'Add your first product using the "+ Add product" button above.'
              }
            />
          ) : (
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className={tableHeaderClassName}>Product</th>
                  <th className={tableHeaderClassName}>Supplier</th>
                  <th className={tableHeaderClassName}>Pricing</th>
                  <th className={tableHeaderClassName}>Stock</th>
                  <th className={tableHeaderClassName}>Last updated</th>
                  <th className={cn(tableHeaderClassName, 'text-right')}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {products.map((product) => {
                  const isLowStock =
                    toNumber(product.stockQty) > 0 &&
                    toNumber(product.stockQty) <= toNumber(product.lowStockThreshold);
                  const isOut = toNumber(product.stockQty) <= 0;
                  const isAdjusting = adjustingId === product.id;

                  return (
                    <tr
                      key={product.id}
                      className={cn(
                        'transition',
                        isOut
                          ? 'bg-rose-50/40 hover:bg-rose-50'
                          : isLowStock
                            ? 'bg-amber-50/60 hover:bg-amber-50'
                            : 'hover:bg-slate-50',
                      )}
                    >
                      {/* Product info */}
                      <td className={tableCellClassName}>
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              className="text-left font-semibold text-teal-800 hover:text-teal-950 hover:underline"
                              onClick={() => setDetailId(product.id)}
                            >
                              {product.name}
                            </button>
                            {isOut ? (
                              <StatusBadge status="OUT" />
                            ) : isLowStock ? (
                              <StatusBadge status="LOW" />
                            ) : null}
                          </div>
                          <p className="text-xs text-slate-500">
                            SKU:{' '}
                            <span className="font-mono">{product.sku}</span>
                          </p>
                          {product.parentProduct ? (
                            <p className="text-xs text-violet-700">
                              ↳ Variant of {product.parentProduct.name}
                              {product.variantLabel ? ` (${product.variantLabel})` : ''}
                            </p>
                          ) : null}
                          {product.barcode ? (
                            <p className="text-xs text-slate-500">
                              Barcode:{' '}
                              <span className="font-mono">{product.barcode}</span>
                            </p>
                          ) : null}
                          <p className="text-xs text-slate-500">HSN: {product.hsnCode}</p>
                          {product.category || product.brand ? (
                            <p className="text-xs text-slate-500">
                              {[product.category, product.brand].filter(Boolean).join(' · ')}
                            </p>
                          ) : null}
                          {product.model ? (
                            <p className="text-xs text-slate-500">{product.model}</p>
                          ) : null}
                        </div>
                      </td>

                      {/* Supplier */}
                      <td className={tableCellClassName}>
                        {product.supplierName ? (
                          product.supplierId ? (
                            <Link
                              href={`/dashboard/suppliers/${product.supplierId}`}
                              className="text-sm font-medium text-teal-700 hover:text-teal-900 hover:underline"
                            >
                              {product.supplierName}
                            </Link>
                          ) : (
                            <span className="text-sm font-medium text-slate-800">
                              {product.supplierName}
                            </span>
                          )
                        ) : (
                          <span className="text-sm text-slate-400">—</span>
                        )}
                        <p className="mt-1 text-xs text-slate-500">From latest purchase</p>
                      </td>

                      {/* Pricing */}
                      <td className={tableCellClassName}>
                        <div className="space-y-1">
                          <p className="font-medium text-slate-900">
                            {formatINR(toNumber(product.salePrice))}
                          </p>
                          {product.purchasePrice != null && toNumber(product.purchasePrice) > 0 ? (
                            <p className="text-xs text-slate-500">
                              Cost: {fmtINR(toNumber(product.purchasePrice))}
                            </p>
                          ) : null}
                          <p className="text-xs text-slate-500">GST {toNumber(product.gstRate)}%</p>
                          {product.unit ? (
                            <p className="text-xs text-slate-500">Unit: {product.unit}</p>
                          ) : null}
                        </div>
                      </td>

                      {/* Stock + inline adjust */}
                      <td className={tableCellClassName}>
                        <div className="space-y-2">
                          <p
                            className={cn(
                              'text-sm font-semibold',
                              isOut
                                ? 'text-rose-700'
                                : isLowStock
                                  ? 'text-amber-700'
                                  : 'text-slate-900',
                            )}
                          >
                            {toNumber(product.stockQty)}{' '}
                            {product.unit ? (
                              <span className="font-normal text-slate-500">{product.unit}</span>
                            ) : null}
                          </p>
                          <p className="text-xs text-slate-500">
                            Threshold: {toNumber(product.lowStockThreshold)}
                          </p>
                          {isAdjusting ? (
                            <div className="space-y-2 rounded-2xl border border-slate-200 bg-white p-3">
                              <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                                <span>Adjust by</span>
                                <input
                                  className={inputClassName}
                                  type="number"
                                  step="0.001"
                                  value={adjustQty}
                                  onChange={(e) => setAdjustQty(e.target.value)}
                                />
                              </label>
                              <label className="space-y-1 text-xs font-medium uppercase tracking-wide text-slate-500">
                                <span>Notes</span>
                                <input
                                  className={inputClassName}
                                  value={adjustNotes}
                                  onChange={(e) => setAdjustNotes(e.target.value)}
                                />
                              </label>
                              <div className="flex flex-wrap gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  onClick={() => void handleAdjustStock(product.id)}
                                  disabled={adjustSaving}
                                >
                                  Post adjustment
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  onClick={() => {
                                    setAdjustingId(null);
                                    setAdjustQty('');
                                    setAdjustNotes('');
                                  }}
                                >
                                  Cancel
                                </Button>
                              </div>
                            </div>
                          ) : null}
                        </div>
                      </td>

                      {/* Updated at */}
                      <td className={tableCellClassName}>
                        <p className="whitespace-nowrap text-sm text-slate-600">
                          {formatDateTime(product.updatedAt)}
                        </p>
                      </td>

                      {/* Actions */}
                      <td className={cn(tableCellClassName, 'text-right')}>
                        <div className="flex justify-end">
                          <RowActionsMenu
                            actions={[
                              {
                                key: 'edit',
                                label: 'Edit',
                                onClick: () => {
                                  setEditProduct({
                                    id: product.id,
                                    sku: product.sku,
                                    name: product.name,
                                    barcode: product.barcode,
                                    hsnCode: product.hsnCode,
                                    category: product.category,
                                    brand: product.brand,
                                    model: product.model,
                                    unit: product.unit,
                                    salePrice: product.salePrice,
                                    purchasePrice: product.purchasePrice,
                                    gstRate: product.gstRate,
                                    stockQty: product.stockQty,
                                    lowStockThreshold: product.lowStockThreshold,
                                    trackSerial: product.trackSerial,
                                    imageUrl: product.imageUrl,
                                    attachments: Array.isArray(product.attachments)
                                      ? (product.attachments as ProductFormInitial['attachments'])
                                      : [],
                                  });
                                },
                              },
                              {
                                key: 'print-label',
                                label: 'Print label',
                                onClick: () => handlePrintLabel(product),
                              },
                              {
                                key: 'adjust',
                                label: isAdjusting ? 'Hide adjust form' : 'Adjust stock',
                                onClick: () => {
                                  setAdjustingId(isAdjusting ? null : product.id);
                                  setAdjustQty('');
                                  setAdjustNotes('');
                                },
                              },
                              {
                                key: 'remove',
                                label: 'Remove',
                                tone: 'danger',
                                hidden: toNumber(product.stockQty) > 0,
                                disabled: saving,
                                onClick: () => void handleRemoveProduct(product),
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
          )}
        </div>

        {/* Pagination footer */}
        {!loading && total > 0 ? (
          <div className="mt-4 flex flex-col gap-3 border-t border-slate-100 pt-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-slate-500">
              Showing{' '}
              <span className="font-medium text-slate-800">{rangeFrom}</span>–
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

      <ProductDetailPanel
        productId={detailId}
        onClose={() => setDetailId(null)}
        onEdit={(detail: ProductDetail) => {
          setEditProduct({
            id: detail.id,
            sku: detail.sku,
            name: detail.name,
            barcode: detail.barcode,
            hsnCode: detail.hsnCode ?? '',
            category: detail.category,
            brand: detail.brand,
            model: detail.model,
            unit: detail.unit,
            salePrice: toNumber(detail.salePrice),
            purchasePrice: detail.purchasePrice != null ? toNumber(detail.purchasePrice) : undefined,
            gstRate: toNumber(detail.gstRate),
            stockQty: toNumber(detail.stockQty),
            lowStockThreshold: toNumber(detail.lowStockThreshold ?? 5),
            trackSerial: detail.trackSerial,
          });
        }}
      />

      {/* ── Create dialog ── */}
      <ProductFormDialog
        open={showCreate}
        mode="create"
        categories={filterCategories}
        brands={filterBrands}
        onClose={() => setShowCreate(false)}
        onCategoryAdded={(name) =>
          setCategories((prev) => Array.from(new Set([...prev, name])).sort())
        }
        onSaved={async () => {
          setShowCreate(false);
          await refreshAll();
        }}
      />

      {/* ── Edit dialog ── */}
      <ProductFormDialog
        open={editProduct !== null}
        mode="edit"
        initial={editProduct}
        categories={filterCategories}
        brands={filterBrands}
        onClose={() => setEditProduct(null)}
        onCategoryAdded={(name) =>
          setCategories((prev) => Array.from(new Set([...prev, name])).sort())
        }
        onSaved={async () => {
          setEditProduct(null);
          await refreshAll();
        }}
      />
    </div>
  );
}
