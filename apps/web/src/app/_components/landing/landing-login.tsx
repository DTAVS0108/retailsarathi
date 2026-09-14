'use client';

import Link from 'next/link';
import { ChromeBackdrop } from '@/app/_components/chrome-backdrop';
import { revealClass, useScrollReveal } from './use-scroll-reveal';

const SHOP_EMAIL = 'owner@demo.retailsarathi.in';
const SHOP_PASSWORD = 'Demo@123';
const ADMIN_EMAIL = 'admin@retailsarathi.in';
const ADMIN_PASSWORD = 'Admin@123';

export function LandingLogin() {
  const { ref, visible } = useScrollReveal<HTMLElement>();

  return (
    <section id="login" ref={ref} className="relative overflow-hidden py-20 lg:py-28">
      <div className="absolute inset-0" style={{ background: 'var(--rs-header)' }} />
      <ChromeBackdrop variant="header" intensity="soft" />

      <div className="relative mx-auto grid w-[80%] gap-10 lg:grid-cols-2 lg:items-center lg:gap-14">
        <div className={revealClass(visible)} style={{ color: 'var(--rs-header-ink)' }}>
          <p
            className="text-xs font-semibold uppercase tracking-[0.28em]"
            style={{ color: 'color-mix(in srgb, var(--rs-header-ink) 88%, transparent)' }}
          >
            Access
          </p>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl text-balance">
            Sign in to RetailSarathi
          </h2>
          <p
            className="mt-4 text-base leading-relaxed"
            style={{ color: 'color-mix(in srgb, var(--rs-header-ink) 90%, transparent)' }}
          >
            Use shop credentials for the dashboard, or admin credentials for the platform console.
          </p>
        </div>

        <div
          className={`rounded-3xl border p-8 shadow-2xl ${revealClass(visible, '', 'scale')}`}
          style={{
            ...(visible ? { animationDelay: '0.15s' } : {}),
            borderColor: 'color-mix(in srgb, var(--rs-header-ink) 18%, transparent)',
            background: 'color-mix(in srgb, var(--rs-surface) 96%, transparent)',
            color: 'var(--rs-ink)',
          }}
        >
          <h3 className="font-display text-xl font-semibold" style={{ color: 'var(--rs-ink)' }}>
            Credentials
          </h3>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--rs-border)', background: 'var(--rs-surface-2)' }}>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--rs-accent)' }}>
                Shop
              </p>
              <p className="mt-2 font-mono text-xs break-all" style={{ color: 'var(--rs-ink)' }}>
                {SHOP_EMAIL}
              </p>
              <p className="font-mono text-xs" style={{ color: 'var(--rs-ink)' }}>
                {SHOP_PASSWORD}
              </p>
            </div>
            <div className="rounded-2xl border p-4" style={{ borderColor: 'var(--rs-border)', background: 'var(--rs-surface-2)' }}>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--rs-ink)' }}>
                Admin
              </p>
              <p className="mt-2 font-mono text-xs break-all" style={{ color: 'var(--rs-ink)' }}>
                {ADMIN_EMAIL}
              </p>
              <p className="font-mono text-xs" style={{ color: 'var(--rs-ink)' }}>
                {ADMIN_PASSWORD}
              </p>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3 sm:flex-row">
            <Link
              href="/login"
              className="inline-flex flex-1 items-center justify-center rounded-xl px-5 py-3 text-sm font-semibold"
              style={{ background: 'var(--rs-accent)', color: 'var(--rs-on-accent)' }}
            >
              Shop sign in
            </Link>
            <Link
              href="/admin"
              className="inline-flex flex-1 items-center justify-center rounded-xl border px-5 py-3 text-sm font-semibold"
              style={{ borderColor: 'var(--rs-border)', color: 'var(--rs-ink)', background: 'var(--rs-surface)' }}
            >
              Admin console
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
