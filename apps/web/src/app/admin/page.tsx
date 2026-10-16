'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Badge, Button, Card, formatINR } from '@retail-sarathi/ui';
import { MessageBanner, EmptyState, inputClassName, selectClassName, toNumber } from '@/app/dashboard/_components/dashboard-ui';
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

type Tenant = {
  id: string;
  name: string;
  gstin: string | null;
  subscriptionStatus: string;
  plan: string;
  planCode: string | null;
  isSuspended: boolean;
  users: number;
  products: number;
  branches: number;
  invoices: number;
  createdAt: string;
};

type Ticket = { id: string; subject: string; status: string; tenant?: { name: string } };
type AuditRow = {
  id: string;
  action: string;
  targetType: string;
  targetId: string;
  createdAt: string;
  admin?: { name: string; email: string };
};

type Tab = 'tenants' | 'tickets' | 'activity';

export default function AdminPage() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [tenants, setTenants] = useState<Tenant[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [auditLog, setAuditLog] = useState<AuditRow[]>([]);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('tenants');
  const [busyId, setBusyId] = useState<string | null>(null);

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  useEffect(() => {
    if (localStorage.getItem('platformToken')) {
      setLoggedIn(true);
      void loadData();
    }
  }, []);

  useEffect(() => {
    if (!loggedIn) return;
    void loadTenants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter]);

  async function loadTenants() {
    const params = new URLSearchParams();
    if (search.trim()) params.set('search', search.trim());
    if (statusFilter) params.set('status', statusFilter);
    const qs = params.toString();
    const t = await platformFetch<Tenant[]>(`/platform/tenants${qs ? `?${qs}` : ''}`);
    setTenants(t);
  }

  async function loadData() {
    const [s, t, tk, al] = await Promise.all([
      platformFetch<Record<string, unknown>>('/platform/stats'),
      platformFetch<Tenant[]>('/platform/tenants'),
      platformFetch<Ticket[]>('/platform/tickets'),
      platformFetch<AuditRow[]>('/platform/audit-log').catch(() => []),
    ]);
    setStats(s);
    setTenants(t);
    setTickets(tk);
    setAuditLog(al);
  }

  async function login(e: React.FormEvent) {
    e.preventDefault();
    try {
      const res = await platformFetch<{ token: string }>('/platform/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      localStorage.setItem('platformToken', res.token);
      setLoggedIn(true);
      await loadData();
    } catch {
      setError('Login failed. Run POST /platform/auth/seed first to create admin.');
    }
  }

  async function suspendTenant(tenant: Tenant) {
    const reason = window.prompt(`Suspend "${tenant.name}"? Enter a reason (shown in the audit log):`, '');
    if (reason === null) return;
    try {
      setBusyId(tenant.id);
      await platformFetch(`/platform/tenants/${tenant.id}/suspend`, {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to suspend tenant');
    } finally {
      setBusyId(null);
    }
  }

  async function reactivateTenant(tenant: Tenant) {
    const ok = await confirmDialog.confirm({
      title: 'Reactivate tenant?',
      message: `Restore access for "${tenant.name}"?`,
      confirmLabel: 'Reactivate',
    });
    if (!ok) return;
    try {
      setBusyId(tenant.id);
      await platformFetch(`/platform/tenants/${tenant.id}/reactivate`, { method: 'POST' });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reactivate tenant');
    } finally {
      setBusyId(null);
    }
  }

  async function resolveTicket(ticket: Ticket) {
    try {
      setBusyId(ticket.id);
      await platformFetch(`/platform/tickets/${ticket.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'RESOLVED' }) });
      await loadData();
    } finally {
      setBusyId(null);
    }
  }

  if (!loggedIn) {
    return (
      <div
        className="flex min-h-screen items-center justify-center p-6"
        style={{ background: 'var(--rs-bg)', color: 'var(--rs-ink)' }}
      >
        <Card className="w-full max-w-md p-8">
          <BrandLogo size="md" subtitle="SaaS Admin" />
          <p className="mt-2 text-sm" style={{ color: 'var(--rs-muted)' }}>
            Platform console for tenant management
          </p>
          {error ? <MessageBanner tone="error">{error}</MessageBanner> : null}
          <form className="mt-6 space-y-4" onSubmit={(e) => void login(e)}>
            <input
              className={inputClassName}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              autoComplete="username"
            />
            <input
              className={inputClassName}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
              autoComplete="current-password"
            />
            <Button type="submit" className="w-full">Sign in</Button>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: 'var(--rs-bg)', color: 'var(--rs-ink)' }}>
      <header
        className="flex items-center justify-between px-6 py-4"
        style={{ background: 'var(--rs-header)', color: 'var(--rs-header-ink)', borderBottom: '1px solid var(--rs-border)' }}
      >
        <div className="flex items-center gap-3">
          <BrandLogo size="sm" light subtitle="Platform" />
        </div>
        <button
          type="button"
          className="text-sm font-medium"
          style={{ color: 'var(--rs-header-ink)' }}
          onClick={() => {
            localStorage.removeItem('platformToken');
            setLoggedIn(false);
          }}
        >
          Sign out
        </button>
      </header>
      <main className="space-y-6 p-6 lg:p-8">
        {stats ? (
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
            {([
              ['Tenants', String(stats.tenants)],
              ['Users', String(stats.users)],
              ['Invoices', String(stats.invoices)],
              ['Open tickets', String(stats.openTickets)],
              ['Est. MRR', formatINR(toNumber(stats.estimatedMrr))],
            ] as Array<[string, string]>).map(([label, value]) => (
              <Card key={label} className="border-rs-border bg-rs-surface p-1">
                <div className="space-y-2.5 p-3">
                  <p className="text-sm font-medium text-rs-muted">{label}</p>
                  <p className="text-2xl font-semibold tracking-tight text-rs-ink">{value}</p>
                </div>
              </Card>
            ))}
          </section>
        ) : null}

        <div className="flex flex-wrap gap-2">
          {([
            ['tenants', 'Tenants'],
            ['tickets', 'Support tickets'],
            ['activity', 'Activity log'],
          ] as Array<[Tab, string]>).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className="rounded-full px-4 py-2 text-sm font-medium transition"
              style={
                tab === id
                  ? { background: 'var(--rs-accent)', color: '#fff' }
                  : { background: 'var(--rs-surface-2)', color: 'var(--rs-ink)' }
              }
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'tenants' ? (
          <Card>
            <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <h3 className="text-lg font-semibold">Tenants</h3>
              <div className="flex flex-wrap gap-2">
                <input
                  className={inputClassName}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search name or GSTIN…"
                />
                <select className={selectClassName} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="">All statuses</option>
                  <option value="TRIAL">Trial</option>
                  <option value="ACTIVE">Active</option>
                  <option value="PAST_DUE">Past due</option>
                  <option value="CANCELLED">Cancelled</option>
                </select>
              </div>
            </div>
            {tenants.length ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs font-medium uppercase tracking-wide text-rs-muted">
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Plan</th>
                      <th className="px-3 py-2">Status</th>
                      <th className="px-3 py-2">Users</th>
                      <th className="px-3 py-2">Invoices</th>
                      <th className="px-3 py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {tenants.map((t) => (
                      <tr key={t.id} className="border-t" style={{ borderColor: 'var(--rs-border)' }}>
                        <td className="px-3 py-2">
                          <Link href={`/admin/tenants/${t.id}`} className="font-medium hover:underline" style={{ color: 'var(--rs-accent)' }}>
                            {t.name}
                          </Link>
                          {t.isSuspended ? (
                            <span className="ml-2 inline-block">
                              <Badge color="red">Suspended</Badge>
                            </span>
                          ) : null}
                        </td>
                        <td className="px-3 py-2">{t.plan}</td>
                        <td className="px-3 py-2">{t.subscriptionStatus}</td>
                        <td className="px-3 py-2">{t.users}</td>
                        <td className="px-3 py-2">{t.invoices}</td>
                        <td className="px-3 py-2">
                          {t.isSuspended ? (
                            <Button type="button" size="sm" variant="secondary" disabled={busyId === t.id} onClick={() => void reactivateTenant(t)}>
                              Reactivate
                            </Button>
                          ) : (
                            <Button type="button" size="sm" variant="secondary" disabled={busyId === t.id} onClick={() => void suspendTenant(t)}>
                              Suspend
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="No tenants match" description="Try a different search or clear the status filter." />
            )}
          </Card>
        ) : null}

        {tab === 'tickets' ? (
          <Card>
            <h3 className="mb-3 text-lg font-semibold">Support tickets</h3>
            {tickets.length ? (
              tickets.map((tk) => (
                <div
                  key={tk.id}
                  className="mb-2 flex items-center justify-between rounded-xl border px-3 py-2 text-sm"
                  style={{ borderColor: 'var(--rs-border)', background: 'var(--rs-surface-2)' }}
                >
                  <span>
                    {tk.subject} · {tk.tenant?.name} · <Badge color={tk.status === 'OPEN' ? 'amber' : 'green'}>{tk.status}</Badge>
                  </span>
                  {tk.status === 'OPEN' ? (
                    <Button type="button" size="sm" variant="secondary" disabled={busyId === tk.id} onClick={() => void resolveTicket(tk)}>
                      Resolve
                    </Button>
                  ) : null}
                </div>
              ))
            ) : (
              <EmptyState title="No tickets" description="Support tickets from tenants will show up here." />
            )}
          </Card>
        ) : null}

        {tab === 'activity' ? (
          <Card>
            <h3 className="mb-3 text-lg font-semibold">Activity log</h3>
            {auditLog.length ? (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs font-medium uppercase tracking-wide text-rs-muted">
                      <th className="px-3 py-2">When</th>
                      <th className="px-3 py-2">Admin</th>
                      <th className="px-3 py-2">Action</th>
                      <th className="px-3 py-2">Target</th>
                    </tr>
                  </thead>
                  <tbody>
                    {auditLog.map((row) => (
                      <tr key={row.id} className="border-t" style={{ borderColor: 'var(--rs-border)' }}>
                        <td className="px-3 py-2">{new Date(row.createdAt).toLocaleString('en-IN')}</td>
                        <td className="px-3 py-2">{row.admin?.name ?? '—'}</td>
                        <td className="px-3 py-2">{row.action.replace(/_/g, ' ')}</td>
                        <td className="px-3 py-2">{row.targetType} · {row.targetId.slice(0, 8)}…</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState title="No activity yet" description="Suspend/reactivate a tenant or resolve a ticket to see it logged here." />
            )}
          </Card>
        ) : null}
      </main>
    </div>
  );
}
