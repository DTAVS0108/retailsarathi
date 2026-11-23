'use client';

import type { ReactNode } from 'react';
import { revealClass, useScrollReveal } from './use-scroll-reveal';

function PosIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75">
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <path d="M7 20h10M9 8h6M9 12h4" strokeLinecap="round" />
    </svg>
  );
}

function StockIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M4 7l8-4 8 4-8 4-8-4z" strokeLinejoin="round" />
      <path d="M4 12l8 4 8-4M4 17l8 4 8-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function RepairIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path
        d="M14.7 6.3a4 4 0 00-5.4 5.4L4 17l3 3 5.3-5.3a4 4 0 005.4-5.4l-2.7 2.7-2-2 2.7-2.7z"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function GstIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M6 4h12v16H6z" strokeLinejoin="round" />
      <path d="M9 8h6M9 12h4M9 16h5" strokeLinecap="round" />
    </svg>
  );
}

function WholesaleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75">
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2.5" />
      <path d="M3 20c0-3 2.5-5 6-5s6 2 6 5" strokeLinecap="round" />
      <path d="M14 20c0-2 1.5-3.5 3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}

function InsightsIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.75">
      <path d="M4 19V5M4 19h16" strokeLinecap="round" />
      <path d="M8 15l3-4 3 2 4-6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

type Feature = {
  icon: ReactNode;
  title: string;
  benefit: string;
  detail: string;
  tag: string;
};

const primaryFeature: Feature = {
  icon: <PosIcon />,
  title: 'Billing & POS',
  benefit: 'Ring up sales in seconds',
  detail:
    'Barcode / IMEI scan, hold-resume bills, split cash·UPI·card·credit, thermal 80mm + A4 GST invoices — even when the fibre drops mid-rush.',
  tag: 'Counter',
};

const modules: Feature[] = [
  {
    icon: <StockIcon />,
    title: 'Stock & IMEI',
    benefit: 'Know every handset on the shelf',
    detail:
      'Serial tracking from GRN to sale, low-stock nudges, purchase bills, CSV import, and spares tied to every invoice and return.',
    tag: 'Godown',
  },
  {
    icon: <RepairIcon />,
    title: 'Repairs',
    benefit: 'Job cards that do not get lost',
    detail:
      'Six-stage workflow: intake → diagnosis → parts → approval → ready → handover, with stock consumption and customer history.',
    tag: 'Service',
  },
  {
    icon: <GstIcon />,
    title: 'GST & Finance',
    benefit: 'Month-end without spreadsheet panic',
    detail:
      'CGST/SGST/IGST from place of supply, HSN lines, GSTR-1 JSON, GSTR-3B summary, composition toggle, and CA-ready exports.',
    tag: 'Books',
  },
  {
    icon: <WholesaleIcon />,
    title: 'Wholesale & ledgers',
    benefit: 'Dealer credit under control',
    detail:
      'Tier pricing, customer udhaar and supplier khata, aging, bill-wise allocation, and statements ready to share on WhatsApp.',
    tag: 'Dealers',
  },
  {
    icon: <InsightsIcon />,
    title: 'Insights',
    benefit: 'See margin, not just turnover',
    detail:
      'Daily sales, category mix, slow movers, and period ledgers so you decide what to stock next week — not just what sold yesterday.',
    tag: 'Owner',
  },
];

