'use client';

import { useState } from 'react';
import { revealClass, useScrollReveal } from './use-scroll-reveal';

type FlowId = 'counter' | 'stock' | 'repair';

const flows: Record<
  FlowId,
  {
    label: string;
    title: string;
    blurb: string;
    steps: Array<{ title: string; detail: string; meta: string }>;
  }
> = {
  counter: {
    label: 'Rush-hour bill',
    title: 'From scan to thermal print in one breath',
    blurb:
      'Built for Camp Road evenings and Diwali weekends — the cashier never leaves the keyboard wedge.',
    steps: [
      {
        title: 'Scan / search',
        detail: 'Barcode, IMEI, or quick product pick. Hold bills when a customer steps aside.',
        meta: '~2s',
      },
      {
        title: 'Price & GST',
        detail: 'HSN, CGST/SGST or IGST from place of supply. Discount and schemes applied inline.',
        meta: 'Auto',
      },
      {
        title: 'Split pay',
        detail: 'Cash + UPI + card + credit on one invoice. Udhaar posts to the party ledger.',
        meta: 'UPI-ready',
      },
      {
        title: 'Print & share',
        detail: '80mm thermal or A4 tax invoice. WhatsApp share link when the line is long.',
        meta: 'GST',
      },
    ],
  },
  stock: {
    label: 'Stock → books',
    title: 'Purchase to shelf to GSTR — one trail',
    blurb:
      'IMEI phones, batteries, and spares stay linked from supplier bill to sale return — so month-end is not a Sunday spreadsheet.',
    steps: [
      {
        title: 'Upload / GRN',
        detail: 'Scan supplier invoices or enter purchase bills. Serials land in stock with HSN.',
        meta: 'Inbound',
      },
      {
        title: 'Godown truth',
        detail: 'Low-stock nudges, IMEI lock on sale, and adjustments with an audit trail.',
        meta: 'Live',
      },
      {
        title: 'Counter sale',
        detail: 'Every bill decrements the right serial or quantity — offline queue if fibre drops.',
        meta: 'POS',
      },
      {
        title: 'GST export',
        detail: 'GSTR-1 JSON and GSTR-3B summaries for your CA. HSN breakup stays with the invoice.',
        meta: 'Month-end',
      },
    ],
  },
  repair: {
    label: 'Service desk',
    title: 'Repair jobs that do not vanish in WhatsApp',
    blurb:
      'Intake, diagnosis, parts, approval, and handover — status the customer can ask about without hunting chats.',
    steps: [
      {
        title: 'Intake',
        detail: 'Device, complaint, estimated cost, and customer phone on a job card.',
        meta: 'Stage 1',
      },
      {
        title: 'Diagnose & parts',
        detail: 'Spare consumption from stock. Cost updates before you promise a pickup time.',
        meta: 'Stages 2–3',
      },
      {
        title: 'Approve',
        detail: 'Customer yes/no on estimate. History stays on the card, not in scattered notes.',
        meta: 'Stage 4',
      },
      {
        title: 'Ready / handover',
        detail: 'Notify, collect balance, close the job. Parts and labour already in the books.',
        meta: 'Stages 5–6',
      },
    ],
  },
};

function FlowArrow() {
  return (
    <svg viewBox="0 0 48 24" className="h-5 w-10" aria-hidden style={{ color: 'var(--rs-accent)' }}>
      <path
        d="M2 12h38M32 4l10 8-10 8"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity="0.55"
      />
    </svg>
  );
}

