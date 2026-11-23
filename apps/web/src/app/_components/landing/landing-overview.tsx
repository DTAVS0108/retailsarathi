'use client';

import { revealClass, useScrollReveal } from './use-scroll-reveal';

const journeySteps = [
  {
    step: '01',
    title: 'Bill at the counter',
    detail:
      'Scan barcodes or IMEI, split UPI and cash, print thermal GST invoices — even when the network drops mid-rush.',
    outcome: 'Customer leaves with a valid tax invoice in under a minute.',
  },
  {
    step: '02',
    title: 'Stock stays honest',
    detail:
      'IMEI and serial tracking, low-stock nudges, purchase bills, and spares linked to every sale and return.',
    outcome: 'Godown count matches what the counter sold today.',
  },
  {
    step: '03',
    title: 'GST stays ready',
    detail:
      'HSN summaries, GSTR-1 and GSTR-3B prep exports, place-of-supply tax split, and e-invoice fields for your CA.',
    outcome: 'Month-end is an export — not a Sunday spreadsheet.',
  },
  {
    step: '04',
    title: 'Repairs close the loop',
    detail:
      'Job cards with intake, diagnosis, parts, approval, and handover — status customers can ask about without WhatsApp archaeology.',
    outcome: 'Every device has a trail from drop-off to pickup.',
  },
];

const metrics = [
  { value: '100+', label: 'bills/day target', hint: 'MVP bar for offline counters' },
  { value: 'CGST · SGST · IGST', label: 'tax engine', hint: 'From place of supply + HSN lines' },
  { value: 'Offline sync', label: 'desktop queue', hint: 'Bills land when Wi‑Fi returns' },
  { value: '6 stages', label: 'repair workflow', hint: 'Intake → diagnosis → parts → ready' },
];

const painPoints = [
  {
    pain: 'Fibre cut mid-rush',
    fix: 'Desktop POS keeps billing locally; sync outbox catches up later.',
  },
  {
    pain: 'IMEI mismatch vs godown register',
    fix: 'Serials locked from purchase to sale to return — one trail.',
  },
  {
    pain: 'GSTR prep on Sundays',
    fix: 'HSN-wise invoices feed GSTR-1 JSON and GSTR-3B summaries.',
  },
  {
    pain: 'Repair jobs lost in chats',
    fix: 'Job cards carry status, parts, and approvals in one place.',
  },
];

