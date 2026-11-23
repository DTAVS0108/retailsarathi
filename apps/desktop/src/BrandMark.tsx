import { useId } from 'react';
import { resolveUploadUrl } from './api';

/** Theme-aware RetailSarathi mark — follows --rs-accent / --rs-on-accent / --rs-accent-secondary. */
export function BrandMark({
  size = 32,
  className = '',
  title = 'RetailSarathi',
  logoUrl,
  apiUrl,
}: {
  size?: number;
  className?: string;
  title?: string;
  logoUrl?: string | null;
  apiUrl?: string;
}) {
  const src = apiUrl ? resolveUploadUrl(apiUrl, logoUrl) : null;
  if (src) {
    return (
      <img
        src={src}
        alt={title}
        width={size}
        height={size}
        className={`rs-brand-mark shrink-0 rounded-[22%] object-contain bg-white shadow-sm ${className}`.trim()}
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
      className={`rs-brand-mark shrink-0 rounded-[22%] shadow-sm ${className}`.trim()}
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
      <path fill="var(--rs-on-accent, #F8FFFE)" d="M52 38h16c6 0 10 3 10 8s-4 8-10 8H52V38z" />
      <circle cx="74" cy="34" r="7" fill={`url(#${sparkId})`} />
      <path
        fill="var(--rs-accent-secondary, #F59E0B)"
        d="M96 52c8 6 12 16 10 26-1 4 2 6 5 4 8-12 4-30-10-40-3-2-6 1-5 10z"
      />
    </svg>
  );
}
