'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast, feedbackMessage } from '@/app/_components/toast';
import { BrandLogo } from '@/app/_components/brand-logo';
import { ChromeBackdrop } from '@/app/_components/chrome-backdrop';
import { ReceiptTicker } from '@/app/_components/pos-stage';
import { login } from '@/lib/api';
import { clearShopBranding } from '@/lib/shop-branding';

const SHOP_EMAIL = 'owner@demo.retailsarathi.in';
const SHOP_PASSWORD = 'Demo@123';
const ADMIN_EMAIL = 'admin@retailsarathi.in';
const ADMIN_PASSWORD = 'Admin@123';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState(SHOP_EMAIL);
  const [password, setPassword] = useState(SHOP_PASSWORD);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function fillShop() {
    setEmail(SHOP_EMAIL);
    setPassword(SHOP_PASSWORD);
  }

  function fillAdmin() {
    setEmail(ADMIN_EMAIL);
    setPassword(ADMIN_PASSWORD);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');
    try {
      // Platform admin uses /admin — shop users use this login
      if (email.trim().toLowerCase() === ADMIN_EMAIL) {
        router.push('/admin');
        toast.success('Opening platform admin. Sign in there with admin credentials.');
        return;
      }
      // Drop stale session/branding from a previous shop so dashboard loads this tenant's data.
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      clearShopBranding();

      const res = await login(email, password);
      localStorage.setItem('token', res.accessToken);
      localStorage.setItem('user', JSON.stringify(res.user));
      toast.success('Signed in successfully.');
      router.push('/dashboard');
    } catch (err) {
      const msg = feedbackMessage(err, 'Login failed. Check email and password.');
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-dvh flex-col lg:flex-row" style={{ background: 'var(--rs-bg)' }}>
      <div
        className="relative hidden overflow-hidden lg:flex lg:w-[42%] lg:flex-col lg:justify-between lg:p-12"
        style={{ background: 'var(--rs-header)', color: 'var(--rs-header-ink)' }}
      >
        <ChromeBackdrop variant="header" intensity="normal" />
        <div className="relative">
          <Link href="/">
            <BrandLogo size="lg" light />
          </Link>
          <p className="mt-8 max-w-sm font-display text-3xl font-semibold leading-tight">
            Sign in to your shop
          </p>
          <p className="mt-4 max-w-sm text-sm leading-relaxed opacity-85">
            Access POS, stock, GST, ledgers, and repairs from the dashboard.
          </p>
          <div className="mt-8">
            <ReceiptTicker />
          </div>
        </div>

        <div className="relative space-y-4">
          <div
            className="rounded-2xl border p-5"
            style={{
              borderColor: 'color-mix(in srgb, var(--rs-header-ink) 18%, transparent)',
              background: 'color-mix(in srgb, var(--rs-header-ink) 10%, transparent)',
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide opacity-80">Shop credentials</p>
              <button
                type="button"
                onClick={fillShop}
                className="text-xs font-semibold underline opacity-90 hover:opacity-100"
              >
                Use these
              </button>
            </div>
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="opacity-70">Email</dt>
                <dd className="font-mono text-[13px]">{SHOP_EMAIL}</dd>
              </div>
              <div>
                <dt className="opacity-70">Password</dt>
                <dd className="font-mono text-[13px]">{SHOP_PASSWORD}</dd>
              </div>
            </dl>
          </div>

          <div
            className="rounded-2xl border p-5"
            style={{
              borderColor: 'color-mix(in srgb, var(--rs-header-ink) 18%, transparent)',
              background: 'color-mix(in srgb, var(--rs-header-ink) 10%, transparent)',
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs font-semibold uppercase tracking-wide opacity-80">Admin credentials</p>
              <button
                type="button"
                onClick={fillAdmin}
                className="text-xs font-semibold underline opacity-90 hover:opacity-100"
              >
                Use these
              </button>
            </div>
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="opacity-70">Username</dt>
                <dd className="font-mono text-[13px]">{ADMIN_EMAIL}</dd>
              </div>
              <div>
                <dt className="opacity-70">Password</dt>
                <dd className="font-mono text-[13px]">{ADMIN_PASSWORD}</dd>
              </div>
            </dl>
            <p className="mt-3 text-xs opacity-75">
              Platform console at{' '}
              <Link href="/admin" className="underline">
                /admin
              </Link>
            </p>
          </div>
        </div>
      </div>

      <div
        className="flex flex-1 flex-col justify-center px-5 py-10 sm:px-8"
        style={{ background: 'var(--rs-bg)', color: 'var(--rs-ink)' }}
      >
        <div className="mx-auto w-full max-w-md">
          <Link href="/">
            <BrandLogo size="md" className="lg:hidden" />
          </Link>

          <div
            className="mt-6 rounded-3xl border p-8 shadow-sm lg:mt-0"
            style={{
              borderColor: 'var(--rs-border)',
              background: 'var(--rs-surface)',
              boxShadow: 'var(--rs-shadow)',
            }}
          >
            <h1 className="font-display text-2xl font-semibold" style={{ color: 'var(--rs-ink)' }}>
              Sign in
            </h1>
            <p className="mt-1 text-sm" style={{ color: 'var(--rs-muted)' }}>
              Shop dashboard or use admin credentials for the platform console
            </p>

            <div className="mt-4 space-y-3 lg:hidden">
              <div
                className="rounded-xl border p-4 text-sm"
                style={{ borderColor: 'var(--rs-border)', background: 'var(--rs-accent-soft)' }}
              >
                <div className="flex items-center justify-between">
                  <p className="font-semibold" style={{ color: 'var(--rs-accent)' }}>
                    Shop
                  </p>
                  <button type="button" onClick={fillShop} className="text-xs font-semibold underline" style={{ color: 'var(--rs-accent)' }}>
                    Use
                  </button>
                </div>
                <p className="mt-1 font-mono text-xs" style={{ color: 'var(--rs-ink)' }}>
                  {SHOP_EMAIL}
                </p>
                <p className="font-mono text-xs" style={{ color: 'var(--rs-ink)' }}>
                  {SHOP_PASSWORD}
                </p>
              </div>
              <div
                className="rounded-xl border p-4 text-sm"
                style={{ borderColor: 'var(--rs-border)', background: 'var(--rs-surface-2)' }}
              >
                <div className="flex items-center justify-between">
                  <p className="font-semibold" style={{ color: 'var(--rs-ink)' }}>
                    Admin
                  </p>
                  <button type="button" onClick={fillAdmin} className="text-xs font-semibold underline" style={{ color: 'var(--rs-accent)' }}>
                    Use
                  </button>
                </div>
                <p className="mt-1 font-mono text-xs" style={{ color: 'var(--rs-ink)' }}>
                  {ADMIN_EMAIL}
                </p>
                <p className="font-mono text-xs" style={{ color: 'var(--rs-ink)' }}>
                  {ADMIN_PASSWORD}
                </p>
                <Link href="/admin" className="mt-2 inline-block text-xs font-semibold underline" style={{ color: 'var(--rs-accent)' }}>
                  Open /admin →
                </Link>
              </div>
            </div>

            {error ? (
              <div
                role="alert"
                className="mt-4 flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
              >
                <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-red-100 text-xs font-bold text-red-700">
                  !
                </span>
                <div>
                  <p className="font-semibold">Could not sign in</p>
                  <p className="mt-0.5 leading-5 opacity-90">{error}</p>
                </div>
              </div>
            ) : null}

            <form onSubmit={(e) => void handleSubmit(e)} className="mt-6 space-y-4">
              <label className="block text-sm">
                <span className="font-medium" style={{ color: 'var(--rs-ink)' }}>
                  Email
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="username"
                  className="mt-1.5 w-full rounded-xl border px-3.5 py-3 text-sm outline-none transition focus:border-[var(--rs-accent)]"
                  style={{
                    borderColor: 'var(--rs-border)',
                    background: 'var(--rs-surface)',
                    color: 'var(--rs-ink)',
                  }}
                  required
                />
              </label>

              <label className="block text-sm">
                <span className="font-medium" style={{ color: 'var(--rs-ink)' }}>
                  Password
                </span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                  className="mt-1.5 w-full rounded-xl border px-3.5 py-3 text-sm outline-none transition focus:border-[var(--rs-accent)]"
                  style={{
                    borderColor: 'var(--rs-border)',
                    background: 'var(--rs-surface)',
                    color: 'var(--rs-ink)',
                  }}
                  required
                />
              </label>

              <button
                type="submit"
                disabled={loading}
                className="mt-2 w-full rounded-xl py-3 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60"
                style={{
                  background: 'var(--rs-accent)',
                  color: 'var(--rs-on-accent)',
                }}
              >
                {loading ? 'Signing in…' : 'Sign in'}
              </button>
            </form>

            <p className="mt-6 text-center text-xs" style={{ color: 'var(--rs-muted)' }}>
              <Link href="/" className="font-medium hover:underline" style={{ color: 'var(--rs-accent)' }}>
                ← Back to homepage
              </Link>
              {' · '}
              <Link href="/admin" className="font-medium hover:underline" style={{ color: 'var(--rs-accent)' }}>
                Admin console
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
