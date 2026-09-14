'use client';

/**
 * Premium theme chrome backdrop — mesh aurora + grain + ledger shear.
 * No photos. Retints with --rs-* when Design & settings theme changes.
 */
export function ChromeBackdrop({
  variant = 'header',
  intensity = 'normal',
}: {
  /** header = dark chrome bands; page = light surfaces */
  variant?: 'header' | 'page';
  intensity?: 'soft' | 'normal' | 'rich';
}) {
  const header = variant === 'header';
  const ink = header ? 'var(--rs-header-ink)' : 'var(--rs-ink)';
  const opac =
    intensity === 'soft' ? { a: 0.22, b: 0.18, shear: 0.06 } : intensity === 'rich' ? { a: 0.42, b: 0.32, shear: 0.12 } : { a: 0.34, b: 0.26, shear: 0.09 };

  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      {/* Base fill already on parent; deepen with secondary wash */}
      <div
        className="absolute inset-0"
        style={{
          background: header
            ? `linear-gradient(145deg, transparent 0%, color-mix(in srgb, var(--rs-accent) 18%, transparent) 48%, color-mix(in srgb, black 22%, transparent) 100%)`
            : `linear-gradient(160deg, var(--rs-bg) 0%, color-mix(in srgb, var(--rs-accent-soft) 55%, var(--rs-bg)) 50%, var(--rs-bg-deep) 100%)`,
        }}
      />

      {/* Mesh aurora orbs */}
      <div
        className="rs-bg-orb absolute -left-[12%] -top-[18%] h-[58%] w-[58%] rounded-full blur-3xl"
        style={{
          background: `radial-gradient(circle, color-mix(in srgb, var(--rs-accent-secondary) ${Math.round(opac.a * 100)}%, transparent), transparent 68%)`,
          animationDelay: '0s',
        }}
      />
      <div
        className="rs-bg-orb absolute -right-[8%] top-[8%] h-[52%] w-[48%] rounded-full blur-3xl"
        style={{
          background: `radial-gradient(circle, color-mix(in srgb, var(--rs-accent) ${Math.round(opac.b * 100 + 8)}%, transparent), transparent 70%)`,
          animationDelay: '-6s',
        }}
      />
      <div
        className="rs-bg-orb absolute bottom-[-20%] left-[28%] h-[48%] w-[55%] rounded-full blur-3xl"
        style={{
          background: `radial-gradient(circle, color-mix(in srgb, ${ink} ${header ? 16 : 8}%, transparent), transparent 72%)`,
          animationDelay: '-12s',
        }}
      />

      {/* Soft spotlight from top */}
      <div
        className="absolute inset-0"
        style={{
          background: header
            ? `radial-gradient(ellipse 70% 45% at 50% -5%, color-mix(in srgb, ${ink} 18%, transparent), transparent 55%)`
            : `radial-gradient(ellipse 60% 40% at 70% 0%, color-mix(in srgb, var(--rs-accent) 12%, transparent), transparent 55%)`,
        }}
      />

      {/* Diagonal ledger shear bands */}
      <div
        className="absolute inset-0 opacity-90"
        style={{
          backgroundImage: `repeating-linear-gradient(
            -18deg,
            transparent 0px,
            transparent 46px,
            color-mix(in srgb, ${ink} ${Math.round(opac.shear * 100)}%, transparent) 46px,
            color-mix(in srgb, ${ink} ${Math.round(opac.shear * 100)}%, transparent) 47px
          )`,
          maskImage: 'linear-gradient(to bottom, black 0%, transparent 88%)',
        }}
      />

      {/* Fine grain */}
      <div
        className="absolute inset-0 opacity-[0.35] mix-blend-overlay"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.55'/%3E%3C/svg%3E\")",
          backgroundSize: '160px 160px',
        }}
      />

      {/* Bottom vignette — grounds the stage */}
      <div
        className="absolute inset-x-0 bottom-0 h-1/3"
        style={{
          background: header
            ? 'linear-gradient(to top, color-mix(in srgb, black 38%, transparent), transparent)'
            : 'linear-gradient(to top, color-mix(in srgb, var(--rs-bg-deep) 55%, transparent), transparent)',
        }}
      />
    </div>
  );
}
