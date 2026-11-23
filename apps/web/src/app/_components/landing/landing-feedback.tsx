'use client';

import { revealClass, useScrollReveal } from './use-scroll-reveal';

const testimonials = [
  {
    quote:
      'We bill 200+ phones a day in Camp. Offline mode saved us during a full-day fibre cut — bills synced cleanly by evening, and GSTR lines still matched.',
    name: 'Rajesh Kulkarni',
    shop: 'Mobile World',
    city: 'Pune',
    type: 'Multi-brand handset counter',
    highlight: 'Offline POS · sync',
  },
  {
    quote:
      'IMEI tracking finally matches our godown register. Purchase upload plus sale lock means fewer “missing serial” arguments with suppliers.',
    name: 'Priya Shah',
    shop: 'Shree Electronics',
    city: 'Surat',
    type: 'Electronics & accessories',
    highlight: 'IMEI · purchases',
  },
  {
    quote:
      'Repair job cards used to live in WhatsApp chats. Now every intake, parts issue, and handover is traceable — customers stop calling five times for status.',
    name: 'Amit Verma',
    shop: 'City Mobile Care',
    city: 'Indore',
    type: 'Sales + service centre',
    highlight: 'Repairs · job cards',
  },
];

const trustPoints = [
  { label: 'Target shops', value: 'Electronics · mobiles · service' },
  { label: 'India GST', value: 'HSN · GSTR-1 · GSTR-3B' },
  { label: 'Shop login', value: 'owner@demo… / Demo@123' },
  { label: 'Admin login', value: 'admin@… / Admin@123' },
];

export function LandingFeedback() {
  const { ref, visible } = useScrollReveal<HTMLElement>();

  return (
    <section
      id="feedback"
      ref={ref}
      className="border-y py-20 lg:py-28"
      style={{
        borderColor: 'var(--rs-border)',
        background: 'var(--rs-surface)',
      }}
    >
      <div className="mx-auto w-[80%]">
        <div className={`max-w-2xl ${revealClass(visible)}`}>
          <p
            className="text-xs font-semibold uppercase tracking-[0.28em]"
            style={{ color: 'var(--rs-accent)' }}
          >
            Feedback
          </p>
          <h2
            className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl"
            style={{ color: 'var(--rs-ink)' }}
          >
            Shopkeepers who wanted one system, not five
          </h2>
          <p className="mt-4 text-base" style={{ color: 'var(--rs-muted)' }}>
            From handset counters in Pune to service desks in Indore — owners who needed billing,
            stock, GST, ledgers, and repairs in one place instead of notebooks, Excel, and chat threads.
          </p>
        </div>

        <div
          className={`mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 ${revealClass(visible)}`}
          style={visible ? { animationDelay: '0.08s' } : undefined}
        >
          {trustPoints.map((t) => (
            <div
              key={t.label}
              className="rounded-xl border px-4 py-3"
              style={{ borderColor: 'var(--rs-border)', background: 'var(--rs-bg)' }}
            >
              <p className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--rs-muted)' }}>
                {t.label}
              </p>
              <p className="mt-1 text-sm font-semibold" style={{ color: 'var(--rs-ink)' }}>
                {t.value}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-12 grid gap-6 lg:grid-cols-3">
          {testimonials.map((item, index) => (
            <figure
              key={item.name}
              className={`rs-lift flex flex-col rounded-3xl border p-7 ${revealClass(visible, '', 'scale')}`}
              style={{
                ...(visible ? { animationDelay: `${0.1 + index * 0.1}s` } : {}),
                borderColor: 'var(--rs-border)',
                background:
                  'linear-gradient(to bottom, var(--rs-surface-2), var(--rs-surface))',
              }}
            >
              <span
                className="inline-flex w-fit rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
                style={{
                  background: 'color-mix(in srgb, var(--rs-accent) 12%, transparent)',
                  color: 'var(--rs-accent)',
                }}
              >
                {item.highlight}
              </span>
              <blockquote
                className="mt-4 flex-1 text-sm leading-relaxed"
                style={{ color: 'var(--rs-ink)' }}
              >
                &ldquo;{item.quote}&rdquo;
              </blockquote>
              <figcaption
                className="mt-6 border-t pt-5"
                style={{ borderColor: 'var(--rs-border)' }}
              >
                <p className="font-semibold" style={{ color: 'var(--rs-ink)' }}>
                  {item.name}
                </p>
                <p className="mt-1 text-sm" style={{ color: 'var(--rs-accent)' }}>
                  {item.shop}, {item.city}
                </p>
                <p className="mt-1 text-xs" style={{ color: 'var(--rs-muted)' }}>
                  {item.type}
                </p>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}
