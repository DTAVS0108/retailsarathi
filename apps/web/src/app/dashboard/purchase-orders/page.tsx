'use client';
import { AppLoader } from '@/app/_components/app-loader';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button, Card, formatINR } from '@retail-sarathi/ui';
import { apiWithAuth } from '@/lib/helpers';
import { pageShellClassName,
  MessageBanner,
  PageHeader,
  StatusBadge,
  formatDate,
  inputClassName,
  parseError,
  selectClassName,
  tableCellClassName,
  tableHeaderClassName,
  toNumber,
} from '../_components/dashboard-ui';

interface Product {
  id: string;
  name: string;
  sku: string;
  trackSerial?: boolean;
  trackBatch?: boolean;
}

interface Supplier {
  id: string;
  name: string;
}

interface PoLine {
  id: string;
  quantity: number;
  receivedQty: number;
  unitCost: number;
  product: { id: string; name: string; sku: string };
}

interface PurchaseBillRef {
  id: string;
  invoiceNumber?: string;
  status?: string;
}

interface PurchaseOrder {
  id: string;
  poNumber: string;
  status: string;
  notes?: string | null;
  createdAt: string;
  supplier?: { id?: string; name: string } | null;
  orderedQty?: number;
  receivedQty?: number;
  remainingQty?: number;
  orderedValue?: number;
  progressPct?: number;
  missingFields?: string[];
  purchaseBill?: PurchaseBillRef | null;
  lines: PoLine[];
}

interface NewLine {
  productId: string;
  quantity: string;
  unitCost: string;
}

