'use client';

import Link from 'next/link';
import { useId } from 'react';
import { resolveUploadUrl } from '@/lib/upload-url';

function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

type BrandLogoProps = {
  /** Organization / shop wordmark. Defaults to product name. */
  title?: string;
  /** Custom shop logo from tenant profile. Falls back to brand mark. */
  logoUrl?: string | null;
  withWordmark?: boolean;
  subtitle?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  href?: string;
  className?: string;
  /** Light wordmark for dark rails / headers */
  light?: boolean;
  markOnly?: boolean;
};

const sizes = {
  sm: { mark: 28, text: 'text-base', sub: 'text-[10px]' },
  md: { mark: 36, text: 'text-lg', sub: 'text-[11px]' },
  lg: { mark: 44, text: 'text-xl', sub: 'text-xs' },
  xl: { mark: 56, text: 'text-2xl', sub: 'text-sm' },
} as const;

/**
 * Theme-aware mark — fill / glyph / spark follow --rs-accent tokens
 * so the logo shifts with Design & settings themes.
 */
export function BrandMark({
  size = 36,
  className,
  title = 'RetailSarathi',
  logoUrl,
}: {
  size?: number;
  className?: string;
  title?: string;
  logoUrl?: string | null;
}) {
  const src = resolveUploadUrl(logoUrl);
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={title}
        width={size}
        height={size}
        className={cn('rs-brand-mark shrink-0 rounded-[22%] object-contain bg-white', className)}
      />
    );
  }

  const uid = useId().replace(/:/g, '');
  const gradId = `rsBg-${uid}`;
  const sparkId = `rsSpark-${uid}`;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 128 128"
      width={size}
      height={size}
      className={cn('rs-brand-mark shrink-0 rounded-[22%]', className)}
      role="img"
      aria-label={title}
    >
      <title>{title}</title>
      <defs>
        <linearGradient id={gradId} x1="18" y1="10" x2="110" y2="118" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--rs-accent, #0F766E)" />
          <stop offset="1" stopColor="var(--rs-accent-hover, #0A4F4A)" />
        </linearGradient>
        <linearGradient id={sparkId} x1="70" y1="20" x2="110" y2="70" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="var(--rs-accent-secondary, #F59E0B)" />
          <stop offset="1" stopColor="var(--rs-accent, #0F766E)" stopOpacity="0.85" />
        </linearGradient>
      </defs>
      <rect width="128" height="128" rx="28" fill={`url(#${gradId})`} />
      <path
        fill="var(--rs-on-accent, #F8FFFE)"
        d="M34 98c0-28 14-46 42-52 8-2 14-8 14-16 0-10-8-16-20-16H42c-4 0-6 2-6 6v66c0 4 2 6 6 6h8c4 0 6-2 6-6V74c18 2 30 14 30 32 0 4-2 6-6 6h-10c-4 0-6-2-6-6 0-10-8-16-20-16H40c-4 0-6 2-6 6z"
      />
      <path
        fill="var(--rs-on-accent, #F8FFFE)"
        d="M52 38h16c6 0 10 3 10 8s-4 8-10 8H52V38z"
      />
      <circle cx="74" cy="34" r="7" fill={`url(#${sparkId})`} />
      <path
        fill="var(--rs-accent-secondary, #F59E0B)"
        d="M96 52c8 6 12 16 10 26-1 4 2 6 5 4 8-12 4-30-10-40-3-2-6 1-5 10z"
      />
    </svg>
  );
}

export function BrandLogo({
  title = 'RetailSarathi',
  logoUrl,
  withWordmark = true,
  subtitle,
  size = 'md',
  href,
  className,
  light = false,
  markOnly = false,
}: BrandLogoProps) {
  const s = sizes[size];
  const inner = (
    <span className={cn('inline-flex items-center gap-2.5', className)}>
      <BrandMark size={s.mark} title={title} logoUrl={logoUrl} />
      {!markOnly && withWordmark ? (
        <span className="min-w-0 text-left leading-none">
          <span
            className={cn('rs-brand-wordmark block truncate font-display font-semibold tracking-tight', s.text)}
            style={{
              /* Prefer header-ink so login/footer stay readable when sidebar is light (Paper Mint, Sky). */
              color: light
                ? 'var(--rs-header-ink, var(--rs-sidebar-ink, #F8FAFC))'
                : 'var(--rs-accent)',
              lineHeight: 1.15,
            }}
          >
            {title}
          </span>
          {subtitle ? (
            <span
              className={cn('block truncate', s.sub)}
              style={{
                color: light
                  ? 'color-mix(in srgb, var(--rs-header-ink, #F8FAFC) 72%, transparent)'
                  : 'var(--rs-muted)',
              }}
            >
              {subtitle}
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="inline-flex rounded-lg transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand/30 focus-visible:ring-offset-2"
      >
        {inner}
      </Link>
    );
  }

  return inner;
}
