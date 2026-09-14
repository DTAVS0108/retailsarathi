'use client';

import Image from 'next/image';
import Link from 'next/link';
import { LiveFloatingCards } from '@/app/_components/live-objects';
import { ChromeBackdrop } from '@/app/_components/chrome-backdrop';
import { revealClass, useScrollReveal } from './use-scroll-reveal';

const pillars = [
  {
    title: 'Built for Indian retail',
    detail: 'GST-ready billing, UPI at the counter, compliance without spreadsheet Sundays.',
  },
  {
    title: 'Works the way you do',
    detail: 'Fast billing on busy evenings — scan, split pay, print, and move to the next customer.',
  },
  {
    title: 'Secure & reliable',
    detail: 'Your shop data stays protected while counters keep selling, even when the line drops.',
  },
  {
    title: 'Grow with confidence',
    detail: 'Sales, stock, and profit insights that help you decide what to stock next week.',
  },
];

export function LandingAtCounter() {
  const { ref, visible } = useScrollReveal<HTMLElement>();

  return (
    <section
      id="at-counter"
      ref={ref}
      className="relative overflow-hidden py-20 lg:py-28"
      style={{ background: 'var(--rs-header)', color: 'var(--rs-header-ink)' }}
    >
      <ChromeBackdrop variant="header" intensity="normal" />

      <div className="relative mx-auto w-[80%]">
        <div className={`max-w-2xl ${revealClass(visible)}`}>
          <p
            className="text-xs font-semibold uppercase tracking-[0.28em]"
            style={{ color: 'color-mix(in srgb, var(--rs-header-ink) 88%, transparent)' }}
          >
            At the counter
          </p>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
            Built for the shop floor
          </h2>
          <p
            className="mt-4 text-base leading-relaxed"
            style={{ color: 'color-mix(in srgb, var(--rs-header-ink) 85%, transparent)' }}
          >
            RetailSarathi sits beside your scanner and thermal printer: today&apos;s sales, IMEI stock
            truth, party dues, GST invoices, and repair status where your customers already stand.
          </p>
        </div>

        <div
          className={`relative mt-12 overflow-hidden rounded-[1.75rem] border shadow-2xl shadow-black/30 transition-transform duration-700 ease-soft ${revealClass(visible, '', 'scale')}`}
          style={{
            ...(visible ? { animationDelay: '0.1s' } : {}),
            borderColor: 'color-mix(in srgb, var(--rs-header-ink) 18%, transparent)',
          }}
        >
          <Image
            src="/landing-pos-counter.png"
            alt="RetailSarathi POS on a counter in an electronics shop — sales dashboard, thermal printer, and barcode scanner"
            width={1600}
            height={900}
            className="h-auto w-full object-cover object-center"
            sizes="(max-width: 1280px) 100vw, 1280px"
            priority={false}
          />
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-24 lg:h-16"
            style={{
              background:
                'linear-gradient(to top, color-mix(in srgb, var(--rs-accent-hover) 80%, transparent), transparent)',
            }}
          />
          <LiveFloatingCards
            className="hidden sm:block"
            items={[
              {
                label: 'Today ₹2.4L',
                sub: '142 bills',
                tone: 'accent',
                className: 'top-6 left-6',
                delay: '0s',
              },
              {
                label: 'Low stock',
                sub: '8 SKUs',
                tone: 'secondary',
                className: 'top-6 right-6',
                delay: '0.5s',
              },
              {
                label: '3 repairs ready',
                sub: 'Handover due',
                tone: 'surface',
                className: 'bottom-10 left-8',
                delay: '1s',
              },
            ]}
          />
        </div>

        <div
          className={`mt-10 grid gap-8 sm:grid-cols-2 lg:grid-cols-4 ${revealClass(visible)}`}
          style={visible ? { animationDelay: '0.18s' } : undefined}
        >
          {pillars.map((item) => (
            <div key={item.title}>
              <h3 className="font-display text-lg font-semibold">{item.title}</h3>
              <p
                className="mt-2 text-sm leading-relaxed"
                style={{ color: 'color-mix(in srgb, var(--rs-header-ink) 80%, transparent)' }}
              >
                {item.detail}
              </p>
            </div>
          ))}
        </div>

        <div
          className={`mt-12 flex flex-col gap-3 sm:flex-row sm:items-center ${revealClass(visible)}`}
          style={visible ? { animationDelay: '0.24s' } : undefined}
        >
          <Link
            href="/login"
            className="rs-cta inline-flex items-center justify-center rounded-xl px-7 py-3.5 text-sm font-semibold shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            style={{
              background: 'var(--rs-surface)',
              color: 'var(--rs-accent)',
              boxShadow: 'var(--rs-shadow)',
            }}
          >
            Try the product
          </Link>
          <a
            href="#features"
            className="rs-cta inline-flex items-center justify-center rounded-xl border px-7 py-3.5 text-sm font-semibold backdrop-blur-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
            style={{
              borderColor: 'color-mix(in srgb, var(--rs-header-ink) 28%, transparent)',
              background: 'color-mix(in srgb, var(--rs-header-ink) 8%, transparent)',
              color: 'var(--rs-header-ink)',
            }}
          >
            Back to features
          </a>
        </div>
      </div>
    </section>
  );
}
