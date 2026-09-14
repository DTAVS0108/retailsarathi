'use client';

import Link from 'next/link';
import { LivePulseDot } from '@/app/_components/live-objects';
import { ChromeBackdrop } from '@/app/_components/chrome-backdrop';
import { PosStage } from '@/app/_components/pos-stage';

const BENTO = [
  { k: 'Offline POS', v: 'Bill through fibre cuts' },
  { k: 'IMEI lock', v: 'Shelf → sale → return' },
  { k: 'GST export', v: 'GSTR-1 · 3B · HSN' },
  { k: 'Repairs', v: '6 stages, not WhatsApp' },
];

const FLOW = [
  { n: '01', t: 'Scan' },
  { n: '02', t: 'Split pay' },
  { n: '03', t: 'GST print' },
  { n: '04', t: 'Stock sync' },
];

export function LandingHero() {
  return (
    <section
      className="relative min-h-[100dvh] overflow-hidden"
      style={{
        background: 'var(--rs-header)',
        color: 'var(--rs-header-ink)',
      }}
    >
      <ChromeBackdrop variant="header" intensity="rich" />

      <div className="relative mx-auto w-[80%] pb-16 pt-24 lg:pb-20 lg:pt-28">
        <div className="grid items-center gap-12 lg:grid-cols-[minmax(0,0.95fr)_minmax(0,1.05fr)] lg:gap-16">
          <div className="relative z-10">
            <div
              className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold tracking-wide"
              style={{
                borderColor: 'color-mix(in srgb, var(--rs-header-ink) 22%, transparent)',
                background: 'color-mix(in srgb, var(--rs-header-ink) 8%, transparent)',
              }}
            >
              <LivePulseDot />
              <span>Built for the Indian counter</span>
            </div>

            <h1 className="mt-6 font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl lg:text-[3.6rem]">
              Bill faster.
              <br />
              <span style={{ color: 'var(--rs-accent-secondary)' }}>Stock stays honest.</span>
            </h1>

            <p
              className="mt-5 max-w-lg text-lg leading-relaxed"
              style={{ color: 'color-mix(in srgb, var(--rs-header-ink) 78%, transparent)' }}
            >
              RetailSarathi — सारथी — for electronics shops: offline POS, IMEI, party khata, GST, and
              repairs in one companion.
            </p>

            <div className="mt-8 flex flex-wrap gap-2">
              {FLOW.map((step) => (
                <span
                  key={step.n}
                  className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-semibold"
                  style={{
                    borderColor: 'color-mix(in srgb, var(--rs-header-ink) 18%, transparent)',
                    background: 'color-mix(in srgb, var(--rs-header-ink) 10%, transparent)',
                  }}
                >
                  <span className="font-mono text-[10px]" style={{ color: 'var(--rs-accent-secondary)' }}>
                    {step.n}
                  </span>
                  {step.t}
                </span>
              ))}
            </div>

            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Link
                href="/login"
                className="rs-cta inline-flex items-center justify-center rounded-xl px-6 py-3.5 text-sm font-semibold shadow-lg"
                style={{ background: 'var(--rs-accent)', color: 'var(--rs-on-accent)' }}
              >
                Sign in
              </Link>
              <a
                href="#features"
                className="inline-flex items-center justify-center rounded-xl border px-6 py-3.5 text-sm font-semibold"
                style={{
                  borderColor: 'color-mix(in srgb, var(--rs-header-ink) 28%, transparent)',
                  background: 'color-mix(in srgb, var(--rs-header-ink) 8%, transparent)',
                }}
              >
                See features
              </a>
            </div>

            <p
              className="mt-6 font-mono text-[11px] leading-relaxed sm:text-xs"
              style={{ color: 'color-mix(in srgb, var(--rs-header-ink) 58%, transparent)' }}
            >
              Shop · owner@demo.retailsarathi.in · Demo@123
              <br className="sm:hidden" />
              <span className="hidden sm:inline"> · </span>
              Admin · admin@retailsarathi.in · Admin@123
            </p>
          </div>

          <div className="relative z-10 px-2 sm:px-4 lg:px-0">
            <PosStage />
          </div>
        </div>

        <div className="relative z-10 mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {BENTO.map((cell) => (
            <div
              key={cell.k}
              className="rounded-2xl border p-4 transition-transform duration-300 hover:-translate-y-1"
              style={{
                borderColor: 'color-mix(in srgb, var(--rs-header-ink) 16%, transparent)',
                background: 'color-mix(in srgb, var(--rs-header-ink) 8%, transparent)',
              }}
            >
              <p className="text-sm font-semibold">{cell.k}</p>
              <p
                className="mt-1 text-xs leading-snug"
                style={{ color: 'color-mix(in srgb, var(--rs-header-ink) 70%, transparent)' }}
              >
                {cell.v}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
