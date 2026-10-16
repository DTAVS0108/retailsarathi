'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button, Card, formatINR } from '@retail-sarathi/ui';
import { apiWithAuth } from '@/lib/helpers';
import {
  pageShellClassName,
  EmptyState,
  MessageBanner,
  PageHeader,
  StatCard,
  cn,
  inputClassName,
  parseError,
  selectClassName,
  tableCellClassName,
  tableHeaderClassName,
  toNumber,
} from '../_components/dashboard-ui';
import { RowActionsMenu } from '../_components/row-actions-menu';

interface Branch {
  id: string;
  name: string;
  address: string;
  stateCode: string;
  managerId?: string | null;
  manager?: { id: string; name: string } | null;
  lowStockCount?: number;
  _count?: { users: number; invoices: number };
}
interface Product {
  id: string;
  name: string;
  sku: string;
}
interface StaffOption {
  id: string;
  name: string;
  role: string;
}
interface TransferItem {
  product: { id: string; name: string };
  quantity: number;
}
interface Transfer {
  id: string;
  status: 'PENDING' | 'IN_TRANSIT' | 'COMPLETED' | 'CANCELLED';
  fromBranch: { name: string };
  toBranch: { name: string };
  items: TransferItem[];
  notes?: string | null;
  createdAt: string;
}

const TRANSFER_STATUS_STYLE: Record<Transfer['status'], string> = {
  PENDING: 'bg-amber-100 text-amber-800',
  IN_TRANSIT: 'bg-blue-100 text-blue-800',
  COMPLETED: 'bg-emerald-100 text-emerald-800',
  CANCELLED: 'bg-slate-100 text-slate-600',
};

const EMPTY_LINE = { productId: '', quantity: '1' };