export default function PurchaseOrdersPage() {
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [supplierId, setSupplierId] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [notes, setNotes] = useState('');
  const [newLines, setNewLines] = useState<NewLine[]>([{ productId: '', quantity: '1', unitCost: '0' }]);
  const [receiveQty, setReceiveQty] = useState<Record<string, string>>({});
  const [receiveSerials, setReceiveSerials] = useState<Record<string, string>>({});
  const [receiveBatchNumber, setReceiveBatchNumber] = useState<Record<string, string>>({});
  const [receiveExpiry, setReceiveExpiry] = useState<Record<string, string>>({});
  const [receiveInvoice, setReceiveInvoice] = useState<Record<string, string>>({});
  const [receiveBillAsDraft, setReceiveBillAsDraft] = useState<Record<string, boolean>>({});
  const [lastBillByPo, setLastBillByPo] = useState<Record<string, PurchaseBillRef | null>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function load() {
    try {
      const qs = statusFilter ? `?status=${encodeURIComponent(statusFilter)}` : '';
      const [pos, prods, sups] = await Promise.all([
        apiWithAuth<PurchaseOrder[]>(`/purchase-orders${qs}`),
        apiWithAuth<{ items: Product[] }>('/products'),
        apiWithAuth<Supplier[]>('/suppliers'),
      ]);
      setOrders(pos);
      setProducts(prods.items);
      setSuppliers(sups);
    } catch (e) {
      setError(parseError(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  async function createPo(e: React.FormEvent) {
    e.preventDefault();
    const lines = newLines
      .filter((l) => l.productId && toNumber(l.quantity) > 0)
      .map((l) => ({
        productId: l.productId,
        quantity: toNumber(l.quantity),
        unitCost: toNumber(l.unitCost),
      }));
    if (!supplierId) {
      setError('Select a supplier so GRN can create a purchase bill.');
      return;
    }
    if (!lines.length) {
      setError('Add at least one product line.');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await apiWithAuth('/purchase-orders', {
        method: 'POST',
        body: JSON.stringify({
          supplierId: supplierId || undefined,
          notes: notes.trim() || undefined,
          lines,
        }),
      });
      setNewLines([{ productId: '', quantity: '1', unitCost: '0' }]);
      setNotes('');
      setSuccess('Purchase order created.');
      await load();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setSaving(false);
    }
  }

  async function receivePo(po: PurchaseOrder) {
    const receipts = po.lines
      .map((l) => {
        const quantity = toNumber(receiveQty[l.id]);
        const serialNumbers = (receiveSerials[l.id] ?? '')
          .split(/[\n,;]+/)
          .map((s) => s.trim())
          .filter(Boolean);
        return {
          lineId: l.id,
          quantity,
          serialNumbers: serialNumbers.length ? serialNumbers : undefined,
          batchNumber: receiveBatchNumber[l.id]?.trim() || undefined,
          expiryDate: receiveExpiry[l.id] || undefined,
        };
      })
      .filter((r) => r.quantity > 0);

    if (!receipts.length) {
      setError('Enter receive quantity for at least one line.');
      return;
    }

    for (const r of receipts) {
      const line = po.lines.find((l) => l.id === r.lineId);
      const tracked = line ? products.find((p) => p.id === line.product.id)?.trackSerial : false;
      if (tracked && (!r.serialNumbers || r.serialNumbers.length !== r.quantity)) {
        setError(`IMEI/serial count must match receive qty for ${line?.product.name ?? 'tracked item'}.`);
        return;
      }
      if (r.serialNumbers && r.serialNumbers.length !== r.quantity) {
        setError(`Serial count must match receive qty (${r.quantity}) for each IMEI line.`);
        return;
      }
    }

    const invoiceNumber = receiveInvoice[po.id]?.trim() || undefined;
    const billAsDraft = receiveBillAsDraft[po.id] ?? false;
    const isPartialReceive = po.lines.some((l) => {
      const qty = toNumber(receiveQty[l.id]);
      const remaining = toNumber(l.quantity) - toNumber(l.receivedQty);
      return qty > 0 && qty < remaining - 0.001;
    });

    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const result = await apiWithAuth<{
        poNumber?: string;
        purchaseBill?: PurchaseBillRef | null;
      }>(`/purchase-orders/${po.id}/receive`, {
        method: 'POST',
        body: JSON.stringify({
          receipts,
          createPurchaseBill: true,
          invoiceNumber,
          billAsDraft: billAsDraft || (isPartialReceive && !invoiceNumber),
        }),
      });
      setReceiveQty((prev) => {
        const next = { ...prev };
        for (const l of po.lines) delete next[l.id];
        return next;
      });
      setReceiveSerials({});
      setReceiveInvoice((prev) => {
        const next = { ...prev };
        delete next[po.id];
        return next;
      });
      if (result.purchaseBill) {
        setLastBillByPo((prev) => ({ ...prev, [po.id]: result.purchaseBill ?? null }));
      }
      const bill = result.purchaseBill;
      setSuccess(
        bill?.invoiceNumber
          ? bill.status === 'DRAFT'
            ? `GRN for ${po.poNumber}. Draft bill ${bill.invoiceNumber} — add supplier invoice # when ready.`
            : `GRN for ${po.poNumber}. Purchase bill ${bill.invoiceNumber} posted.`
          : `GRN recorded for ${po.poNumber}. Stock updated.`,
      );
      await load();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setSaving(false);
    }
  }

  async function cancelPo(po: PurchaseOrder) {
    const ok = window.confirm(`Cancel ${po.poNumber}? Only allowed if nothing has been received.`);
    if (!ok) return;
    setSaving(true);
    setError('');
    try {
      await apiWithAuth(`/purchase-orders/${po.id}/cancel`, { method: 'POST', body: '{}' });
      setSuccess(`Cancelled ${po.poNumber}.`);
      await load();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <AppLoader label="Loading purchase orders…" />;
  }

  return (
    <div className={pageShellClassName}>
      <PageHeader
        title="Purchase Orders"
        description="Create POs, receive GRN into stock, and auto-create a purchase bill when fully received (Vyapar-style PO → bill)."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/purchase-bills">
              <Button type="button" variant="secondary">
                Purchase bills
              </Button>
            </Link>
            <Link href="/dashboard/suppliers">
              <Button type="button" variant="secondary">
                Suppliers
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

      <Card className="border-teal-200 bg-gradient-to-br from-teal-50 to-white">
        <form className="space-y-4" onSubmit={createPo}>
          <h2 className="text-lg font-semibold">New purchase order</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <select className={selectClassName} value={supplierId} onChange={(e) => setSupplierId(e.target.value)} required>
              <option value="">Supplier (required for bill on GRN)</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
            <input className={inputClassName} placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {newLines.map((line, idx) => (
            <div key={idx} className="grid gap-2 md:grid-cols-[1fr,100px,120px,auto]">
              <select
                className={selectClassName}
                value={line.productId}
                onChange={(e) =>
                  setNewLines((prev) => prev.map((l, i) => (i === idx ? { ...l, productId: e.target.value } : l)))
                }
              >
                <option value="">Select product</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>
                ))}
              </select>
              <input
                className={inputClassName}
                type="number"
                min="1"
                placeholder="Qty"
                value={line.quantity}
                onChange={(e) =>
                  setNewLines((prev) => prev.map((l, i) => (i === idx ? { ...l, quantity: e.target.value } : l)))
                }
              />
              <input
                className={inputClassName}
                type="number"
                min="0"
                step="0.01"
                placeholder="Unit cost"
                value={line.unitCost}
                onChange={(e) =>
                  setNewLines((prev) => prev.map((l, i) => (i === idx ? { ...l, unitCost: e.target.value } : l)))
                }
              />
              {newLines.length > 1 ? (
                <Button type="button" variant="secondary" size="sm" onClick={() => setNewLines((prev) => prev.filter((_, i) => i !== idx))}>
                  Remove
                </Button>
              ) : null}
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" onClick={() => setNewLines((prev) => [...prev, { productId: '', quantity: '1', unitCost: '0' }])}>
              Add line
            </Button>
            <Button type="submit" disabled={saving}>{saving ? 'Creating…' : 'Create PO'}</Button>
          </div>
        </form>
      </Card>

      <Card className="border-slate-200 p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">Purchase orders</h2>
          <select
            className={`${selectClassName} max-w-xs`}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">Open (excl. cancelled)</option>
            <option value="ORDERED">Ordered</option>
            <option value="PARTIAL">Partial</option>
            <option value="RECEIVED">Received</option>
            <option value="CANCELLED">Cancelled</option>
          </select>
        </div>
        {!orders.length ? (
          <p className="text-sm text-slate-500">No purchase orders yet.</p>
        ) : (
          <div className="space-y-4">
            {orders.map((po) => {
              const canReceive = po.status !== 'RECEIVED' && po.status !== 'CANCELLED';
              const canCancel = po.status === 'ORDERED';
              return (
                <div key={po.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-semibold">{po.poNumber}</span>
                      <StatusBadge status={po.status} />
                      {po.supplier?.name ? (
                        <span className="ml-2 text-sm text-slate-500">{po.supplier.name}</span>
                      ) : (
                        <span className="ml-2 text-xs font-semibold text-amber-800">No supplier</span>
                      )}
                      <p className="text-xs text-slate-400">
                        {formatDate(po.createdAt)} · {po.receivedQty ?? 0}/{po.orderedQty ?? 0} received ·{' '}
                        {po.progressPct ?? 0}%
                        {po.orderedValue != null ? ` · ${formatINR(po.orderedValue)}` : ''}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {(po.missingFields || []).map((f) => (
                          <span
                            key={f}
                            className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-800"
                          >
                            {f}
                          </span>
                        ))}
                      </div>
                    </div>
                    {canCancel ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={saving}
                        onClick={() => void cancelPo(po)}
                      >
                        Cancel PO
                      </Button>
                    ) : null}
                  </div>
                  <table className="mt-3 min-w-full text-sm">
                    <thead>
                      <tr>
                        <th className={tableHeaderClassName}>Product</th>
                        <th className={tableHeaderClassName}>Ordered</th>
                        <th className={tableHeaderClassName}>Received</th>
                        <th className={tableHeaderClassName}>Cost</th>
                        {canReceive ? <th className={tableHeaderClassName}>Receive now</th> : null}
                        {canReceive ? <th className={tableHeaderClassName}>Serials / IMEI</th> : null}
                        {canReceive ? <th className={tableHeaderClassName}>Batch / expiry</th> : null}
                      </tr>
                    </thead>
                    <tbody>
                      {po.lines.map((l) => {
                        const remaining = toNumber(l.quantity) - toNumber(l.receivedQty);
                        return (
                          <tr key={l.id} className="border-t border-slate-100">
                            <td className={tableCellClassName}>{l.product.name}</td>
                            <td className={tableCellClassName}>{toNumber(l.quantity)}</td>
                            <td className={tableCellClassName}>{toNumber(l.receivedQty)}</td>
                            <td className={tableCellClassName}>{formatINR(toNumber(l.unitCost))}</td>
                            {canReceive ? (
                              <td className={tableCellClassName}>
                                {remaining > 0 ? (
                                  <input
                                    className={`${inputClassName} max-w-24`}
                                    type="number"
                                    min="0"
                                    max={remaining}
                                    placeholder={`max ${remaining}`}
                                    value={receiveQty[l.id] ?? ''}
                                    onChange={(e) => setReceiveQty((prev) => ({ ...prev, [l.id]: e.target.value }))}
                                  />
                                ) : (
                                  'Complete'
                                )}
                              </td>
                            ) : null}
                            {canReceive ? (
                              <td className={tableCellClassName}>
                                {remaining > 0 ? (
                                  <div className="space-y-1">
                                    <textarea
                                      className={`${inputClassName} min-h-[2.5rem] min-w-[10rem] text-xs`}
                                      placeholder={
                                        products.find((p) => p.id === l.product.id)?.trackSerial
                                          ? `IMEI/serials (${toNumber(receiveQty[l.id]) || remaining} required)`
                                          : 'Optional serials (one per line)'
                                      }
                                      value={receiveSerials[l.id] ?? ''}
                                      onChange={(e) =>
                                        setReceiveSerials((prev) => ({ ...prev, [l.id]: e.target.value }))
                                      }
                                    />
                                    {products.find((p) => p.id === l.product.id)?.trackSerial ? (
                                      <p className="text-[11px] text-amber-700">Serial-tracked product</p>
                                    ) : null}
                                  </div>
                                ) : null}
                              </td>
                            ) : null}
                            {canReceive ? (
                              <td className={tableCellClassName}>
                                {remaining > 0 && products.find((p) => p.id === l.product.id)?.trackBatch ? (
                                  <div className="flex flex-col gap-1">
                                    <input
                                      className={`${inputClassName} min-w-[8rem] text-xs`}
                                      placeholder="Batch number"
                                      value={receiveBatchNumber[l.id] ?? ''}
                                      onChange={(e) =>
                                        setReceiveBatchNumber((prev) => ({ ...prev, [l.id]: e.target.value }))
                                      }
                                    />
                                    <input
                                      type="date"
                                      className={`${inputClassName} text-xs`}
                                      value={receiveExpiry[l.id] ?? ''}
                                      onChange={(e) => setReceiveExpiry((prev) => ({ ...prev, [l.id]: e.target.value }))}
                                    />
                                    <p className="text-[11px] text-amber-700">Batch-tracked product</p>
                                  </div>
                                ) : remaining > 0 ? (
                                  '—'
                                ) : null}
                              </td>
                            ) : null}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {canReceive ? (
                    <div className="mt-3 space-y-2">
                      <div className="flex flex-wrap items-end gap-3">
                        <label className="space-y-1 text-xs font-medium text-slate-600">
                          Supplier invoice # (optional)
                          <input
                            className={`${inputClassName} max-w-xs`}
                            placeholder="Leave blank → DRAFT on partial GRN"
                            value={receiveInvoice[po.id] ?? ''}
                            onChange={(e) =>
                              setReceiveInvoice((prev) => ({ ...prev, [po.id]: e.target.value }))
                            }
                          />
                        </label>
                        <label className="flex items-center gap-2 pb-2 text-sm">
                          <input
                            type="checkbox"
                            checked={receiveBillAsDraft[po.id] ?? false}
                            onChange={(e) =>
                              setReceiveBillAsDraft((prev) => ({ ...prev, [po.id]: e.target.checked }))
                            }
                          />
                          Bill as DRAFT
                        </label>
                      </div>
                      <Button size="sm" disabled={saving} onClick={() => void receivePo(po)}>
                        Receive GRN
                      </Button>
                    </div>
                  ) : null}
                  {(lastBillByPo[po.id] ?? po.purchaseBill) ? (
                    <div className="mt-2 text-sm">
                      <span className="text-slate-500">Purchase bill: </span>
                      <Link
                        href={`/dashboard/purchase-bills/${(lastBillByPo[po.id] ?? po.purchaseBill)!.id}`}
                        className="font-medium text-teal-700 underline"
                      >
                        {(lastBillByPo[po.id] ?? po.purchaseBill)!.invoiceNumber ?? 'View bill'}
                      </Link>
                      {(lastBillByPo[po.id] ?? po.purchaseBill)!.status ? (
                        <StatusBadge status={(lastBillByPo[po.id] ?? po.purchaseBill)!.status!} />
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
