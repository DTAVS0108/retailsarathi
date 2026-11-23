'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { Button, Card, formatINR } from '@retail-sarathi/ui';
import { confirmDialog } from '@/app/_components/confirm-dialog';
import { apiWithAuth, fmtINR } from '@/lib/helpers';
import {
  MessageBanner,
  PageHeader,
  cn,
  formatDate,
  inputClassName,
  pageShellClassName,
  parseError,
  toNumber,
} from '../_components/dashboard-ui';
import { ProductDetailPanel } from '../_components/product-detail-panel';

type Tab = 'bills' | 'suppliers' | 'products';

type PurchaseBill = {
  id: string;
  invoiceNumber: string;
  invoiceDate?: string | null;
  supplierName?: string | null;
  supplier?: { id: string; name: string } | null;
  totalAmount: number | string;
  paidAmount: number | string;
  status: string;
  createdAt: string;
  _count?: { lines: number; allocations: number };
  lines?: Array<{ productName: string; quantity: number | string; sku?: string | null }>;
};

type SupplierRow = {
  id: string;
  name: string;
  gstin?: string | null;
  phone?: string | null;
  isActive: boolean;
  outstandingBalance: number | string;
  summary?: {
    billCount: number;
    openBillCount: number;
    pendingPayable: number;
  };
};

type InactiveProduct = {
  id: string;
  sku: string;
  name: string;
  stockQty: number | string;
  updatedAt: string;
  category?: string | null;
  brand?: string | null;
  soldQty?: number;
  invoiceCount?: number;
  customerCount?: number;
  lastSoldAt?: string | null;
  lastInvoiceNumber?: string | null;
  lastCustomerName?: string | null;
  buyers?: Array<{ id: string; name: string; phone?: string | null; times: number }>;
};

