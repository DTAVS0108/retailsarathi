'use client';

import { useEffect, useState } from 'react';
import { Button, Card, formatINR } from '@retail-sarathi/ui';
import { apiWithAuth } from '@/lib/helpers';
import { pageShellClassName, MessageBanner, PageHeader, inputClassName, parseError, selectClassName, toNumber } from '../_components/dashboard-ui';

interface Branch { id: string; name: string; address: string; stateCode: string; _count?: { users: number; invoices: number } }
interface Product { id: string; name: string; sku: string }
interface Transfer { id: string; status: string; fromBranch: { name: string }; toBranch: { name: string }; items: Array<{ product: { name: string }; quantity: number }> }

export default function BranchesPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [pnl, setPnl] = useState<Record<string, unknown> | null>(null);
  const [form, setForm] = useState({ name: '', address: '', stateCode: '' });
  const [transferForm, setTransferForm] = useState({ fromBranchId: '', toBranchId: '', productId: '', quantity: '1', notes: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function load() {
    const year = new Date().getFullYear();
    const [b, t, p, prods] = await Promise.all([
      apiWithAuth<Branch[]>('/branches'),
      apiWithAuth<Transfer[]>('/branches/transfers/list'),
      apiWithAuth<Record<string, unknown>>(`/branches/reports/consolidated-pnl?from=${year}-04-01&to=${year + 1}-03-31`),
      apiWithAuth<{ items: Product[] }>('/products'),
    ]);
    setBranches(b);
    setTransfers(t);
    setPnl(p);
    setProducts(prods.items);
    if (b.length >= 2 && !transferForm.fromBranchId) {
      setTransferForm((f) => ({ ...f, fromBranchId: b[0].id, toBranchId: b[1].id }));
    }
  }

  useEffect(() => { void load().catch((e) => setError(parseError(e))); }, []);

  return (
    <div className={pageShellClassName}>
      <PageHeader title="Multi-Branch" description="Manage branches, inter-branch stock transfers, and consolidated branch P&L." />
      {error ? <MessageBanner tone="error">{error}</MessageBanner> : null}
      {success ? <MessageBanner tone="success">{success}</MessageBanner> : null}
      <Card className="border-slate-200">
        <form className="grid gap-3 md:grid-cols-4" onSubmit={(e) => { e.preventDefault(); void apiWithAuth('/branches', { method: 'POST', body: JSON.stringify(form) }).then(() => { setSuccess('Branch created'); void load(); }).catch((err) => setError(parseError(err))); }}>
          <input className={inputClassName} placeholder="Branch name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input className={inputClassName} placeholder="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} required />
          <input className={inputClassName} placeholder="State code" value={form.stateCode} onChange={(e) => setForm({ ...form, stateCode: e.target.value })} />
          <Button type="submit">Add branch</Button>
        </form>
      </Card>
      <Card className="border-slate-200">
        <h3 className="mb-3 text-lg font-semibold">Create stock transfer</h3>
        <form
          className="grid gap-3 md:grid-cols-2 xl:grid-cols-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (!transferForm.fromBranchId || !transferForm.toBranchId || !transferForm.productId) {
              setError('Select from/to branches and a product.');
              return;
            }
            if (transferForm.fromBranchId === transferForm.toBranchId) {
              setError('From and to branch must differ.');
              return;
            }
            void apiWithAuth('/branches/transfers', {
              method: 'POST',
              body: JSON.stringify({
                fromBranchId: transferForm.fromBranchId,
                toBranchId: transferForm.toBranchId,
                items: [{ productId: transferForm.productId, quantity: toNumber(transferForm.quantity) }],
                notes: transferForm.notes.trim() || undefined,
              }),
            })
              .then(() => {
                setSuccess('Transfer created');
                setTransferForm((f) => ({ ...f, quantity: '1', notes: '' }));
                void load();
              })
              .catch((err) => setError(parseError(err)));
          }}
        >
          <select className={selectClassName} value={transferForm.fromBranchId} onChange={(e) => setTransferForm({ ...transferForm, fromBranchId: e.target.value })} required>
            <option value="">From branch</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select className={selectClassName} value={transferForm.toBranchId} onChange={(e) => setTransferForm({ ...transferForm, toBranchId: e.target.value })} required>
            <option value="">To branch</option>
            {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select className={selectClassName} value={transferForm.productId} onChange={(e) => setTransferForm({ ...transferForm, productId: e.target.value })} required>
            <option value="">Product</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input className={inputClassName} type="number" min="1" placeholder="Qty" value={transferForm.quantity} onChange={(e) => setTransferForm({ ...transferForm, quantity: e.target.value })} required />
          <input className={inputClassName} placeholder="Notes" value={transferForm.notes} onChange={(e) => setTransferForm({ ...transferForm, notes: e.target.value })} />
          <Button type="submit">Create transfer</Button>
        </form>
      </Card>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {branches.map((b) => (
          <Card key={b.id} className="border-slate-200">
            <h3 className="font-semibold">{b.name}</h3>
            <p className="text-sm text-slate-500">{b.address} · State {b.stateCode}</p>
            <p className="mt-2 text-xs text-slate-500">{b._count?.users ?? 0} staff · {b._count?.invoices ?? 0} invoices</p>
            <Button type="button" variant="secondary" className="mt-3" onClick={() => void apiWithAuth(`/branches/${b.id}/stock/init`, { method: 'POST' }).then(() => setSuccess(`Stock initialized for ${b.name}`)).catch((err) => setError(parseError(err)))}>Init branch stock</Button>
          </Card>
        ))}
      </section>
      {pnl ? (
        <Card className="border-slate-200">
          <h3 className="mb-3 text-lg font-semibold">Consolidated branch revenue — {formatINR(toNumber(pnl.totalRevenue))}</h3>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {(pnl.branches as Array<{ branchName: string; revenue: number; invoiceCount: number }>).map((b) => (
              <div key={b.branchName} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <strong>{b.branchName}</strong><br />{formatINR(b.revenue)} · {b.invoiceCount} invoices
              </div>
            ))}
          </div>
        </Card>
      ) : null}
      <Card className="border-slate-200">
        <h3 className="mb-3 text-lg font-semibold">Recent transfers</h3>
        {transfers.length ? transfers.map((t) => (
          <div key={t.id} className="mb-2 flex items-center justify-between rounded-xl border border-slate-200 px-3 py-2 text-sm">
            <span>{t.fromBranch.name} → {t.toBranch.name} · {t.status} · {t.items.length} items</span>
            {t.status === 'PENDING' ? <Button type="button" size="sm" onClick={() => void apiWithAuth(`/branches/transfers/${t.id}/complete`, { method: 'POST' }).then(() => void load())}>Complete</Button> : null}
          </div>
        )) : <p className="text-sm text-slate-500">No transfers yet.</p>}
      </Card>
    </div>
  );
}
