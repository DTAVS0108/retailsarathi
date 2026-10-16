'use client';
import { AppLoader } from '@/app/_components/app-loader';
import { confirmDialog } from '@/app/_components/confirm-dialog';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button, Card, formatINR } from '@retail-sarathi/ui';
import { apiWithAuth } from '@/lib/helpers';
import { pageShellClassName,
  EmptyState,
  MessageBanner,
  PageHeader,
  cn,
  inputClassName,
  parseError,
  selectClassName,
  tableCellClassName,
  tableHeaderClassName,
  toNumber,
} from '../_components/dashboard-ui';
import { RowActionsMenu } from '../_components/row-actions-menu';

type PriceListType = 'RETAIL' | 'DEALER' | 'DISTRIBUTOR' | 'WHOLESALE';

interface ProductOption {
  id: string;
  name: string;
  sku: string;
  salePrice: number;
  category?: string | null;
}

interface PriceListItem {
  id: string;
  productId: string;
  price: number;
  minQty: number;
  product: ProductOption;
}

interface PriceList {
  id: string;
  name: string;
  type: PriceListType;
  isDefault: boolean;
  items: PriceListItem[];
}

interface SegmentGuide {
  segment: string;
  priceListType: PriceListType;
  label: string;
}

const TYPES: PriceListType[] = ['RETAIL', 'DEALER', 'DISTRIBUTOR', 'WHOLESALE'];

const TYPE_HINT: Record<PriceListType, string> = {
  RETAIL: 'Optional overrides for walk-in retail',
  DEALER: 'Applied when customer segment is Dealer',
  DISTRIBUTOR: 'Applied when customer segment is Distributor',
  WHOLESALE: 'Applied when customer segment is Corporate',
};