export default function BranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [staff, setStaff] = useState<StaffOption[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [pnl, setPnl] = useState<{
    totalRevenue: number;
    totalNetProfit: number;
    branches: Array<{
      branchId: string;
      branchName: string;
      revenue: number;
      invoiceCount: number;
      cogs: number;
      repairRevenue: number;
      repairCount: number;
      netProfit: number;
    }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [branchForm, setBranchForm] = useState({ name: '', address: '', stateCode: '', managerId: '' });
  const [showBranchForm, setShowBranchForm] = useState(false);

  const [transferHeader, setTransferHeader] = useState({ fromBranchId: '', toBranchId: '', notes: '' });
  const [transferLines, setTransferLines] = useState([{ ...EMPTY_LINE }]);
  const [showTransferForm, setShowTransferForm] = useState(false);

  const managerOptions = useMemo(() => staff.filter((s) => s.role === 'OWNER' || s.role === 'MANAGER'), [staff]);

  async function load() {
    try {
      setLoading(true);
      setError('');
      const year = new Date().getFullYear();
      const [b, t, prods, staffList] = await Promise.all([
        apiWithAuth<Branch[]>('/branches'),
        apiWithAuth<Transfer[]>('/branches/transfers/list'),
        apiWithAuth<{ items: Product[] }>('/products?pageSize=200'),
        apiWithAuth<StaffOption[]>('/staff').catch(() => []),
      ]);
      setBranches(b);
      setTransfers(t);
      setProducts(prods.items);
      setStaff(staffList);
      setPnl(
        await apiWithAuth<typeof pnl>(`/branches/reports/consolidated-pnl?from=${year}-04-01&to=${year + 1}-03-31`).catch(() => null),
      );
      if (b.length >= 2 && !transferHeader.fromBranchId) {
        setTransferHeader((f) => ({ ...f, fromBranchId: b[0].id, toBranchId: b[1].id }));
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

  async function handleCreateBranch(e: React.FormEvent) {
    e.preventDefault();
    try {
      setError('');
      await apiWithAuth('/branches', {
        method: 'POST',
        body: JSON.stringify({ ...branchForm, managerId: branchForm.managerId || undefined }),
      });
      setSuccess('Branch created');
      setBranchForm({ name: '', address: '', stateCode: '', managerId: '' });
      setShowBranchForm(false);
      await load();
    } catch (err) {
      setError(parseError(err));
    }
  }

  async function handleAssignManager(branchId: string, managerId: string) {
    try {
      setError('');
      await apiWithAuth(`/branches/${branchId}`, {
        method: 'PATCH',
        body: JSON.stringify({ managerId: managerId || null }),
      });
      await load();
    } catch (err) {
      setError(parseError(err));
    }
  }

  function updateLine(i: number, patch: Partial<(typeof EMPTY_LINE)>) {
    setTransferLines((lines) => lines.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }

  async function handleCreateTransfer(e: React.FormEvent) {
    e.preventDefault();
    if (!transferHeader.fromBranchId || !transferHeader.toBranchId) {
      setError('Select from/to branches.');
      return;
    }
    if (transferHeader.fromBranchId === transferHeader.toBranchId) {
      setError('From and to branch must differ.');
      return;
    }
    const items = transferLines
      .filter((l) => l.productId && toNumber(l.quantity) > 0)
      .map((l) => ({ productId: l.productId, quantity: toNumber(l.quantity) }));
    if (!items.length) {
      setError('Add at least one line item.');
      return;
    }
    try {
      setError('');
      await apiWithAuth('/branches/transfers', {
        method: 'POST',
        body: JSON.stringify({ ...transferHeader, items, notes: transferHeader.notes.trim() || undefined }),
      });
      setSuccess('Transfer request created');
      setTransferLines([{ ...EMPTY_LINE }]);
      setTransferHeader((f) => ({ ...f, notes: '' }));
      setShowTransferForm(false);
      await load();
    } catch (err) {
      setError(parseError(err));
    }
  }

  async function handleTransferAction(id: string, action: 'dispatch' | 'receive' | 'cancel') {
    try {
      setError('');
      await apiWithAuth(`/branches/transfers/${id}/${action}`, { method: 'POST' });
      setSuccess(`Transfer ${action === 'receive' ? 'received' : action === 'dispatch' ? 'dispatched' : 'cancelled'}`);
      await load();
    } catch (err) {
      setError(parseError(err));
    }
  }

  const totalLowStock = branches.reduce((s, b) => s + (b.lowStockCount ?? 0), 0);
  const pendingTransfers = transfers.filter((t) => t.status === 'PENDING' || t.status === 'IN_TRANSIT').length;

  return (
    <div className={pageShellClassName}>
      <PageHeader
        title="Multi-Branch"
        description="Manage branches, inter-branch stock transfers, and consolidated performance."
        actions={
          <div className="flex gap-2">
            <Button type="button" variant="secondary" onClick={() => setShowTransferForm((v) => !v)}>
              {showTransferForm ? 'Cancel' : 'New transfer'}
            </Button>
            <Button type="button" onClick={() => setShowBranchForm((v) => !v)}>
              {showBranchForm ? 'Cancel' : 'Add branch'}
            </Button>
          </div>
        }
      />

      {error ? <MessageBanner tone="error">{error}</MessageBanner> : null}
      {success ? <MessageBanner tone="success">{success}</MessageBanner> : null}

      <section className="grid gap-3 sm:gap-4 sm:grid-cols-3">
        <StatCard label="Branches" value={String(branches.length)} />
        <StatCard label="Pending / in-transit transfers" value={String(pendingTransfers)} />
        <StatCard label="Low-stock alerts" value={String(totalLowStock)} hint="Across all branches" />
      </section>

      {showBranchForm ? (
        <Card className="border-slate-200">
          <h3 className="mb-3 text-lg font-semibold text-slate-900">Add branch</h3>
          <form className="grid gap-3 md:grid-cols-4" onSubmit={handleCreateBranch}>
            <input className={inputClassName} placeholder="Branch name" value={branchForm.name} onChange={(e) => setBranchForm({ ...branchForm, name: e.target.value })} required />
            <input className={inputClassName} placeholder="Address" value={branchForm.address} onChange={(e) => setBranchForm({ ...branchForm, address: e.target.value })} required />
            <input className={inputClassName} placeholder="State code" value={branchForm.stateCode} onChange={(e) => setBranchForm({ ...branchForm, stateCode: e.target.value })} />
            <select className={selectClassName} value={branchForm.managerId} onChange={(e) => setBranchForm({ ...branchForm, managerId: e.target.value })}>
              <option value="">No manager assigned</option>
              {managerOptions.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.role})
                </option>
              ))}
            </select>
            <Button type="submit">Add branch</Button>
          </form>
        </Card>
      ) : null}

      {showTransferForm ? (
        <Card className="border-slate-200">
          <h3 className="mb-3 text-lg font-semibold text-slate-900">Create stock transfer</h3>
          <form className="space-y-3" onSubmit={handleCreateTransfer}>
            <div className="grid gap-3 md:grid-cols-3">
              <select className={selectClassName} value={transferHeader.fromBranchId} onChange={(e) => setTransferHeader({ ...transferHeader, fromBranchId: e.target.value })} required>
                <option value="">From branch</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <select className={selectClassName} value={transferHeader.toBranchId} onChange={(e) => setTransferHeader({ ...transferHeader, toBranchId: e.target.value })} required>
                <option value="">To branch</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
              <input className={inputClassName} placeholder="Notes (optional)" value={transferHeader.notes} onChange={(e) => setTransferHeader({ ...transferHeader, notes: e.target.value })} />
            </div>

            <div className="space-y-2">
              {transferLines.map((line, i) => (
                <div key={i} className="flex flex-wrap items-center gap-2">
                  <select className={cn(selectClassName, 'flex-1 min-w-[10rem]')} value={line.productId} onChange={(e) => updateLine(i, { productId: e.target.value })}>
                    <option value="">Product</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <input type="number" min="1" className={cn(inputClassName, 'w-24')} value={line.quantity} onChange={(e) => updateLine(i, { quantity: e.target.value })} />
                  <button
                    type="button"
                    className="text-sm font-medium text-rose-600 hover:underline disabled:opacity-40"
                    disabled={transferLines.length === 1}
                    onClick={() => setTransferLines((lines) => lines.filter((_, idx) => idx !== i))}
                  >
                    Remove
                  </button>
                </div>
              ))}
              <button type="button" className="text-sm font-medium text-brand hover:underline" onClick={() => setTransferLines((lines) => [...lines, { ...EMPTY_LINE }])}>
                + Add another item
              </button>
            </div>

            <Button type="submit">Create transfer request</Button>
          </form>
        </Card>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {branches.map((b) => (
          <Card key={b.id} className="border-slate-200">
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="font-semibold text-slate-900">{b.name}</h3>
                <p className="text-sm text-slate-500">
                  {b.address} · State {b.stateCode}
                </p>
              </div>
              {(b.lowStockCount ?? 0) > 0 ? (
                <span className="inline-flex shrink-0 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">
                  {b.lowStockCount} low stock
                </span>
              ) : null}
            </div>
            <p className="mt-2 text-xs text-slate-500">
              {b._count?.users ?? 0} staff · {b._count?.invoices ?? 0} invoices
            </p>
            <label className="mt-3 block space-y-1 text-xs font-medium text-slate-600">
              <span>Branch manager</span>
              <select className={cn(selectClassName, 'text-sm')} value={b.managerId ?? ''} onChange={(e) => handleAssignManager(b.id, e.target.value)}>
                <option value="">Unassigned</option>
                {managerOptions.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name} ({m.role})
                  </option>
                ))}
              </select>
            </label>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="mt-3"
              onClick={() =>
                apiWithAuth(`/branches/${b.id}/stock/init`, { method: 'POST' })
                  .then(() => setSuccess(`Stock initialized for ${b.name}`))
                  .catch((err) => setError(parseError(err)))
              }
            >
              Init branch stock
            </Button>
          </Card>
        ))}
      </section>

      {pnl ? (
        <Card className="border-slate-200">
          <h3 className="mb-1 text-lg font-semibold text-slate-900">Consolidated branch P&amp;L — this financial year</h3>
          <p className="mb-4 text-sm text-slate-500">
            Net profit = sale revenue + delivered-repair revenue − cost of goods sold.{' '}
            <span className="font-semibold text-slate-700">Total: {formatINR(toNumber(pnl.totalNetProfit))}</span>
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {pnl.branches.map((b) => (
              <div key={b.branchId} className="rounded-xl border border-slate-200 p-3 text-sm">
                <p className="font-semibold text-slate-900">{b.branchName}</p>
                <div className="mt-2 space-y-1 text-xs text-slate-600">
                  <div className="flex justify-between">
                    <span>Sales revenue</span>
                    <span>{formatINR(b.revenue)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Repair revenue</span>
                    <span>{formatINR(b.repairRevenue)}</span>
                  </div>
                  <div className="flex justify-between text-rose-600">
                    <span>Cost of goods</span>
                    <span>-{formatINR(b.cogs)}</span>
                  </div>
                  <div className="flex justify-between border-t border-slate-100 pt-1 font-semibold text-slate-900">
                    <span>Net profit</span>
                    <span>{formatINR(b.netProfit)}</span>
                  </div>
                </div>
                <p className="mt-2 text-[11px] text-slate-400">
                  {b.invoiceCount} invoices · {b.repairCount} repairs delivered
                </p>
              </div>
            ))}
          </div>
        </Card>
      ) : null}

      <Card className="border-slate-200">
        <h3 className="mb-4 text-lg font-semibold text-slate-900">Transfers</h3>
        {loading ? (
          <p className="py-8 text-center text-sm text-slate-500">Loading…</p>
        ) : !transfers.length ? (
          <EmptyState title="No transfers yet" description="Create a transfer above to move stock between branches." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className={tableHeaderClassName}>Route</th>
                  <th className={tableHeaderClassName}>Items</th>
                  <th className={tableHeaderClassName}>Status</th>
                  <th className={cn(tableHeaderClassName, 'text-right')}>Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {transfers.map((t) => (
                  <tr key={t.id}>
                    <td className={tableCellClassName}>
                      {t.fromBranch.name} → {t.toBranch.name}
                      {t.notes ? <p className="text-xs text-slate-500">{t.notes}</p> : null}
                    </td>
                    <td className={tableCellClassName}>
                      {t.items.map((it) => `${it.product.name} ×${it.quantity}`).join(', ')}
                    </td>
                    <td className={tableCellClassName}>
                      <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-medium', TRANSFER_STATUS_STYLE[t.status])}>
                        {t.status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className={cn(tableCellClassName, 'text-right')}>
                      <div className="flex justify-end">
                        <RowActionsMenu
                          actions={[
                            {
                              key: 'dispatch',
                              label: 'Dispatch',
                              hidden: t.status !== 'PENDING',
                              onClick: () => handleTransferAction(t.id, 'dispatch'),
                            },
                            {
                              key: 'receive',
                              label: 'Receive',
                              hidden: t.status !== 'IN_TRANSIT',
                              onClick: () => handleTransferAction(t.id, 'receive'),
                            },
                            {
                              key: 'cancel',
                              label: 'Cancel',
                              tone: 'danger',
                              hidden: t.status !== 'PENDING' && t.status !== 'IN_TRANSIT',
                              onClick: () => handleTransferAction(t.id, 'cancel'),
                            },
                          ]}
                        />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
