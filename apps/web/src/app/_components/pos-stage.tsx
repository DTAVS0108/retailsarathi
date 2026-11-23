'use client';

import { LivePulseDot } from '@/app/_components/live-objects';

const LINES = [
  { name: 'Redmi Note 13 Pro', meta: 'IMEI …4821', qty: 1, amt: '₹24,999' },
  { name: 'Spigen Clear Case', meta: 'SKU · SP-13', qty: 1, amt: '₹899' },
  { name: 'Tempered Glass', meta: 'SKU · TG-U', qty: 2, amt: '₹598' },
];

/**
 * Theme-native POS preview — no stock photo wash.
 * Reads --rs-* so Midnight / Ruby / Teal all look intentional.
 */
export function PosStage({ className = '' }: { className?: string }) {
  return (
    <div className={`relative ${className}`}>
      {/* Perspective stage floor */}
      <div
        aria-hidden
        className="pointer-events-none absolute -inset-x-8 -bottom-10 top-1/3 rounded-[50%] opacity-40 blur-2xl"
        style={{
          background:
            'radial-gradient(ellipse at center, color-mix(in srgb, var(--rs-accent) 45%, transparent), transparent 70%)',
        }}
      />

      <div
        className="relative origin-bottom transition-transform duration-700 ease-out will-change-transform [transform:perspective(1400px)_rotateY(-8deg)_rotateX(4deg)] hover:[transform:perspective(1400px)_rotateY(-3deg)_rotateX(2deg)]"
      >
        {/* Device bezel */}
        <div
          className="overflow-hidden rounded-[1.35rem] border shadow-2xl"
          style={{
            borderColor: 'color-mix(in srgb, var(--rs-header-ink) 20%, transparent)',
            background: 'var(--rs-surface)',
            boxShadow: '0 28px 60px -18px rgba(0,0,0,0.45), var(--rs-shadow)',
            color: 'var(--rs-ink)',
          }}
        >
          {/* Title bar */}
          <div
            className="flex items-center justify-between gap-3 border-b px-4 py-3"
            style={{
              borderColor: 'var(--rs-border)',
              background: 'var(--rs-header)',
              color: 'var(--rs-header-ink)',
            }}
          >
            <div className="flex items-center gap-2">
              <LivePulseDot />
              <span className="text-sm font-semibold tracking-tight">Counter POS</span>
            </div>
            <div className="flex items-center gap-2 text-[11px] opacity-85">
              <span
                className="rounded-md px-2 py-0.5 font-medium"
                style={{ background: 'color-mix(in srgb, var(--rs-header-ink) 14%, transparent)' }}
              >
                Offline OK
              </span>
              <span>Branch · Main</span>
            </div>
          </div>

          <div className="grid sm:grid-cols-[1.05fr_0.95fr]">
            {/* Catalog */}
            <div className="border-b p-3 sm:border-b-0 sm:border-r" style={{ borderColor: 'var(--rs-border)' }}>
              <div
                className="mb-3 rounded-xl border px-3 py-2 text-xs"
                style={{ borderColor: 'var(--rs-border)', background: 'var(--rs-surface-2)', color: 'var(--rs-muted)' }}
              >
                Scan barcode or search SKU…
              </div>
              <ul className="space-y-2">
                {[
                  { n: 'iPhone 15 128GB', p: '₹69,900', t: 'Phones' },
                  { n: 'Realme Buds Air 5', p: '₹3,499', t: 'Audio' },
                  { n: '65W GaN Charger', p: '₹1,299', t: 'Accessories' },
                ].map((p) => (
                  <li
                    key={p.n}
                    className="flex items-center justify-between rounded-xl border px-3 py-2.5"
                    style={{ borderColor: 'var(--rs-border)', background: 'var(--rs-surface-2)' }}
                  >
                    <div>
                      <p className="text-sm font-semibold" style={{ color: 'var(--rs-ink)' }}>
                        {p.n}
                      </p>
                      <p className="text-[11px]" style={{ color: 'var(--rs-muted)' }}>
                        {p.t}
                      </p>
                    </div>
                    <span className="text-sm font-semibold" style={{ color: 'var(--rs-accent)' }}>
                      {p.p}
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Cart */}
            <div className="flex flex-col p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-[0.14em]" style={{ color: 'var(--rs-muted)' }}>
                  This bill
                </p>
                <p className="text-xs font-medium" style={{ color: 'var(--rs-accent)' }}>
                  Walk-in
                </p>
              </div>
              <ul className="flex-1 space-y-2">
                {LINES.map((line) => (
                  <li key={line.name} className="flex items-start justify-between gap-2 text-sm">
                    <div className="min-w-0">
                      <p className="truncate font-medium" style={{ color: 'var(--rs-ink)' }}>
                        {line.name}
                      </p>
                      <p className="text-[11px]" style={{ color: 'var(--rs-muted)' }}>
                        {line.meta} · ×{line.qty}
                      </p>
                    </div>
                    <span className="shrink-0 font-semibold tabular-nums">{line.amt}</span>
                  </li>
                ))}
              </ul>
              <div className="mt-3 border-t pt-3" style={{ borderColor: 'var(--rs-border)' }}>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-[11px]" style={{ color: 'var(--rs-muted)' }}>
                      Grand total · GST incl.
                    </p>
                    <p className="font-display text-2xl font-semibold tabular-nums" style={{ color: 'var(--rs-ink)' }}>
                      ₹26,496
                    </p>
                  </div>
                  <span
                    className="rounded-xl px-4 py-2.5 text-sm font-semibold"
                    style={{ background: 'var(--rs-accent)', color: 'var(--rs-on-accent)' }}
                  >
                    Pay
                  </span>
                </div>
                <div className="mt-3 flex gap-1.5">
                  {['UPI', 'Cash', 'Card'].map((m, i) => (
                    <span
                      key={m}
                      className="rounded-lg px-2.5 py-1 text-[11px] font-semibold"
                      style={{
                        background: i === 0 ? 'var(--rs-accent-soft)' : 'var(--rs-surface-2)',
                        color: i === 0 ? 'var(--rs-accent)' : 'var(--rs-muted)',
                        border: `1px solid ${i === 0 ? 'transparent' : 'var(--rs-border)'}`,
                      }}
                    >
                      {m}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Floating tickets */}
        <div
          className="absolute -left-3 top-10 hidden animate-soft-float rounded-xl border px-3 py-2 text-sm font-semibold shadow-lg sm:block"
          style={{
            background: 'var(--rs-accent)',
            color: 'var(--rs-on-accent)',
            borderColor: 'transparent',
            animationDelay: '0.2s',
          }}
        >
          ₹19,148
          <span className="mt-0.5 block text-[10px] font-medium opacity-90">UPI settled</span>
        </div>
        <div
          className="absolute -right-2 top-24 hidden animate-soft-float rounded-xl border px-3 py-2 text-sm font-semibold shadow-lg backdrop-blur-md sm:block"
          style={{
            background: 'color-mix(in srgb, var(--rs-surface) 94%, transparent)',
            color: 'var(--rs-ink)',
            borderColor: 'var(--rs-border)',
            animationDelay: '0.8s',
          }}
        >
          IMEI locked
          <span className="mt-0.5 block text-[10px] font-medium" style={{ color: 'var(--rs-muted)' }}>
            Stock −1 · synced
          </span>
        </div>
        <div
          className="absolute -bottom-3 left-1/2 hidden -translate-x-1/2 animate-soft-float rounded-xl border px-3 py-2 text-xs font-semibold shadow-lg sm:flex sm:items-center sm:gap-2"
          style={{
            background: 'color-mix(in srgb, var(--rs-accent-secondary) 90%, white)',
            color: '#0F172A',
            borderColor: 'transparent',
            animationDelay: '1.2s',
          }}
        >
          <span className="font-mono text-[10px] opacity-70">80mm</span>
          Thermal GST · printing…
        </div>
      </div>
    </div>
  );
}

/** Animated receipt strip for login rail */
export function ReceiptTicker() {
  const rows = [
    { inv: 'INV-1042', amt: '₹8,499', pay: 'UPI' },
    { inv: 'INV-1043', amt: '₹24,999', pay: 'Split' },
    { inv: 'INV-1044', amt: '₹1,299', pay: 'Cash' },
    { inv: 'INV-1045', amt: '₹56,200', pay: 'Card' },
  ];
  return (
    <div
      className="overflow-hidden rounded-2xl border"
      style={{
        borderColor: 'color-mix(in srgb, var(--rs-header-ink) 18%, transparent)',
        background: 'color-mix(in srgb, var(--rs-header-ink) 8%, transparent)',
      }}
    >
      <div
        className="flex items-center justify-between border-b px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.16em]"
        style={{
          borderColor: 'color-mix(in srgb, var(--rs-header-ink) 14%, transparent)',
          color: 'color-mix(in srgb, var(--rs-header-ink) 75%, transparent)',
        }}
      >
        <span>Today at counter</span>
        <span className="inline-flex items-center gap-1.5 normal-case tracking-normal">
          <LivePulseDot />
          Live
        </span>
      </div>
      <ul className="divide-y" style={{ borderColor: 'color-mix(in srgb, var(--rs-header-ink) 12%, transparent)' }}>
        {rows.map((r, i) => (
          <li
            key={r.inv}
            className="flex items-center justify-between px-4 py-2.5 text-sm animate-soft-float"
            style={{
              animationDelay: `${i * 0.35}s`,
              borderColor: 'color-mix(in srgb, var(--rs-header-ink) 12%, transparent)',
            }}
          >
            <span className="font-mono text-xs opacity-80">{r.inv}</span>
            <span className="font-semibold tabular-nums">{r.amt}</span>
            <span
              className="rounded-md px-2 py-0.5 text-[10px] font-semibold"
              style={{ background: 'color-mix(in srgb, var(--rs-header-ink) 12%, transparent)' }}
            >
              {r.pay}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