export default function CorrectionsPage() {
  const [tab, setTab] = useState<Tab>('bills');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);

  const [bills, setBills] = useState<PurchaseBill[]>([]);
  const [voidReason, setVoidReason] = useState('Mistaken stock-in / wrong invoice');
  const [suppliers, setSuppliers] = useState<SupplierRow[]>([]);
  const [products, setProducts] = useState<InactiveProduct[]>([]);
  const [search, setSearch] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);

  const loadBills = useCallback(async () => {
    const data = await apiWithAuth<{ items: PurchaseBill[] } | PurchaseBill[]>(
      '/purchase-bills?includeCancelled=true',
    );
    setBills(Array.isArray(data) ? data : data?.items ?? []);
  }, []);

  const loadSuppliers = useCallback(async () => {
    const data = await apiWithAuth<SupplierRow[]>('/suppliers?includeArchived=true');
    setSuppliers(data ?? []);
  }, []);

  const loadProducts = useCallback(async () => {
    const data = await apiWithAuth<InactiveProduct[]>('/products/inactive');
    setProducts(data ?? []);
  }, []);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      if (tab === 'bills') await loadBills();
      else if (tab === 'suppliers') await loadSuppliers();
      else await loadProducts();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  }, [tab, loadBills, loadSuppliers, loadProducts]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function voidBill(bill: PurchaseBill) {
    const ok = await confirmDialog.confirm({
      title: 'Void purchase bill?',
      message:
        `This reverses stock for "${bill.invoiceNumber}" and reduces supplier payable.\n` +
        `Payments must already be cleared. Ledgers stay (append-only).\n\nContinue?`,
      confirmLabel: 'Void bill',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      setError('');
      setSuccess('');
      await apiWithAuth(`/purchase-bills/${bill.id}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason: voidReason.trim() || undefined }),
      });
      setSuccess(`Voided bill ${bill.invoiceNumber}. Stock and payable reversed.`);
      await loadBills();
    } catch (err) {
      setError(parseError(err));
    }
  }

  async function archiveSupplier(s: SupplierRow) {
    const ok = await confirmDialog.confirm({
      title: 'Archive supplier?',
      message: `"${s.name}" will hide from pickers. History stays. Only allowed with zero open bills and zero balance.`,
      confirmLabel: 'Archive',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      setError('');
      setSuccess('');
      await apiWithAuth(`/suppliers/${s.id}/archive`, { method: 'POST', body: '{}' });
      setSuccess(`Archived ${s.name}.`);
      await loadSuppliers();
    } catch (err) {
      setError(parseError(err));
    }
  }

  async function restoreSupplier(s: SupplierRow) {
    try {
      setError('');
      setSuccess('');
      await apiWithAuth(`/suppliers/${s.id}/restore`, { method: 'POST', body: '{}' });
      setSuccess(`Restored ${s.name}.`);
      await loadSuppliers();
    } catch (err) {
      setError(parseError(err));
    }
  }

  async function restoreProduct(p: InactiveProduct) {
    try {
      setError('');
      setSuccess('');
      await apiWithAuth(`/products/${p.id}/restore`, { method: 'POST', body: '{}' });
      setSuccess(`Restored ${p.name} (${p.sku}) to catalog.`);
      await loadProducts();
    } catch (err) {
      setError(parseError(err));
    }
  }

  const q = search.trim().toLowerCase();
  const matches = (text: string) => !q || text.toLowerCase().includes(q);

  const activeBills = bills.filter(
    (b) =>
      b.status !== 'CANCELLED' &&
      matches(`${b.invoiceNumber} ${b.supplierName || ''} ${b.supplier?.name || ''}`),
  );
  const voidedBills = bills.filter(
    (b) =>
      b.status === 'CANCELLED' &&
      matches(`${b.invoiceNumber} ${b.supplierName || ''} ${b.supplier?.name || ''}`),
  );
  const activeSuppliers = suppliers.filter(
    (s) => s.isActive !== false && matches(`${s.name} ${s.gstin || ''} ${s.phone || ''}`),
  );
  const archivedSuppliers = suppliers.filter(
    (s) => s.isActive === false && matches(`${s.name} ${s.gstin || ''} ${s.phone || ''}`),
  );
  const filteredProducts = products.filter((p) =>
    matches(`${p.name} ${p.sku} ${p.category || ''} ${p.brand || ''}`),
  );

  return (
    <div className={pageShellClassName}>
      <PageHeader
        title="Corrections & cleanup"
        description="Undo mistaken stock-in, archive unused suppliers, restore removed products. Prefer voiding bills over silent stock adjusts. Ledgers stay append-only."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/purchase-orders">
              <Button type="button" variant="secondary">
                Purchase orders
              </Button>
            </Link>
            <Link href="/dashboard/stock-take">
              <Button type="button" variant="secondary">
                Stock take
              </Button>
            </Link>
            <Link href="/dashboard/purchase-bills">
              <Button type="button" variant="secondary">
                Purchase bills
              </Button>
            </Link>
            <Button type="button" variant="secondary" onClick={() => void refresh()}>
              Refresh
            </Button>
          </div>
        }
      />

      {error ? <MessageBanner tone="error">{error}</MessageBanner> : null}
      {success ? <MessageBanner tone="success">{success}</MessageBanner> : null}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="border-slate-200 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Active bills</p>
          <p className="mt-1 text-2xl font-semibold">{bills.filter((b) => b.status !== 'CANCELLED').length}</p>
        </Card>
        <Card className="border-slate-200 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Archived suppliers</p>
          <p className="mt-1 text-2xl font-semibold">{suppliers.filter((s) => !s.isActive).length}</p>
        </Card>
        <Card className="border-slate-200 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Removed products</p>
          <p className="mt-1 text-2xl font-semibold">{products.length}</p>
        </Card>
      </div>

      <Card className="border-slate-200">
        <div className="flex flex-wrap gap-2">
          {(
            [
              { id: 'bills' as const, label: 'Purchase bills' },
              { id: 'suppliers' as const, label: 'Suppliers' },
              { id: 'products' as const, label: 'Removed products' },
            ] as const
          ).map((t) => (
            <Button
              key={t.id}
              type="button"
              size="sm"
              variant={tab === t.id ? 'primary' : 'secondary'}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </Button>
          ))}
        </div>
        <div className="mt-3">
          <input
            className={inputClassName}
            placeholder={
              tab === 'bills'
                ? 'Search invoice # or supplier…'
                : tab === 'suppliers'
                  ? 'Search supplier, GSTIN, phone…'
                  : 'Search SKU or product name…'
            }
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {tab === 'bills' ? (
            <p>
              <strong>Void</strong> reverses on-hand stock and unpaid supplier balance for that bill.
              Blocked if any payment is linked — clear payments on the supplier page first. Prefer this over
              manual stock adjust.
            </p>
          ) : null}
          {tab === 'suppliers' ? (
            <p>
              <strong>Archive</strong> hides a supplier from pickers when balance is ₹0 and no open bills.
              History stays. Stock-in can still match GSTIN/name and revive them.
            </p>
          ) : null}
          {tab === 'products' ? (
            <p>
              Products removed from the catalog (stock must be 0) appear here and are kept forever with
              sales/customer history. <strong>Restore</strong> brings them back with the same SKU.
            </p>
          ) : null}
        </div>
      </Card>

      {loading ? <p className="text-sm text-slate-500">Loading…</p> : null}

      {tab === 'bills' && !loading ? (
        <div className="space-y-4">
          <Card className="border-slate-200">
            <label className="block space-y-1 text-sm font-medium text-slate-700">
              <span>Void reason (saved on bill notes)</span>
              <input
                className={inputClassName}
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="Why are you voiding?"
              />
            </label>
          </Card>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Active bills ({activeBills.length})
            </h2>
            {!activeBills.length ? (
              <Card className="border-slate-200 text-sm text-slate-500">No active purchase bills.</Card>
            ) : (
              activeBills.map((bill) => {
                const paid = toNumber(bill.paidAmount);
                const canVoid = paid <= 0 && (bill._count?.allocations ?? 0) === 0;
                return (
                  <Card key={bill.id} className="border-slate-200">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <p className="font-semibold text-slate-900">
                          {bill.invoiceNumber}{' '}
                          <span className="text-xs font-medium uppercase text-slate-500">{bill.status}</span>
                        </p>
                        <p className="text-sm text-slate-600">
                          {bill.supplier?.name || bill.supplierName || 'No supplier'} ·{' '}
                          {formatDate(bill.invoiceDate) || formatDate(bill.createdAt)} ·{' '}
                          {bill._count?.lines ?? bill.lines?.length ?? 0} items ·{' '}
                          {fmtINR(toNumber(bill.totalAmount))}
                          {paid > 0 ? ` · paid ${fmtINR(paid)}` : ''}
                        </p>
                        {bill.lines?.length ? (
                          <p className="mt-1 truncate text-xs text-slate-500">
                            {bill.lines
                              .slice(0, 4)
                              .map((l) => `${l.productName}×${l.quantity}`)
                              .join(' · ')}
                            {(bill.lines.length > 4 && ` · +${bill.lines.length - 4} more`) || ''}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Link href={`/dashboard/purchase-bills/${bill.id}`}>
                          <Button type="button" size="sm" variant="secondary">
                            View
                          </Button>
                        </Link>
                        <Button
                          type="button"
                          size="sm"
                          variant="danger"
                          disabled={!canVoid}
                          title={
                            canVoid
                              ? 'Reverse stock + payable'
                              : 'Clear payments on this bill before voiding'
                          }
                          onClick={() => void voidBill(bill)}
                        >
                          Void
                        </Button>
                      </div>
                    </div>
                    {!canVoid ? (
                      <p className="mt-2 text-xs text-amber-800">
                        Has payments — open supplier ledger and reverse/clear payments first.
                      </p>
                    ) : null}
                  </Card>
                );
              })
            )}
          </section>

          {voidedBills.length ? (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
                Recently voided ({voidedBills.length})
              </h2>
              {voidedBills.slice(0, 10).map((bill) => (
                <Card key={bill.id} className="border-slate-200 bg-slate-50">
                  <p className="text-sm font-medium text-slate-700">{bill.invoiceNumber}</p>
                  <p className="text-xs text-slate-500">
                    {bill.supplier?.name || bill.supplierName || '—'} · {fmtINR(toNumber(bill.totalAmount))}
                  </p>
                </Card>
              ))}
            </section>
          ) : null}
        </div>
      ) : null}

      {tab === 'suppliers' && !loading ? (
        <div className="space-y-6">
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Active ({activeSuppliers.length})
            </h2>
            {!activeSuppliers.length ? (
              <Card className="border-slate-200 text-sm text-slate-500">No suppliers.</Card>
            ) : (
              activeSuppliers.map((s) => (
                <Card key={s.id} className="border-slate-200">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold text-slate-900">{s.name}</p>
                      <p className="text-sm text-slate-600">
                        {s.gstin || 'No GSTIN'} · balance {formatINR(toNumber(s.outstandingBalance))} ·{' '}
                        {s.summary?.openBillCount ?? 0} open bills
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link href={`/dashboard/suppliers/${s.id}`}>
                        <Button type="button" size="sm" variant="secondary">
                          Ledger
                        </Button>
                      </Link>
                      <Button type="button" size="sm" variant="danger" onClick={() => void archiveSupplier(s)}>
                        Archive
                      </Button>
                    </div>
                  </div>
                </Card>
              ))
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
              Archived ({archivedSuppliers.length})
            </h2>
            <p className="text-xs text-slate-500">
              Auto-removed from this list after 30 days (khata history is kept).
            </p>
            {!archivedSuppliers.length ? (
              <Card className="border-slate-200 text-sm text-slate-500">No archived suppliers.</Card>
            ) : (
              archivedSuppliers.map((s) => (
                <Card key={s.id} className="border-slate-200 bg-slate-50">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold text-slate-800">{s.name}</p>
                      <p className="text-sm text-slate-500">{s.gstin || 'No GSTIN'}</p>
                    </div>
                    <Button type="button" size="sm" onClick={() => void restoreSupplier(s)}>
                      Restore
                    </Button>
                  </div>
                </Card>
              ))
            )}
          </section>
        </div>
      ) : null}

      {tab === 'products' && !loading ? (
        <div className="space-y-3">
          {!filteredProducts.length ? (
            <Card className="border-slate-200 text-sm text-slate-500">
              {products.length
                ? 'No products match this search.'
                : 'No removed products. On Products & Stock, use Remove when stock is 0.'}
            </Card>
          ) : (
            filteredProducts.map((p) => (
              <Card key={p.id} className="border-slate-200">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <button
                      type="button"
                      className="text-left font-semibold text-teal-800 hover:underline"
                      onClick={() => setDetailId(p.id)}
                    >
                      {p.name}
                    </button>
                    <p className="text-sm text-slate-600">
                      SKU {p.sku} · stock {toNumber(p.stockQty)} · {[p.category, p.brand].filter(Boolean).join(' · ') || '—'}
                    </p>
                    {p.lastCustomerName || p.customerCount ? (
                      <p className="mt-1 text-sm text-teal-800">
                        Sold to <strong>{p.lastCustomerName || 'customers'}</strong>
                        {(p.customerCount ?? 0) > 1 ? ` (+${(p.customerCount ?? 1) - 1} more)` : ''}
                        {p.invoiceCount ? ` · ${p.invoiceCount} bill(s)` : ''}
                        {p.lastInvoiceNumber ? ` · last ${p.lastInvoiceNumber}` : ''}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-slate-500">No finalized sales on this SKU.</p>
                    )}
                    {p.buyers?.length ? (
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        Buyers: {p.buyers.map((b) => b.name).join(', ')}
                      </p>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap gap-2">
                    <Button type="button" size="sm" variant="secondary" onClick={() => setDetailId(p.id)}>
                      View history
                    </Button>
                    <Button type="button" size="sm" onClick={() => void restoreProduct(p)}>
                      Restore to catalog
                    </Button>
                  </div>
                </div>
              </Card>
            ))
          )}
          <p className={cn('text-xs text-slate-500')}>
            Tip: wrong stock from a bad invoice → void the purchase bill on the Bills tab. Archived
            products stay in this list forever so you can see who bought them.
          </p>
        </div>
      ) : null}

      <ProductDetailPanel productId={detailId} onClose={() => setDetailId(null)} />
    </div>
  );
}
