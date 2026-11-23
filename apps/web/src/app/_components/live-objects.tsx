'use client';

/**
 * Decorative live floating objects for marketing / login surfaces.
 * Purely visual — aria-hidden wrappers on parents.
 */

type LiveObject = {
  label: string;
  sub?: string;
  tone?: 'accent' | 'surface' | 'secondary';
  className?: string;
  delay?: string;
};

const DEFAULT_OBJECTS: LiveObject[] = [
  { label: '₹18,499', sub: 'UPI · just now', tone: 'accent', className: 'top-[18%] right-[6%] lg:right-[10%]', delay: '0s' },
  { label: 'IMEI locked', sub: 'Stock −1', tone: 'surface', className: 'top-[42%] right-[2%] lg:right-[4%]', delay: '0.6s' },
  { label: 'Thermal ready', sub: '80mm GST', tone: 'secondary', className: 'bottom-[22%] right-[12%] lg:right-[16%]', delay: '1.2s' },
];

function toneStyle(tone: LiveObject['tone'] = 'surface') {
  if (tone === 'accent') {
    return {
      background: 'var(--rs-accent)',
      color: 'var(--rs-on-accent)',
      borderColor: 'transparent',
      boxShadow: 'var(--rs-shadow)',
    };
  }
  if (tone === 'secondary') {
    return {
      background: 'color-mix(in srgb, var(--rs-accent-secondary) 88%, var(--rs-surface))',
      color: '#0F172A',
      borderColor: 'transparent',
      boxShadow: 'var(--rs-shadow)',
    };
  }
  return {
    background: 'color-mix(in srgb, var(--rs-surface) 92%, transparent)',
    color: 'var(--rs-ink)',
    borderColor: 'var(--rs-border)',
    boxShadow: 'var(--rs-shadow)',
  };
}

export function LiveFloatingCards({
  items = DEFAULT_OBJECTS,
  className = '',
}: {
  items?: LiveObject[];
  className?: string;
}) {
  return (
    <div aria-hidden className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`}>
      {items.map((item) => (
        <div
          key={item.label}
          className={`absolute animate-soft-float rounded-2xl border px-3.5 py-2.5 backdrop-blur-md ${item.className ?? ''}`}
          style={{
            ...toneStyle(item.tone),
            animationDelay: item.delay ?? '0s',
          }}
        >
          <p className="text-sm font-semibold leading-none">{item.label}</p>
          {item.sub ? <p className="mt-1 text-[11px] opacity-80">{item.sub}</p> : null}
        </div>
      ))}
    </div>
  );
}

export function LivePulseDot({ className = '' }: { className?: string }) {
  return (
    <span className={`relative inline-flex h-2.5 w-2.5 ${className}`} aria-hidden>
      <span
        className="absolute inset-0 animate-ping rounded-full opacity-60"
        style={{ background: 'var(--rs-accent)' }}
      />
      <span
        className="relative inline-flex h-2.5 w-2.5 rounded-full"
        style={{ background: 'var(--rs-accent)' }}
      />
    </span>
  );
}

/** Compact horizontal mini flow for login / demo panels */
export function MiniFlowDiagram({
  steps,
  light = false,
}: {
  steps: string[];
  light?: boolean;
}) {
  const ink = light ? 'var(--rs-header-ink)' : 'var(--rs-ink)';
  const muted = light
    ? 'color-mix(in srgb, var(--rs-header-ink) 70%, transparent)'
    : 'var(--rs-muted)';
  const chipBg = light
    ? 'color-mix(in srgb, var(--rs-header-ink) 12%, transparent)'
    : 'var(--rs-surface)';
  const border = light
    ? 'color-mix(in srgb, var(--rs-header-ink) 20%, transparent)'
    : 'var(--rs-border)';

  return (
    <div className="flex flex-wrap items-center gap-2" role="list" aria-label="Sign-in journey">
      {steps.map((step, i) => (
        <div key={step} className="flex items-center gap-2" role="listitem">
          <span
            className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold"
            style={{ background: chipBg, borderColor: border, color: ink }}
          >
            <span
              className="flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold"
              style={{
                background: light ? 'color-mix(in srgb, var(--rs-header-ink) 18%, transparent)' : 'var(--rs-accent-soft)',
                color: light ? ink : 'var(--rs-accent)',
              }}
            >
              {i + 1}
            </span>
            {step}
          </span>
          {i < steps.length - 1 ? (
            <span style={{ color: muted }} className="text-xs" aria-hidden>
              →
            </span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