export function LandingFeatures() {
  const { ref, visible } = useScrollReveal<HTMLElement>();

  return (
    <section id="features" ref={ref} className="relative overflow-hidden py-20 lg:py-28">
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at bottom left, color-mix(in srgb, var(--rs-accent) 8%, transparent), transparent 50%)',
        }}
      />

      <div className="relative mx-auto w-[80%]">
        <div className={`flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between ${revealClass(visible)}`}>
          <div className="max-w-xl">
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-brand">Features</p>
            <h2
              className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl text-balance"
              style={{ color: 'var(--rs-ink)' }}
            >
              Six modules, one shop-floor rhythm
            </h2>
          </div>
          <p
            className="max-w-md text-base leading-relaxed lg:text-right"
            style={{ color: 'var(--rs-muted)' }}
          >
            Counter, godown, service desk, books, dealers, and owner insights — wired so stock,
            GST, and ledgers stay consistent after every bill.
          </p>
        </div>

        {/* Featured POS strip — receipt / counter metaphor */}
        <article
          className={`mt-14 overflow-hidden rounded-[1.75rem] shadow-lg ${revealClass(visible)}`}
          style={{
            ...(visible ? { animationDelay: '0.08s' } : {}),
            background: 'var(--rs-header)',
            color: 'var(--rs-header-ink)',
            boxShadow: 'var(--rs-shadow)',
          }}
        >
          <div className="grid lg:grid-cols-[1.15fr_0.85fr]">
            <div className="relative p-8 sm:p-10">
              <div
                className="pointer-events-none absolute -right-10 top-0 h-40 w-40 rounded-full blur-2xl"
                style={{
                  background: 'color-mix(in srgb, var(--rs-accent-secondary) 25%, transparent)',
                }}
              />
              <div className="relative flex flex-wrap items-center gap-3">
                <span
                  className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm"
                  style={{
                    background: 'color-mix(in srgb, var(--rs-header-ink) 12%, transparent)',
                    color: 'var(--rs-header-ink)',
                  }}
                >
                  {primaryFeature.icon}
                  {primaryFeature.tag}
                </span>
                <span
                  className="text-xs font-semibold uppercase tracking-[0.2em]"
                  style={{ color: 'color-mix(in srgb, var(--rs-header-ink) 72%, transparent)' }}
                >
                  Module 01
                </span>
              </div>
              <h3 className="relative mt-6 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
                {primaryFeature.title}
              </h3>
              <p
                className="relative mt-3 text-lg font-medium"
                style={{ color: 'var(--rs-accent-secondary)' }}
              >
                {primaryFeature.benefit}
              </p>
              <p
                className="relative mt-4 max-w-lg text-sm leading-relaxed"
                style={{ color: 'color-mix(in srgb, var(--rs-header-ink) 90%, transparent)' }}
              >
                {primaryFeature.detail}
              </p>
              <ul
                className="relative mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm"
                style={{ color: 'color-mix(in srgb, var(--rs-header-ink) 88%, transparent)' }}
              >
                <li>Barcode / IMEI scan</li>
                <li>Split cash · UPI · card · credit</li>
                <li>Thermal 80mm + A4</li>
                <li>Offline bill queue</li>
              </ul>
            </div>

            {/* Stylized invoice silhouette */}
            <div
              className="relative flex items-end justify-center p-8 sm:p-10"
              style={{
                background:
                  'linear-gradient(135deg, var(--rs-accent) 0%, var(--rs-accent-hover) 100%)',
              }}
            >
              <div
                aria-hidden
                className="w-full max-w-[240px] rounded-t-md border p-4 shadow-xl"
                style={{
                  borderColor: 'color-mix(in srgb, var(--rs-header-ink) 20%, transparent)',
                  background: 'var(--rs-surface)',
                  color: 'var(--rs-ink)',
                }}
              >
                <div
                  className="border-b border-dashed pb-3 text-center"
                  style={{ borderColor: 'var(--rs-border)' }}
                >
                  <p
                    className="font-display text-sm font-semibold"
                    style={{ color: 'var(--rs-accent)' }}
                  >
                    TAX INVOICE
                  </p>
                  <p className="mt-1 text-[10px]" style={{ color: 'var(--rs-muted)' }}>
                    Electronics counter · GST
                  </p>
                </div>
                <div className="mt-3 space-y-2 text-[10px]" style={{ color: 'var(--rs-muted)' }}>
                  <div className="flex justify-between gap-2">
                    <span>Redmi Note 13 · IMEI…4821</span>
                    <span className="font-medium" style={{ color: 'var(--rs-ink)' }}>
                      ₹18,499
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span>Screen guard + case</span>
                    <span className="font-medium" style={{ color: 'var(--rs-ink)' }}>
                      ₹649
                    </span>
                  </div>
                  <div
                    className="flex justify-between border-t pt-2 font-semibold"
                    style={{ borderColor: 'var(--rs-border)', color: 'var(--rs-ink)' }}
                  >
                    <span>Total · UPI + Cash</span>
                    <span>₹19,148</span>
                  </div>
                </div>
                <div
                  className="mt-4 h-8 rounded"
                  style={{ background: 'color-mix(in srgb, var(--rs-accent) 12%, transparent)' }}
                />
              </div>
            </div>
          </div>
        </article>

        {/* Module index — vertical spine, not a card grid */}
        <div className="relative mt-4">
          <div
            aria-hidden
            className="absolute bottom-4 left-[1.15rem] top-4 w-px bg-gradient-to-b from-brand/40 via-brand/20 to-transparent sm:left-[1.4rem]"
          />

          <ul className="space-y-1">
            {modules.map((module, index) => (
              <li
                key={module.title}
                className={`group relative grid gap-4 py-6 pl-12 transition-colors duration-300 sm:grid-cols-[7rem_1fr_1.2fr] sm:items-start sm:gap-8 sm:pl-14 lg:gap-12 ${
                  index < modules.length - 1 ? 'border-b border-slate-200/80' : ''
                } ${revealClass(visible)}`}
                style={visible ? { animationDelay: `${0.14 + index * 0.07}s` } : undefined}
              >
                <span
                  aria-hidden
                  className="absolute left-2 top-7 flex h-6 w-6 items-center justify-center rounded-full border-2 text-[10px] font-bold transition-all duration-300 ease-soft group-hover:scale-110 group-hover:border-brand group-hover:bg-brand group-hover:text-brand-on sm:left-2.5"
                  style={{
                    borderColor: 'color-mix(in srgb, var(--rs-accent) 35%, transparent)',
                    background: 'var(--rs-surface)',
                    color: 'var(--rs-accent)',
                  }}
                >
                  {String(index + 2).padStart(2, '0')}
                </span>

                <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400 sm:pt-1">
                  <span className="inline-flex text-brand">{module.icon}</span>
                  {module.tag}
                </div>

                <div>
                  <h3 className="font-display text-xl font-semibold text-slate-900 transition-colors group-hover:text-brand sm:text-2xl">
                    {module.title}
                  </h3>
                  <p className="mt-1 text-sm font-semibold text-brand">{module.benefit}</p>
                </div>

                <p className="text-sm leading-relaxed text-slate-600 sm:pt-1">{module.detail}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
