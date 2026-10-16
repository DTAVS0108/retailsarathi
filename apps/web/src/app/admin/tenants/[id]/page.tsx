'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Badge, Button, Card, formatINR } from '@retail-sarathi/ui';
import { MessageBanner, EmptyState, toNumber } from '@/app/dashboard/_components/dashboard-ui';
import { BrandLogo } from '@/app/_components/brand-logo';
import { confirmDialog } from '@/app/_components/confirm-dialog';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '/api/v1';

async function platformFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('platformToken');
  const res = await fetch(`${API_BASE}${path}`, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...opts.headers },
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<T>;
}

type TenantDetail = {
  id: string;
  name: string;
  gstin: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  isSuspended: boolean;
  suspendedAt: string | null;
  suspendedReason: string | null;
  subscriptionStatus: string;
  plan: { name: string; priceMonthly: number | string } | null;
  usage: { users: number; products: number; branches: number; invoices: number };
  createdAt: string;
  tickets: Array<{ id: string; subject: string; status: string; createdAt: string }>;
  subscriptionInvoices: Array<{ id: string; action: string; amount: number | string; planCode: string; createdAt: string }>;
};

export default function TenantDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [tenant, setTenant] = useState<TenantDetail | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!localStorage.getItem('platformToken')) {
      router.replace('/admin');
      return;
    }
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  async function load() {
    try {
      const t = await platformFetch<TenantDetail>(`/platform/tenants/${params.id}`);
      setTenant(t);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load tenant');
    }
  }

  async function suspend() {
    const reason = window.prompt(`Suspend "${tenant?.name}"? Enter a reason:`, '');
    if (reason === null) return;
    try {
      setBusy(true);
      await platformFetch(`/platform/tenants/${params.id}/suspend`, { method: 'POST', body: JSON.stringify({ reason }) });
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function reactivate() {
    const ok = await confirmDialog.confirm({ title: 'Reactivate tenant?', message: `Restore access for "${tenant?.name}"?`, confirmLabel: 'Reactivate' });
    if (!ok) return;
    try {
      setBusy(true);
      await platformFetch(`/platform/tenants/${params.id}/reactivate`, { method: 'POST' });
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--rs-bg)', color: 'var(--rs-ink)' }}>
      <header
        className="flex items-center justify-between px-6 py-4"
        style={{ background: 'var(--rs-header)', color: 'var(--rs-header-ink)', borderBottom: '1px solid var(--rs-border)' }}
      >
        <BrandLogo size="sm" light subtitle="Platform" />
        <button type="button" className="text-sm font-medium" style={{ color: 'var(--rs-header-ink)' }} onClick={() => router.push('/admin')}>
          ← Back to tenants
        </button>
      </header>
      <main className="space-y-6 p-6 lg:p-8">
        {error ? <MessageBanner tone="error">{error}</MessageBanner> : null}
        {!tenant ? (
          <EmptyState title="Loading…" description="Fetching tenant detail." />
        ) : (
          <>
            <Card>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h1 className="text-xl font-semibold">{tenant.name}</h1>
                    {tenant.isSuspended ? <Badge color="red">Suspended</Badge> : <Badge color="green">Active</Badge>}
                  </div>
                  <p className="mt-1 text-sm text-rs-muted">
                    {tenant.gstin || 'No GSTIN'} · {tenant.email || 'No email'} · {tenant.phone || 'No phone'}
                  </p>
                  {tenant.isSuspended && tenant.suspendedReason ? (
                    <p className="mt-1 text-xs text-red-700">Suspended: {tenant.suspendedReason}</p>
                  ) : null}
                </div>
                {tenant.isSuspended ? (
                  <Button type="button" variant="secondary" disabled={busy} onClick={() => void reactivate()}>
                    Reactivate
                  </Button>
                ) : (
                  <Button type="button" variant="secondary" disabled={busy} onClick={() => void suspend()}>
                    Suspend
                  </Button>
                )}
              </div>
            </Card>

            <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {([
                ['Plan', tenant.plan?.name ?? 'None'],
                ['Users', String(tenant.usage.users)],
                ['Products', String(tenant.usage.products)],
                ['Branches', String(tenant.usage.branches)],
              ] as Array<[string, string]>).map(([label, value]) => (
                <Card key={label} className="p-1">
                  <div className="space-y-2.5 p-3">
                    <p className="text-sm font-medium text-rs-muted">{label}</p>
                    <p className="text-2xl font-semibold tracking-tight text-rs-ink">{value}</p>
                  </div>
                </Card>
              ))}
            </section>

            <Card>
              <h3 className="mb-3 text-lg font-semibold">Billing history (demo)</h3>
              {tenant.subscriptionInvoices.length ? (
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs font-medium uppercase tracking-wide text-rs-muted">
                      <th className="px-3 py-2">When</th>
                      <th className="px-3 py-2">Action</th>
                      <th className="px-3 py-2">Plan</th>
                      <th className="px-3 py-2">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenant.subscriptionInvoices.map((inv) => (
                      <tr key={inv.id} className="border-t" style={{ borderColor: 'var(--rs-border)' }}>
                        <td className="px-3 py-2">{new Date(inv.createdAt).toLocaleDateString('en-IN')}</td>
                        <td className="px-3 py-2">{inv.action.replace(/_/g, ' ')}</td>
                        <td className="px-3 py-2">{inv.planCode}</td>
                        <td className="px-3 py-2">{formatINR(toNumber(inv.amount))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-rs-muted">No plan changes recorded.</p>
              )}
            </Card>

            <Card>
              <h3 className="mb-3 text-lg font-semibold">Support tickets</h3>
              {tenant.tickets.length ? (
                tenant.tickets.map((tk) => (
                  <div key={tk.id} className="mb-2 flex items-center justify-between rounded-xl border px-3 py-2 text-sm" style={{ borderColor: 'var(--rs-border)' }}>
                    <span>{tk.subject}</span>
                    <Badge color={tk.status === 'OPEN' ? 'amber' : 'green'}>{tk.status}</Badge>
                  </div>
                ))
              ) : (
                <p className="text-sm text-rs-muted">No tickets from this tenant.</p>
              )}
            </Card>
          </>
        )}
      </main>
    </div>
  );
}
