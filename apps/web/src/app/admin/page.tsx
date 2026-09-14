'use client';

import { useEffect, useState } from 'react';
import { Button, Card, formatINR } from '@retail-sarathi/ui';
import { MessageBanner, inputClassName, toNumber } from '@/app/dashboard/_components/dashboard-ui';
import { BrandLogo } from '@/app/_components/brand-logo';

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

export default function AdminPage() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [email, setEmail] = useState('admin@retailsarathi.in');
  const [password, setPassword] = useState('Admin@123');
  const [stats, setStats] = useState<Record<string, unknown> | null>(null);
  const [tenants, setTenants] = useState<Array<Record<string, unknown>>>([]);
  const [tickets, setTickets] = useState<Array<Record<string, unknown>>>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (localStorage.getItem('platformToken')) {
      setLoggedIn(true);
      void loadData();
    }
  }, []);

  async function loadData() {
    const [s, t, tk] = await Promise.all([
      platformFetch<Record<string, unknown>>('/platform/stats'),
      platformFetch<Array<Record<string, unknown>>>('/platform/tenants'),
      platformFetch<Array<Record<string, unknown>>>('/platform/tickets'),
    ]);
    setStats(s);
    setTenants(t);
    setTickets(tk);
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
            <input className={inputClassName} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
            <input className={inputClassName} type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
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
              ['Tenants', stats.tenants],
              ['Users', stats.users],
              ['Invoices', stats.invoices],
              ['Open tickets', stats.openTickets],
              ['Est. MRR', formatINR(toNumber(stats.estimatedMrr))],
            ] as Array<[string, string | number]>).map(([label, value]) => (
              <div
                key={String(label)}
                className="rounded-2xl border p-4"
                style={{ borderColor: 'var(--rs-border)', background: 'var(--rs-surface)', boxShadow: 'var(--rs-shadow)' }}
              >
                <p className="text-xs" style={{ color: 'var(--rs-muted)' }}>{label}</p>
                <p className="text-2xl font-semibold" style={{ color: 'var(--rs-ink)' }}>{String(value)}</p>
              </div>
            ))}
          </section>
        ) : null}
        <section className="grid gap-6 xl:grid-cols-2">
          <Card>
            <h3 className="mb-3 text-lg font-semibold">Tenants</h3>
            {tenants.map((t) => (
              <div
                key={String(t.id)}
                className="mb-2 rounded-xl border px-3 py-2 text-sm"
                style={{ borderColor: 'var(--rs-border)', background: 'var(--rs-surface-2)' }}
              >
                <strong>{String(t.name)}</strong> · {String(t.plan)} · {String(t.users)} users · {String(t.invoices)} invoices
              </div>
            ))}
          </Card>
          <Card>
            <h3 className="mb-3 text-lg font-semibold">Support tickets</h3>
            {tickets.map((tk) => (
              <div
                key={String(tk.id)}
                className="mb-2 flex justify-between rounded-xl border px-3 py-2 text-sm"
                style={{ borderColor: 'var(--rs-border)', background: 'var(--rs-surface-2)' }}
              >
                <span>{String(tk.subject)} · {(tk.tenant as { name: string })?.name}</span>
                <button
                  type="button"
                  className="text-xs font-medium"
                  style={{ color: 'var(--rs-accent)' }}
                  onClick={() => void platformFetch(`/platform/tickets/${tk.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'RESOLVED' }) }).then(() => void loadData())}
                >
                  Resolve
                </button>
              </div>
            ))}
          </Card>
        </section>
      </main>
    </div>
  );
}
