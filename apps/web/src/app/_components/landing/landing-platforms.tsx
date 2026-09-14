'use client';

import { revealClass, useScrollReveal } from './use-scroll-reveal';

const platforms = [
  {
    name: 'Desktop',
    role: 'Counter POS',
    tagline: 'Offline-first Electron + SQLite',
    points: [
      'Bill when the fibre is down — queue syncs later',
      'Keyboard-wedge barcode / IMEI friendly',
      'Thermal print + hold / resume bills',
      'Built for the cashier seat, not a browser tab',
    ],
    badge: 'Shop floor',
  },
  {
    name: 'Web',
    role: 'Owner dashboard',
    tagline: 'Reports, stock, GST, ledgers',
    points: [
      'Products, purchases, and party khata',
      'GSTR-1 / GSTR-3B prep exports',
      'Sales insights and repair oversight',
      'Design themes that match your shop mood',
    ],
    badge: 'Back office',
  },
  {
    name: 'Mobile',
    role: 'On the floor',
    tagline: 'Flutter for godown & field',
    points: [
      'Stock checks and quick lookups',
      'Repair status on the move',
      'Party dues when you are not at the desk',
      'Same tenant data as web and desktop',
    ],
    badge: 'Anywhere',
  },
];

const facts = [
  {
    title: 'Who it is for',
    body: 'Electronics, mobile, and repair shops in India — single counters today, multi-branch ready in the schema.',
  },
  {
    title: 'Roles that fit',
    body: 'Owner, Manager, and Cashier permissions so the counter stays fast while books stay controlled.',
  },
  {
    title: 'Compliance built in',
    body: 'HSN lines, place-of-supply tax split, composition toggle, and CA-friendly GST exports — not bolted on later.',
  },
  {
    title: 'Party khata, not just CRM',
    body: 'Customer udhaar and supplier payables with aging, bill allocation, and statements you can share.',
  },
];

export function LandingPlatforms() {
  const { ref, visible } = useScrollReveal<HTMLElement>();

  return (
    <section
      id="platforms"
      ref={ref}
      className="relative border-y py-20 lg:py-28"
      style={{
        borderColor: 'var(--rs-border)',
        background: 'var(--rs-surface)',
      }}
    >
      <div className="relative mx-auto w-[80%]">
        <div className={`max-w-2xl ${revealClass(visible)}`}>
          <p
            className="text-xs font-semibold uppercase tracking-[0.28em]"
            style={{ color: 'var(--rs-accent)' }}
          >
            Platforms
          </p>
          <h2
            className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl text-balance"
            style={{ color: 'var(--rs-ink)' }}
          >
            One shop OS — desktop at the counter, web for the owner, mobile on the floor
          </h2>
          <p className="mt-4 text-base leading-relaxed" style={{ color: 'var(--rs-muted)' }}>
            RetailSarathi is not a single screen. It is a small system that mirrors how Indian retail
            teams already divide work between the till, the godown, and the evening books.
          </p>
        </div>

        {/* Architecture strip */}
        <div
          className={`mt-12 overflow-hidden rounded-[1.75rem] border p-6 sm:p-8 ${revealClass(visible, '', 'scale')}`}
          style={{
            ...(visible ? { animationDelay: '0.1s' } : {}),
            borderColor: 'var(--rs-border)',
            background: 'var(--rs-header)',
            color: 'var(--rs-header-ink)',
            boxShadow: 'var(--rs-shadow)',
          }}
        >
          <p className="text-xs font-semibold uppercase tracking-[0.22em] opacity-80">System map</p>
          <div className="mt-6 flex flex-col items-center gap-3 lg:flex-row lg:justify-between">
            {['Desktop POS', 'Web dashboard', 'Mobile app'].map((label, i) => (
              <div key={label} className="flex w-full flex-1 flex-col items-center gap-3 lg:flex-row lg:gap-4">
                <div
                  className="w-full rounded-2xl border px-4 py-4 text-center text-sm font-semibold backdrop-blur-sm transition-transform duration-300 hover:-translate-y-0.5 lg:text-left"
                  style={{
                    borderColor: 'color-mix(in srgb, var(--rs-header-ink) 20%, transparent)',
                    background: 'color-mix(in srgb, var(--rs-header-ink) 10%, transparent)',
                  }}
                >
                  <span className="mr-2 inline-block h-2 w-2 animate-pulse rounded-full" style={{ background: 'var(--rs-accent-secondary)' }} />
                  {label}
                </div>
                {i < 2 ? (
                  <span
                    aria-hidden
                    className="hidden text-lg opacity-70 lg:inline"
                    style={{ color: 'var(--rs-accent-secondary)' }}
                  >
                    ↔
                  </span>
                ) : null}
                {i < 2 ? (
                  <span aria-hidden className="text-sm opacity-70 lg:hidden">
                    ↕
                  </span>
                ) : null}
              </div>
            ))}
          </div>
          <div className="mt-6 flex justify-center">
            <div
              className="rounded-full px-5 py-2 text-sm font-semibold"
              style={{
                background: 'color-mix(in srgb, var(--rs-header-ink) 14%, transparent)',
              }}
            >
              Nest API · PostgreSQL · tenant-safe sync
            </div>
          </div>
          <p className="mt-4 text-center text-sm opacity-80">
            Same shop data everywhere — offline queue on desktop, live reports on web, lookups on mobile.
          </p>
        </div>

        <div className="mt-10 grid gap-5 lg:grid-cols-3">
          {platforms.map((p, index) => (
            <article
              key={p.name}
              className={`rs-lift flex flex-col rounded-[1.5rem] border p-6 ${revealClass(visible)}`}
              style={{
                ...(visible ? { animationDelay: `${0.12 + index * 0.08}s` } : {}),
                borderColor: 'var(--rs-border)',
                background: 'var(--rs-bg)',
              }}
            >
              <div className="flex items-center justify-between gap-3">
                <p
                  className="text-xs font-semibold uppercase tracking-[0.2em]"
                  style={{ color: 'var(--rs-accent)' }}
                >
                  {p.badge}
                </p>
                <span
                  className="rounded-full px-2.5 py-0.5 text-[11px] font-medium"
                  style={{
                    background: 'var(--rs-accent-soft)',
                    color: 'var(--rs-accent)',
                  }}
                >
                  {p.role}
                </span>
              </div>
              <h3 className="mt-3 font-display text-2xl font-semibold" style={{ color: 'var(--rs-ink)' }}>
                {p.name}
              </h3>
              <p className="mt-1 text-sm font-medium" style={{ color: 'var(--rs-muted)' }}>
                {p.tagline}
              </p>
              <ul className="mt-5 flex-1 space-y-2.5">
                {p.points.map((point) => (
                  <li key={point} className="flex gap-2.5 text-sm leading-relaxed" style={{ color: 'var(--rs-ink)' }}>
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ background: 'var(--rs-accent)' }}
                    />
                    {point}
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>

        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {facts.map((fact, index) => (
            <div
              key={fact.title}
              className={`rounded-2xl border p-5 ${revealClass(visible)}`}
              style={{
                ...(visible ? { animationDelay: `${0.2 + index * 0.05}s` } : {}),
                borderColor: 'var(--rs-border)',
                background: 'var(--rs-surface-2)',
              }}
            >
              <h4 className="font-semibold" style={{ color: 'var(--rs-accent)' }}>
                {fact.title}
              </h4>
              <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--rs-muted)' }}>
                {fact.body}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
