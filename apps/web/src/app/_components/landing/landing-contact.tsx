'use client';

import { useState, type FormEvent } from 'react';
import { toast } from '@/app/_components/toast';
import { revealClass, useScrollReveal } from './use-scroll-reveal';

export function LandingContact() {
  const { ref, visible } = useScrollReveal<HTMLElement>();
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    window.setTimeout(() => {
      setLoading(false);
      setSubmitted(true);
      toast.success("Message received. We'll reply within one working day.", 'Thanks');
    }, 700);
  }

  return (
    <section id="contact" ref={ref} className="relative overflow-hidden py-20 lg:py-28">
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(135deg, var(--rs-bg) 0%, var(--rs-surface-2) 50%, color-mix(in srgb, var(--rs-accent-secondary) 10%, var(--rs-bg)) 100%)',
        }}
      />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 85% 15%, color-mix(in srgb, var(--rs-accent-secondary) 14%, transparent), transparent 40%)',
        }}
      />
      <div
        className="pointer-events-none absolute -left-24 bottom-0 h-64 w-64 rounded-full blur-3xl"
        style={{ background: 'color-mix(in srgb, var(--rs-accent) 12%, transparent)' }}
      />

      <div className="relative mx-auto w-[80%]">
        <div
          className="overflow-hidden rounded-[1.75rem] border shadow-sm backdrop-blur-sm lg:grid lg:grid-cols-5"
          style={{
            borderColor: 'var(--rs-border)',
            background: 'color-mix(in srgb, var(--rs-surface) 88%, transparent)',
            boxShadow: 'var(--rs-shadow)',
          }}
        >
          <div
            className={`relative overflow-hidden p-8 text-white sm:p-10 lg:col-span-2 lg:p-12 ${revealClass(visible)}`}
            style={{ background: 'var(--rs-header)', color: 'var(--rs-header-ink)' }}
          >
            <div className="pointer-events-none absolute -right-8 top-0 h-40 w-40 rounded-full bg-accent/25 blur-2xl" />
            <p
              className="relative text-xs font-semibold uppercase tracking-[0.28em]"
              style={{ color: 'color-mix(in srgb, var(--rs-header-ink) 88%, transparent)' }}
            >
              Contact
            </p>
            <h2 className="relative mt-3 font-display text-3xl font-semibold tracking-tight sm:text-4xl">
              Talk to the team
            </h2>
            <p
              className="relative mt-4 text-sm leading-relaxed"
              style={{ color: 'color-mix(in srgb, var(--rs-header-ink) 88%, transparent)' }}
            >
              Questions about onboarding, GST setup, or multi-branch rollout? We respond in plain
              Hindi-English — not ticket jargon.
            </p>

            <dl className="relative mt-10 space-y-6 text-sm">
              <div>
                <dt
                  className="text-xs font-semibold uppercase tracking-wide"
                  style={{ color: 'color-mix(in srgb, var(--rs-header-ink) 72%, transparent)' }}
                >
                  Email
                </dt>
                <dd className="mt-1.5">
                  <a
                    href="mailto:hello@retailsarathi.in"
                    className="font-medium transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2"
                    style={{ color: 'var(--rs-header-ink)' }}
                  >
                    hello@retailsarathi.in
                  </a>
                </dd>
              </div>
              <div>
                <dt
                  className="text-xs font-semibold uppercase tracking-wide"
                  style={{ color: 'color-mix(in srgb, var(--rs-header-ink) 72%, transparent)' }}
                >
                  WhatsApp
                </dt>
                <dd
                  className="mt-1.5 leading-relaxed"
                  style={{ color: 'color-mix(in srgb, var(--rs-header-ink) 88%, transparent)' }}
                >
                  Prefer a quick voice note? Share your shop type and city — we&apos;ll suggest a
                  setup path for your counters.
                </dd>
              </div>
            </dl>

            <p
              className="relative mt-12 text-xs"
              style={{ color: 'color-mix(in srgb, var(--rs-header-ink) 65%, transparent)' }}
            >
              Electronics · Mobiles · Service centres · Multi-branch
            </p>
          </div>

          <div
            className={`p-6 sm:p-8 lg:col-span-3 lg:p-12 ${revealClass(visible)}`}
            style={visible ? { animationDelay: '0.12s' } : undefined}
          >
            {submitted ? (
              <div
                role="status"
                className="flex h-full min-h-[280px] flex-col items-center justify-center rounded-2xl border px-6 py-10 text-center"
                style={{
                  borderColor: 'var(--rs-border)',
                  background:
                    'linear-gradient(135deg, var(--rs-accent-soft), var(--rs-surface))',
                }}
              >
                <p
                  className="font-display text-xl font-semibold"
                  style={{ color: 'var(--rs-accent)' }}
                >
                  Message received
                </p>
                <p className="mt-2 max-w-sm text-sm" style={{ color: 'var(--rs-muted)' }}>
                  Thanks for reaching out. We&apos;ll get back to you at the email you provided —
                  usually within one working day.
                </p>
                <button
                  type="button"
                  onClick={() => setSubmitted(false)}
                  className="mt-6 text-sm font-semibold hover:opacity-80"
                  style={{ color: 'var(--rs-accent)' }}
                >
                  Send another message
                </button>
              </div>
            ) : (
              <>
                <h3 className="font-display text-xl font-semibold text-slate-900">
                  Tell us about your shop
                </h3>
                <p className="mt-2 text-sm text-slate-600">
                  Counters, branches, repair desk, GST status — whatever helps us point you right.
                </p>

                <form onSubmit={handleSubmit} className="mt-8 space-y-5">
                  <div className="grid gap-5 sm:grid-cols-2">
                    <label className="block text-sm">
                      <span className="font-medium text-slate-800">Name</span>
                      <input
                        required
                        name="name"
                        type="text"
                        className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-teal-100"
                        placeholder="Your name"
                      />
                    </label>
                    <label className="block text-sm">
                      <span className="font-medium text-slate-800">Shop / business</span>
                      <input
                        required
                        name="shop"
                        type="text"
                        className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-teal-100"
                        placeholder="e.g. Galaxy Mobiles"
                      />
                    </label>
                  </div>

                  <label className="block text-sm">
                    <span className="font-medium text-slate-800">Email</span>
                    <input
                      required
                      name="email"
                      type="email"
                      className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-teal-100"
                      placeholder="you@shop.in"
                    />
                  </label>

                  <label className="block text-sm">
                    <span className="font-medium text-slate-800">Message</span>
                    <textarea
                      required
                      name="message"
                      rows={4}
                      className="mt-1.5 w-full resize-y rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-teal-100"
                      placeholder="Tell us about your counters, branches, or GST setup..."
                    />
                  </label>

                  <button
                    type="submit"
                    disabled={loading}
                    className="inline-flex w-full items-center justify-center rounded-xl px-6 py-3.5 text-sm font-semibold shadow-sm rs-cta disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:transform-none sm:w-auto"
                    style={{
                      background: 'var(--rs-accent)',
                      color: 'var(--rs-on-accent)',
                      boxShadow: 'var(--rs-shadow)',
                    }}
                  >
                    {loading ? 'Sending…' : 'Send message'}
                  </button>
                </form>
              </>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
