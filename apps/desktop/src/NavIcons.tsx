import type { ReactNode } from 'react';

/** Lightweight SVG icons for desktop POS chrome (no icon package). */

type IconProps = { className?: string; size?: number };

function Svg({
  children,
  className,
  size = 20,
}: IconProps & { children: ReactNode }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

export function IconPos(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3" y="4" width="18" height="14" rx="2" />
      <path d="M7 20h10" />
      <path d="M8 8h3M8 12h8" />
    </Svg>
  );
}

export function IconHeld(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M6 4h9l3 3v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" />
      <path d="M14 4v4h4" />
      <path d="M8 13h8M8 17h5" />
    </Svg>
  );
}

export function IconReturns(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 12a9 9 0 1 0 3-6.7" />
      <path d="M3 4v5h5" />
      <path d="M12 8v4l3 2" />
    </Svg>
  );
}

export function IconBills(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M7 3h10a1 1 0 0 1 1 1v16l-3-1.5L12 20l-3-1.5L6 20V4a1 1 0 0 1 1-1z" />
      <path d="M9 8h6M9 12h6M9 16h3" />
    </Svg>
  );
}

export function IconProducts(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 8l9-4 9 4-9 4-9-4z" />
      <path d="M3 8v8l9 4 9-4V8" />
      <path d="M12 12v8" />
    </Svg>
  );
}

export function IconKhata(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9.5" cy="7" r="3.5" />
      <path d="M22 21v-2a3.5 3.5 0 0 0-2.5-3.35" />
      <path d="M16.5 3.6a3.5 3.5 0 0 1 0 6.8" />
    </Svg>
  );
}

export function IconLedgers(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
      <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
      <path d="M8 7h8M8 11h6M8 15h4" />
    </Svg>
  );
}

export function IconStats(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 19V5" />
      <path d="M4 19h16" />
      <path d="M8 16V10" />
      <path d="M12 16V7" />
      <path d="M16 16v-4" />
    </Svg>
  );
}

export function IconSettings(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v2M12 19v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M3 12h2M19 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </Svg>
  );
}

export function IconCalc(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="5" y="3" width="14" height="18" rx="2" />
      <rect x="8" y="6" width="8" height="3" rx="0.5" />
      <circle cx="9" cy="13" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="12" cy="13" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="15" cy="13" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="9" cy="17" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="12" cy="17" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="15" cy="17" r="0.9" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconSync(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M21 12a9 9 0 0 0-15.5-6.3" />
      <path d="M5.5 5.7V9H9" />
      <path d="M3 12a9 9 0 0 0 15.5 6.3" />
      <path d="M18.5 18.3V15H15" />
    </Svg>
  );
}

export function IconOnline(p: IconProps) {
  return (
    <Svg {...p} size={p.size ?? 14}>
      <path d="M5 12.5a9 9 0 0 1 14 0" />
      <path d="M8.5 15a5 5 0 0 1 7 0" />
      <circle cx="12" cy="18" r="1.2" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconOffline(p: IconProps) {
  return (
    <Svg {...p} size={p.size ?? 14}>
      <path d="M5 12.5a9 9 0 0 1 4.2-2.9" />
      <path d="M16.5 11a9 9 0 0 1 2.5 1.5" />
      <path d="M8.5 15a5 5 0 0 1 2-.7" />
      <path d="M14.5 14.5a5 5 0 0 1 1 .5" />
      <path d="M4 4l16 16" />
      <circle cx="12" cy="18" r="1.2" fill="currentColor" stroke="none" />
    </Svg>
  );
}

export function IconRepairs(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </Svg>
  );
}

export function IconExpand(p: IconProps) {
  return (
    <Svg {...p}>
      <polyline points="15 3 21 3 21 9" />
      <polyline points="9 21 3 21 3 15" />
      <line x1="21" y1="3" x2="14" y2="10" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </Svg>
  );
}

export function IconCompress(p: IconProps) {
  return (
    <Svg {...p}>
      <polyline points="4 14 10 14 10 20" />
      <polyline points="20 10 14 10 14 4" />
      <line x1="14" y1="10" x2="21" y2="3" />
      <line x1="3" y1="21" x2="10" y2="14" />
    </Svg>
  );
}

export type NavTabId =
  | 'bill'
  | 'held'
  | 'returns'
  | 'invoices'
  | 'repairs'
  | 'products'
  | 'parties'
  | 'ledgers'
  | 'stats'
  | 'settings';

export const NAV_TAB_ICONS: Record<NavTabId, (p: IconProps) => ReactNode> = {
  bill: IconPos,
  held: IconHeld,
  returns: IconReturns,
  invoices: IconBills,
  repairs: IconRepairs,
  products: IconProducts,
  parties: IconKhata,
  ledgers: IconLedgers,
  stats: IconStats,
  settings: IconSettings,
};