export function LandingFlow() {
  const { ref, visible } = useScrollReveal<HTMLElement>();
  const [active, setActive] = useState<FlowId>('counter');
  const flow = flows[active];

  return (
    <section
      id="how-it-works"
      ref={ref}
      className="relative overflow-hidden py-20 lg:py-28"
      style={{ background: 'var(--rs-bg)' }}
    >
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse at 20% 0%, color-mix(in srgb, var(--rs-accent) 12%, transparent), transparent 50%)',
        }}
      />

      <div className="relative mx-auto w-[80%]">
        <div className={`max-w-2xl ${revealClass(visible)}`}>
          <p
            className="text-xs font-semibold uppercase tracking-[0.28em]"
            style={{ color: 'var(--rs-accent)' }}
          >
            How it works
          </p>
          <h2
            className="mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl text-balance"
            style={{ color: 'var(--rs-ink)' }}
          >
            Three flows every electronics shop runs every day
          </h2>
          <p className="mt-4 text-base leading-relaxed" style={{ color: 'var(--rs-muted)' }}>
            Not abstract modules — the exact paths from scanner beep to GST export, godown count, and
            repair handover. Switch the diagram to see the trail.
          </p>
        </div>

        <div
          className={`mt-10 flex flex-wrap gap-2 ${revealClass(visible)}`}
          style={visible ? { animationDelay: '0.08s' } : undefined}
          role="tablist"
          aria-label="Shop workflows"
        >
          {(Object.keys(flows) as FlowId[]).map((id) => {
            const selected = id === active;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setActive(id)}
                className="rounded-full px-4 py-2 text-sm font-semibold transition-all duration-300"
                style={
                  selected
                    ? {
                        background: 'var(--rs-accent)',
                        color: 'var(--rs-on-accent)',
                        boxShadow: 'var(--rs-shadow)',
                      }
                    : {
                        background: 'var(--rs-surface)',
                        color: 'var(--rs-muted)',
                        border: '1px solid var(--rs-border)',
                      }
                }
              >
                {flows[id].label}
              </button>
            );
          })}
        </div>

        <div
          className={`mt-8 overflow-hidden rounded-[1.75rem] border ${revealClass(visible, '', 'scale')}`}
          style={{
            ...(visible ? { animationDelay: '0.14s' } : {}),
            borderColor: 'var(--rs-border)',
            background: 'var(--rs-surface)',
            boxShadow: 'var(--rs-shadow)',
          }}
        >
          <div
            className="border-b px-6 py-6 sm:px-8 sm:py-7"
            style={{ borderColor: 'var(--rs-border)' }}
          >
            <p
              className="text-xs font-semibold uppercase tracking-[0.2em]"
              style={{ color: 'var(--rs-accent)' }}
            >
              Flow diagram
            </p>
            <h3
              className="mt-2 font-display text-2xl font-semibold tracking-tight sm:text-3xl"
              style={{ color: 'var(--rs-ink)' }}
            >
              {flow.title}
            </h3>
            <p className="mt-2 max-w-3xl text-sm leading-relaxed sm:text-base" style={{ color: 'var(--rs-muted)' }}>
              {flow.blurb}
            </p>
          </div>

          <div className="px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {/* Desktop horizontal flow */}
            <div className="hidden items-stretch gap-1 lg:flex">
              {flow.steps.map((step, index) => (
                <div key={step.title} className="flex min-w-0 flex-1 items-stretch">
                  <div className="min-w-0 flex-1">
                    <FlowStepCard step={step} index={index} />
                  </div>
                  {index < flow.steps.length - 1 ? (
                    <div className="flex w-10 shrink-0 items-center justify-center">
                      <FlowArrow />
                    </div>
                  ) : null}
                </div>
              ))}
            </div>

            {/* Mobile / tablet stacked */}
            <ol className="space-y-0 lg:hidden">
              {flow.steps.map((step, index) => (
                <li key={step.title} className="relative py-3">
                  {index < flow.steps.length - 1 ? (
                    <span
                      aria-hidden
                      className="absolute bottom-0 left-4 top-14 w-px"
                      style={{
                        background:
                          'linear-gradient(to bottom, color-mix(in srgb, var(--rs-accent) 40%, transparent), transparent)',
                      }}
                    />
                  ) : null}
                  <FlowStepCard step={step} index={index} stacked />
                </li>
              ))}
            </ol>
          </div>

          {/* Compact system map */}
          <div
            className="border-t px-6 py-6 sm:px-8"
            style={{
              borderColor: 'var(--rs-border)',
              background: 'var(--rs-surface-2)',
            }}
          >
            <p
              className="text-xs font-semibold uppercase tracking-[0.2em]"
              style={{ color: 'var(--rs-muted)' }}
            >
              Data stays connected
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2 text-sm sm:gap-3">
              {[
                'POS bill',
                'Stock / IMEI',
                'Party ledger',
                'GST export',
                'Repair job',
                'Offline sync',
              ].map((node, i, arr) => (
                <div key={node} className="flex items-center gap-2 sm:gap-3">
                  <span
                    className="rounded-lg px-3 py-1.5 font-medium"
                    style={{
                      background: 'var(--rs-surface)',
                      border: '1px solid var(--rs-border)',
                      color: 'var(--rs-ink)',
                    }}
                  >
                    {node}
                  </span>
                  {i < arr.length - 1 ? (
                    <span aria-hidden style={{ color: 'var(--rs-accent)' }} className="text-xs">
                      →
                    </span>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function FlowStepCard({
  step,
  index,
  stacked = false,
}: {
  step: { title: string; detail: string; meta: string };
  index: number;
  stacked?: boolean;
}) {
  return (
    <div
      className={`h-full rounded-2xl border p-5 transition-transform duration-300 ease-soft hover:-translate-y-1 ${
        stacked ? 'ml-2' : ''
      }`}
      style={{
        borderColor: 'var(--rs-border)',
        background:
          'linear-gradient(160deg, color-mix(in srgb, var(--rs-accent-soft) 40%, var(--rs-surface)), var(--rs-surface))',
      }}
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold"
          style={{
            background: 'var(--rs-accent)',
            color: 'var(--rs-on-accent)',
          }}
        >
          {String(index + 1).padStart(2, '0')}
        </span>
        <span
          className="rounded-full px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
          style={{
            background: 'color-mix(in srgb, var(--rs-accent) 12%, transparent)',
            color: 'var(--rs-accent)',
          }}
        >
          {step.meta}
        </span>
      </div>
      <h4 className="mt-4 font-display text-lg font-semibold" style={{ color: 'var(--rs-ink)' }}>
        {step.title}
      </h4>
      <p className="mt-2 text-sm leading-relaxed" style={{ color: 'var(--rs-muted)' }}>
        {step.detail}
      </p>
    </div>
  );
}