export default function WholesalePage() {
  const [lists, setLists] = useState<PriceList[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [guide, setGuide] = useState<SegmentGuide[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [listFilter, setListFilter] = useState<'' | PriceListType>('');
  const [itemQuery, setItemQuery] = useState('');
  const [productQuery, setProductQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<PriceListType>('DEALER');
  const [newDefault, setNewDefault] = useState(true);

  const [editName, setEditName] = useState('');
  const [editingMeta, setEditingMeta] = useState(false);

  const [itemProductId, setItemProductId] = useState('');
  const [itemPrice, setItemPrice] = useState('');
  const [itemMinQty, setItemMinQty] = useState('1');
  const [discountPct, setDiscountPct] = useState('');

  const selected = lists.find((l) => l.id === selectedId) ?? null;

  const filteredLists = useMemo(() => {
    if (!listFilter) return lists;
    return lists.filter((l) => l.type === listFilter);
  }, [lists, listFilter]);

  const filteredItems = useMemo(() => {
    if (!selected) return [];
    const q = itemQuery.trim().toLowerCase();
    if (!q) return selected.items;
    return selected.items.filter(
      (i) =>
        i.product.name.toLowerCase().includes(q) ||
        i.product.sku.toLowerCase().includes(q),
    );
  }, [selected, itemQuery]);

  const productChoices = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    const base = q
      ? products.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            p.sku.toLowerCase().includes(q) ||
            (p.category && p.category.toLowerCase().includes(q)),
        )
      : products;
    return base.slice(0, 80);
  }, [products, productQuery]);

  const selectedProduct = products.find((p) => p.id === itemProductId);

  const stats = useMemo(() => {
    const byType = Object.fromEntries(TYPES.map((t) => [t, lists.filter((l) => l.type === t).length]));
    const totalItems = lists.reduce((s, l) => s + l.items.length, 0);
    const defaults = lists.filter((l) => l.isDefault).length;
    return { byType, totalItems, defaults, lists: lists.length };
  }, [lists]);

  async function load(keepId?: string) {
    try {
      setLoading(true);
      setError('');
      const [priceLists, productRes, segmentGuide] = await Promise.all([
        apiWithAuth<PriceList[]>('/wholesale/price-lists'),
        apiWithAuth<{ items: ProductOption[] }>('/products?pageSize=500'),
        apiWithAuth<SegmentGuide[]>('/wholesale/guide').catch(() => []),
      ]);
      setLists(priceLists);
      setProducts(productRes.items);
      setGuide(segmentGuide);
      const prefer = keepId || selectedId;
      if (prefer && priceLists.some((l) => l.id === prefer)) {
        setSelectedId(prefer);
      } else if (priceLists.length) {
        setSelectedId(priceLists[0].id);
      } else {
        setSelectedId('');
      }
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selected) {
      setEditName(selected.name);
      setEditingMeta(false);
    }
  }, [selected?.id]);

  useEffect(() => {
    if (!selectedProduct) return;
    const pct = toNumber(discountPct);
    if (pct > 0 && pct < 100) {
      const retail = toNumber(selectedProduct.salePrice);
      const next = Math.round(retail * (1 - pct / 100) * 100) / 100;
      setItemPrice(String(next));
    }
  }, [discountPct, selectedProduct?.id]);

  async function createList(event: React.FormEvent) {
    event.preventDefault();
    try {
      setSaving(true);
      setError('');
      setSuccess('');
      const created = await apiWithAuth<PriceList>('/wholesale/price-lists', {
        method: 'POST',
        body: JSON.stringify({
          name: newName.trim(),
          type: newType,
          isDefault: newDefault,
        }),
      });
      setNewName('');
      setShowCreate(false);
      setSuccess(`Created “${created.name}”.`);
      await load(created.id);
    } catch (err) {
      setError(parseError(err));
    } finally {
      setSaving(false);
    }
  }

  async function saveListMeta() {
    if (!selected) return;
    try {
      setSaving(true);
      setError('');
      await apiWithAuth(`/wholesale/price-lists/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: editName.trim() }),
      });
      setEditingMeta(false);
      setSuccess('Price list updated.');
      await load(selected.id);
    } catch (err) {
      setError(parseError(err));
    } finally {
      setSaving(false);
    }
  }

  async function setAsDefault() {
    if (!selected) return;
    try {
      setSaving(true);
      setError('');
      await apiWithAuth(`/wholesale/price-lists/${selected.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ isDefault: true }),
      });
      setSuccess(`${selected.name} is now the default ${selected.type} list.`);
      await load(selected.id);
    } catch (err) {
      setError(parseError(err));
    } finally {
      setSaving(false);
    }
  }

  async function deleteList() {
    if (!selected) return;
    const ok = await confirmDialog.confirm({
      title: 'Delete price list',
      message: `Delete price list “${selected.name}” and all its overrides?`,
      confirmLabel: 'Delete',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      setSaving(true);
      setError('');
      await apiWithAuth(`/wholesale/price-lists/${selected.id}`, { method: 'DELETE' });
      setSuccess('Price list deleted.');
      setSelectedId('');
      await load();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setSaving(false);
    }
  }

  async function addOrUpdateItem(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    try {
      setSaving(true);
      setError('');
      setSuccess('');
      await apiWithAuth(`/wholesale/price-lists/${selected.id}/items`, {
        method: 'POST',
        body: JSON.stringify({
          productId: itemProductId,
          price: toNumber(itemPrice),
          minQty: toNumber(itemMinQty) || 1,
        }),
      });
      setItemProductId('');
      setItemPrice('');
      setItemMinQty('1');
      setDiscountPct('');
      setProductQuery('');
      setSuccess('Price override saved (supports qty tiers: same product, different min qty).');
      await load(selected.id);
    } catch (err) {
      setError(parseError(err));
    } finally {
      setSaving(false);
    }
  }

  async function removeItem(itemId: string) {
    if (!selected) return;
    const ok = await confirmDialog.confirm({
      title: 'Remove override',
      message: 'Remove this price override?',
      confirmLabel: 'Remove',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      setSaving(true);
      await apiWithAuth(`/wholesale/price-lists/${selected.id}/items/${itemId}`, {
        method: 'DELETE',
      });
      setSuccess('Override removed — retail price will apply.');
      await load(selected.id);
    } catch (err) {
      setError(parseError(err));
    } finally {
      setSaving(false);
    }
  }

  function fillFromItem(item: PriceListItem) {
    setItemProductId(item.productId);
    setItemPrice(String(toNumber(item.price)));
    setItemMinQty(String(toNumber(item.minQty) || 1));
    setProductQuery(item.product.name);
    setDiscountPct('');
  }

  return (
    <div className={pageShellClassName}>
      <PageHeader
        title="Wholesale pricing"
        description="Build dealer, distributor, and corporate price lists. POS applies the matching list when you select a customer segment."
        actions={
          <Button type="button" size="sm" onClick={() => setShowCreate((v) => !v)}>
            {showCreate ? 'Close' : '+ New price list'}
          </Button>
        }
      />

      {error ? <MessageBanner tone="error">{error}</MessageBanner> : null}
      {success ? <MessageBanner tone="success">{success}</MessageBanner> : null}

      <Card className="border-teal-200 bg-gradient-to-br from-teal-50/90 via-white to-slate-50">
        <button
          type="button"
          onClick={() => setHowItWorksOpen((open) => !open)}
          className="flex w-full items-center justify-between gap-3 text-left"
          aria-expanded={howItWorksOpen}
        >
          <h3 className="text-base font-semibold text-slate-900">How wholesale pricing works</h3>
          <span
            className={`shrink-0 text-xs text-slate-500 transition ${howItWorksOpen ? 'rotate-90' : ''}`}
            aria-hidden
          >
            ▶
          </span>
        </button>
        {howItWorksOpen ? (
          <>
            <p className="mt-2 text-sm text-slate-600">
              This screen is live — prices you save here are used automatically on POS when the right customer is selected.
            </p>
            <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-slate-700">
              <li>
                Create a price list for a type (e.g. <strong>DEALER</strong>) and mark it as{' '}
                <strong>default</strong> for that type.
              </li>
              <li>
                Add product overrides (price + optional min qty). Same product with different min qty = quantity
                break — POS picks the best tier for cart qty.
              </li>
              <li>
                On{' '}
                <Link href="/dashboard/customers" className="font-medium text-brand hover:underline">
                  Customers
                </Link>
                , set the party’s <strong>segment</strong> (Dealer / Distributor / Corporate).
              </li>
              <li>
                On{' '}
                <Link href="/dashboard/pos" className="font-medium text-brand hover:underline">
                  POS
                </Link>
                , select that customer — rates switch to the matching list. Changing qty also re-applies tiers.
              </li>
            </ol>
            <div className="mt-4 rounded-xl border border-teal-100 bg-white/80 px-3 py-2.5 text-sm text-slate-600">
              <p className="font-medium text-slate-800">Segment → list type</p>
              <p className="mt-1">
                Retail → RETAIL · Dealer → DEALER · Distributor → DISTRIBUTOR · Corporate → WHOLESALE
              </p>
              <p className="mt-1 text-xs text-slate-500">
                If no override exists for a product, the normal retail sale price is used.
              </p>
            </div>
          </>
        ) : (
          <p className="mt-1 text-sm text-slate-500">Tap to expand the setup guide.</p>
        )}
      </Card>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Card className="border-slate-200">
          <p className="text-xs font-medium text-slate-500">Price lists</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{stats.lists}</p>
        </Card>
        <Card className="border-slate-200">
          <p className="text-xs font-medium text-slate-500">Overrides</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{stats.totalItems}</p>
        </Card>
        <Card className="border-slate-200">
          <p className="text-xs font-medium text-slate-500">Defaults set</p>
          <p className="mt-1 text-2xl font-semibold text-teal-700">{stats.defaults}</p>
        </Card>
        <Card className="border-slate-200">
          <p className="text-xs font-medium text-slate-500">Products loaded</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{products.length}</p>
        </Card>
      </section>

      {guide.length ? (
        <Card className="border-slate-200 bg-gradient-to-br from-slate-50 to-white">
          <h3 className="text-sm font-semibold text-slate-900">Quick reference — POS mapping</h3>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            {guide.map((g) => (
              <div key={g.segment} className="rounded-xl border border-slate-200 bg-white px-3 py-2">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{g.segment}</p>
                <p className="mt-0.5 text-sm font-semibold text-slate-800">→ {g.priceListType}</p>
                <p className="text-xs text-slate-500">{g.label}</p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      {showCreate ? (
        <Card className="border-teal-200 bg-gradient-to-br from-teal-50 to-white">
          <form className="space-y-4" onSubmit={createList}>
            <div>
              <h3 className="text-lg font-semibold text-slate-900">Create price list</h3>
              <p className="text-sm text-slate-500">Name the list and choose which customer segment it serves.</p>
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label className="space-y-1.5 text-sm font-medium text-slate-700 sm:col-span-2">
                <span>Name</span>
                <input
                  className={inputClassName}
                  placeholder="e.g. Dealer 2026"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  required
                />
              </label>
              <label className="space-y-1.5 text-sm font-medium text-slate-700">
                <span>Type</span>
                <select
                  className={selectClassName}
                  value={newType}
                  onChange={(e) => setNewType(e.target.value as PriceListType)}
                >
                  {TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-end gap-2 pb-2 text-sm font-medium text-slate-700">
                <input
                  type="checkbox"
                  checked={newDefault}
                  onChange={(e) => setNewDefault(e.target.checked)}
                />
                Set as default for this type
              </label>
            </div>
            <p className="text-xs text-slate-500">{TYPE_HINT[newType]}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? 'Saving…' : 'Create list'}
              </Button>
              <Button type="button" variant="secondary" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[0.9fr,1.4fr]">
        <Card className="border-slate-200">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-lg font-semibold text-slate-900">Your lists</h3>
            <select
              className={`${selectClassName} min-h-9 w-auto py-2 text-sm`}
              value={listFilter}
              onChange={(e) => setListFilter(e.target.value as '' | PriceListType)}
            >
              <option value="">All types</option>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {t} ({stats.byType[t] ?? 0})
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <AppLoader label="Loading price lists…" />
          ) : !filteredLists.length ? (
            <EmptyState
              title="No price lists yet"
              description="Create a Dealer or Distributor list, then add product overrides."
            />
          ) : (
            <ul className="space-y-2">
              {filteredLists.map((list) => {
                const active = selected?.id === list.id;
                return (
                  <li key={list.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(list.id)}
                      className={cn(
                        'w-full rounded-xl border px-3 py-3 text-left transition',
                        active
                          ? 'border-teal-300 bg-teal-50/80 shadow-sm'
                          : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50',
                      )}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-900">{list.name}</p>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {list.type} · {list.items.length} override
                            {list.items.length === 1 ? '' : 's'}
                          </p>
                        </div>
                        {list.isDefault ? (
                          <span className="shrink-0 rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-800">
                            Default
                          </span>
                        ) : null}
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="border-slate-200">
          {!selected ? (
            <EmptyState
              title="Select a price list"
              description="Choose a list on the left, or create one to manage wholesale rates."
            />
          ) : (
            <>
              <div className="mb-4 flex flex-col gap-3 border-b border-slate-100 pb-4 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 flex-1">
                  {editingMeta ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <input
                        className={`${inputClassName} max-w-sm`}
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                      />
                      <Button type="button" size="sm" disabled={saving} onClick={() => void saveListMeta()}>
                        Save
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          setEditName(selected.name);
                          setEditingMeta(false);
                        }}
                      >
                        Cancel
                      </Button>
                    </div>
                  ) : (
                    <>
                      <h3 className="text-lg font-semibold text-slate-900">{selected.name}</h3>
                      <p className="text-sm text-slate-500">
                        {selected.type} · {TYPE_HINT[selected.type]}
                        {selected.isDefault ? ' · Default for POS' : ''}
                      </p>
                    </>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {!editingMeta ? (
                    <Button type="button" size="sm" variant="secondary" onClick={() => setEditingMeta(true)}>
                      Rename
                    </Button>
                  ) : null}
                  {!selected.isDefault ? (
                    <Button type="button" size="sm" variant="secondary" disabled={saving} onClick={() => void setAsDefault()}>
                      Set default
                    </Button>
                  ) : null}
                  <Button type="button" size="sm" variant="secondary" disabled={saving} onClick={() => void deleteList()}>
                    Delete
                  </Button>
                </div>
              </div>

              <form
                className="mb-5 space-y-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-4"
                onSubmit={addOrUpdateItem}
              >
                <div className="flex flex-wrap items-end justify-between gap-2">
                  <div>
                    <h4 className="text-sm font-semibold text-slate-900">Add / update override</h4>
                    <p className="text-xs text-slate-500">
                      Same product + different min qty = quantity break. Re-saving same product+qty updates price.
                    </p>
                  </div>
                </div>
                <div className="grid gap-3 lg:grid-cols-2">
                  <label className="space-y-1.5 text-sm font-medium text-slate-700 lg:col-span-2">
                    <span>Search product</span>
                    <input
                      className={inputClassName}
                      placeholder="Name, SKU, category…"
                      value={productQuery}
                      onChange={(e) => setProductQuery(e.target.value)}
                    />
                  </label>
                  <label className="space-y-1.5 text-sm font-medium text-slate-700 lg:col-span-2">
                    <span>Product</span>
                    <select
                      className={selectClassName}
                      value={itemProductId}
                      onChange={(e) => {
                        setItemProductId(e.target.value);
                        const p = products.find((x) => x.id === e.target.value);
                        if (p && !itemPrice) setItemPrice(String(toNumber(p.salePrice)));
                      }}
                      required
                    >
                      <option value="">Select product…</option>
                      {productChoices.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} ({p.sku}) · retail {formatINR(toNumber(p.salePrice))}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="space-y-1.5 text-sm font-medium text-slate-700">
                    <span>Wholesale price</span>
                    <input
                      className={inputClassName}
                      type="number"
                      min="0"
                      step="0.01"
                      placeholder="0.00"
                      value={itemPrice}
                      onChange={(e) => {
                        setItemPrice(e.target.value);
                        setDiscountPct('');
                      }}
                      required
                    />
                  </label>
                  <label className="space-y-1.5 text-sm font-medium text-slate-700">
                    <span>% off retail (helper)</span>
                    <input
                      className={inputClassName}
                      type="number"
                      min="0"
                      max="99"
                      step="0.1"
                      placeholder="e.g. 10"
                      value={discountPct}
                      onChange={(e) => setDiscountPct(e.target.value)}
                      disabled={!selectedProduct}
                    />
                  </label>
                  <label className="space-y-1.5 text-sm font-medium text-slate-700">
                    <span>Min qty</span>
                    <input
                      className={inputClassName}
                      type="number"
                      min="1"
                      step="1"
                      value={itemMinQty}
                      onChange={(e) => setItemMinQty(e.target.value)}
                    />
                  </label>
                  <div className="flex items-end">
                    <Button type="submit" className="w-full" disabled={saving || !itemProductId}>
                      {saving ? 'Saving…' : 'Save override'}
                    </Button>
                  </div>
                </div>
                {selectedProduct ? (
                  <p className="text-xs text-slate-500">
                    Retail {formatINR(toNumber(selectedProduct.salePrice))}
                    {toNumber(itemPrice) > 0
                      ? ` · Override ${formatINR(toNumber(itemPrice))} (${Math.round(
                          ((toNumber(selectedProduct.salePrice) - toNumber(itemPrice)) /
                            toNumber(selectedProduct.salePrice)) *
                            100,
                        )}% off)`
                      : ''}
                  </p>
                ) : null}
              </form>

              <div className="mb-3 flex flex-wrap items-center gap-2">
                <input
                  className={`${inputClassName} max-w-xs`}
                  placeholder="Filter overrides…"
                  value={itemQuery}
                  onChange={(e) => setItemQuery(e.target.value)}
                />
                <p className="text-xs text-slate-500">
                  Showing {filteredItems.length} of {selected.items.length}
                </p>
              </div>

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className={tableHeaderClassName}>Product</th>
                      <th className={tableHeaderClassName}>Min qty</th>
                      <th className={tableHeaderClassName}>Price</th>
                      <th className={tableHeaderClassName}>vs retail</th>
                      <th className={cn(tableHeaderClassName, 'text-right')}>Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredItems.length ? (
                      filteredItems.map((item) => {
                        const retail = toNumber(item.product.salePrice);
                        const price = toNumber(item.price);
                        const off = retail > 0 ? Math.round(((retail - price) / retail) * 100) : 0;
                        return (
                          <tr key={item.id} className="hover:bg-slate-50">
                            <td className={tableCellClassName}>
                              <p className="font-medium text-slate-900">{item.product.name}</p>
                              <p className="text-xs text-slate-500">
                                {item.product.sku} · retail {formatINR(retail)}
                              </p>
                            </td>
                            <td className={tableCellClassName}>{toNumber(item.minQty)}</td>
                            <td className={tableCellClassName}>
                              <span className="font-semibold text-slate-900">{formatINR(price)}</span>
                            </td>
                            <td className={tableCellClassName}>
                              <span
                                className={cn(
                                  'text-sm font-medium',
                                  off > 0 ? 'text-teal-700' : off < 0 ? 'text-amber-700' : 'text-slate-500',
                                )}
                              >
                                {off > 0 ? `−${off}%` : off < 0 ? `+${Math.abs(off)}%` : 'Same'}
                              </span>
                            </td>
                            <td className={cn(tableCellClassName, 'text-right')}>
                              <div className="flex justify-end">
                                <RowActionsMenu
                                  actions={[
                                    { key: 'edit', label: 'Edit', onClick: () => fillFromItem(item) },
                                    { key: 'remove', label: 'Remove', tone: 'danger', onClick: () => void removeItem(item.id) },
                                  ]}
                                />
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td colSpan={5} className="px-4 py-10 text-center text-sm text-slate-500">
                          {selected.items.length
                            ? 'No overrides match this filter.'
                            : 'No overrides yet — retail prices apply until you add products.'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      </section>
    </div>
  );
}