export function LandingOverview() {
  const { ref, visible } = useScrollReveal<HTMLElement>();

  return (
    <section
      id="overview"
      ref={ref}
      className="relative border-y py-20 lg:py-28"
      style={{
        borderColor: 'var(--rs-border)',
        background: 'var(--rs-surface)',
      }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at top, color-mix(in srgb, var(--rs-accent) 10%, transparent), transparent 55%)',
        }}
      />

      <div className="relative mx-auto w-[80%]">
        <div className={revealClass(visible)}>
          <p
            className="text-xs font-semibold uppercase tracking-[0.28em]"
            style={{ color: 'var(--rs-accent)' }}
          >
            Overview
          </p>
          <h2
            className="mt-3 max-w-2xl font-display text-3xl font-semibold tracking-tight sm:text-4xl text-balance"
            style={{ color: 'var(--rs-ink)' }}
          >
            From busy counter to compliant books — without switching apps
          </h2>
          <p
            className="mt-4 max-w-2xl text-base leading-relaxed"
            style={{ color: 'var(--rs-muted)' }}
          >
            RetailSarathi is the shop companion for Indian electronics and mobile retailers: rush-hour
            billing, IMEI accountability, party khata, monthly GST, and repair desks that cannot
            afford lost job cards.
          </p>
        </div>

        <ol className="mt-14 grid gap-8 lg:grid-cols-4 lg:gap-6">
          {journeySteps.map((item, index) => (
            <li
              key={item.step}
              className={`relative group ${revealClass(visible, `hero-delay-${Math.min(index + 1, 4)}`)}`}
              style={visible ? { animationDelay: `${0.1 + index * 0.08}s` } : undefined}
            >
              {index < journeySteps.length - 1 ? (
                <span
                  aria-hidden
                  className="absolute left-8 top-10 hidden h-px w-[calc(100%+1.5rem)] lg:block"
                  style={{
                    background:
                      'linear-gradient(to right, color-mix(in srgb, var(--rs-accent) 35%, transparent), transparent)',
                  }}
                />
              ) : null}
              <div className="flex gap-4">
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full font-display text-sm font-semibold transition-transform duration-300 ease-soft group-hover:scale-110"
                  style={{
                    background: 'color-mix(in srgb, var(--rs-accent) 12%, transparent)',
                    color: 'var(--rs-accent)',
                  }}
                >
                  {item.step}
                </span>
                <div>
                  <h3 className="font-semibold" style={{ color: 'var(--rs-ink)' }}>
                    {item.title}
                  </h3>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--rs-muted)' }}>
                    {item.detail}
                  </p>
                  <p
                    className="mt-3 text-xs font-medium leading-relaxed"
                    style={{ color: 'var(--rs-accent)' }}
                  >
                    → {item.outcome}
                  </p>
                </div>
              </div>
            </li>
          ))}
        </ol>

        <dl
          className={`mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 ${revealClass(visible)}`}
          style={visible ? { animationDelay: '0.35s' } : undefined}
        >
          {metrics.map((metric) => (
            <div
              key={metric.label}
              className="rs-lift rounded-2xl border p-5"
              style={{
                borderColor: 'var(--rs-border)',
                background:
                  'linear-gradient(135deg, color-mix(in srgb, var(--rs-accent-soft) 55%, var(--rs-surface)), var(--rs-surface))',
              }}
            >
              <dt
                className="font-display text-xl font-semibold sm:text-2xl"
                style={{ color: 'var(--rs-accent)' }}
              >
                {metric.value}
              </dt>
              <dd className="mt-1 text-sm font-semibold" style={{ color: 'var(--rs-ink)' }}>
                {metric.label}
              </dd>
              <dd className="mt-1 text-xs leading-relaxed" style={{ color: 'var(--rs-muted)' }}>
                {metric.hint}
              </dd>
            </div>
          ))}
        </dl>

        <div
          className={`mt-14 overflow-hidden rounded-[1.75rem] border ${revealClass(visible)}`}
          style={{
            ...(visible ? { animationDelay: '0.4s' } : {}),
            borderColor: 'var(--rs-border)',
            background: 'var(--rs-bg)',
          }}
        >
          <div className="border-b px-6 py-5 sm:px-8" style={{ borderColor: 'var(--rs-border)' }}>
            <h3 className="font-display text-xl font-semibold" style={{ color: 'var(--rs-ink)' }}>
              Shop pains → RetailSarathi answers
            </h3>
            <p className="mt-1 text-sm" style={{ color: 'var(--rs-muted)' }}>
              The daily friction electronics counters actually feel — and how the product responds.
            </p>
          </div>
          <div className="grid divide-y sm:grid-cols-2 sm:divide-y-0" style={{ borderColor: 'var(--rs-border)' }}>
            {painPoints.map((row, i) => (
              <div
                key={row.pain}
                className={`p-5 sm:p-6 ${i % 2 === 0 ? 'sm:border-r' : ''} ${i < 2 ? 'sm:border-b' : ''}`}
                style={{ borderColor: 'var(--rs-border)' }}
              >
                <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--rs-muted)' }}>
                  Pain
                </p>
                <p className="mt-1 font-semibold" style={{ color: 'var(--rs-ink)' }}>
                  {row.pain}
                </p>
                <p className="mt-3 text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--rs-accent)' }}>
                  Fix
                </p>
                <p className="mt-1 text-sm leading-relaxed" style={{ color: 'var(--rs-muted)' }}>
                  {row.fix}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
