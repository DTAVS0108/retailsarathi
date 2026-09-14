import type { ReactNode } from 'react';

type IconProps = { className?: string };

function Svg({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? 'h-4 w-4 shrink-0'}
      aria-hidden
    >
      {children}
    </svg>
  );
}

export const NavIcons = {
  overview: (p: IconProps) => (
    <Svg {...p}>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </Svg>
  ),
  billing: (p: IconProps) => (
    <Svg {...p}>
      <path d="M6 2h9l3 3v17H6z" />
      <path d="M14 2v4h4" />
      <path d="M9 12h6M9 16h4" />
    </Svg>
  ),
  stock: (p: IconProps) => (
    <Svg {...p}>
      <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
      <path d="M3.3 7 12 12l8.7-5M12 22V12" />
    </Svg>
  ),
  service: (p: IconProps) => (
    <Svg {...p}>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </Svg>
  ),
  finance: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </Svg>
  ),
  people: (p: IconProps) => (
    <Svg {...p}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </Svg>
  ),
  insights: (p: IconProps) => (
    <Svg {...p}>
      <path d="M3 3v18h18" />
      <path d="M7 14l4-4 4 3 5-6" />
    </Svg>
  ),
  channels: (p: IconProps) => (
    <Svg {...p}>
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8M12 17v4" />
    </Svg>
  ),
  setup: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
    </Svg>
  ),
  pos: (p: IconProps) => (
    <Svg {...p}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20M6 14h4" />
    </Svg>
  ),
  invoices: (p: IconProps) => (
    <Svg {...p}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16l4-2 4 2 4-2 4 2V8z" />
      <path d="M8 10h6M8 14h4" />
    </Svg>
  ),
  returns: (p: IconProps) => (
    <Svg {...p}>
      <path d="M3 7h13a4 4 0 0 1 0 8H7" />
      <path d="M7 11 3 7l4-4" />
    </Svg>
  ),
  customers: (p: IconProps) => (
    <Svg {...p}>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </Svg>
  ),
  wholesale: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 2 2 7l10 5 10-5-10-5z" />
      <path d="M2 17l10 5 10-5M2 12l10 5 10-5" />
    </Svg>
  ),
  scan: (p: IconProps) => (
    <Svg {...p}>
      <path d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />
      <path d="M7 12h10" />
    </Svg>
  ),
  products: (p: IconProps) => (
    <Svg {...p}>
      <path d="M20.5 7.3 12 2 3.5 7.3v9.4L12 22l8.5-5.3z" />
      <path d="M12 22V12M3.5 7.3 12 12l8.5-4.7" />
    </Svg>
  ),
  'stock-in': (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 3v12M8 11l4 4 4-4" />
      <path d="M4 19h16" />
    </Svg>
  ),
  'products-needing-details': (p: IconProps) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4M12 16h.01" />
    </Svg>
  ),
  'stock-drafts': (p: IconProps) => (
    <Svg {...p}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M9 13h6M9 17h4" />
    </Svg>
  ),
  'trade-in': (p: IconProps) => (
    <Svg {...p}>
      <path d="M16 3h5v5M8 21H3v-5M21 3l-7 7M3 21l7-7" />
    </Svg>
  ),
  suppliers: (p: IconProps) => (
    <Svg {...p}>
      <path d="M3 9h18v11H3z" />
      <path d="M3 9 7 4h10l4 5" />
      <path d="M9 22V12h6v10" />
    </Svg>
  ),
  'purchase-bills': (p: IconProps) => (
    <Svg {...p}>
      <path d="M4 2v20l3-2 3 2 3-2 3 2 3-2 3 2V2l-3 2-3-2-3 2-3-2-3 2z" />
      <path d="M8 10h8M8 14h5" />
    </Svg>
  ),
  'purchase-orders': (p: IconProps) => (
    <Svg {...p}>
      <path d="M16 3h5v5" />
      <path d="M21 3 12 12" />
      <path d="M10 5H5a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5" />
    </Svg>
  ),
  'stock-take': (p: IconProps) => (
    <Svg {...p}>
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </Svg>
  ),
  repairs: (p: IconProps) => (
    <Svg {...p}>
      <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
    </Svg>
  ),
  gst: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4 19V5M4 19h16M8 15v4M12 11v8M16 7v12" />
    </Svg>
  ),
  accounting: (p: IconProps) => (
    <Svg {...p}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
    </Svg>
  ),
  compliance: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="M9 12l2 2 4-4" />
    </Svg>
  ),
  staff: (p: IconProps) => (
    <Svg {...p}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </Svg>
  ),
  branches: (p: IconProps) => (
    <Svg {...p}>
      <path d="M6 3v12M18 9v12M6 15a3 3 0 0 0 3-3V9a3 3 0 0 1 3-3h3" />
      <circle cx="6" cy="3" r="1.5" />
      <circle cx="18" cy="9" r="1.5" />
      <circle cx="18" cy="21" r="1.5" />
    </Svg>
  ),
  notifications: (p: IconProps) => (
    <Svg {...p}>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </Svg>
  ),
  analytics: (p: IconProps) => (
    <Svg {...p}>
      <path d="M3 3v18h18" />
      <path d="M18 17V9M13 17V5M8 17v-3" />
    </Svg>
  ),
  ai: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 2a4 4 0 0 1 4 4v1h1a3 3 0 0 1 0 6h-1v1a4 4 0 0 1-8 0v-1H7a3 3 0 0 1 0-6h1V6a4 4 0 0 1 4-4z" />
      <circle cx="9.5" cy="10.5" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="14.5" cy="10.5" r="0.8" fill="currentColor" stroke="none" />
    </Svg>
  ),
  roadmap: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="6" cy="6" r="2" />
      <circle cx="18" cy="12" r="2" />
      <circle cx="6" cy="18" r="2" />
      <path d="M8 6h6a4 4 0 0 1 4 4M8 18h6a4 4 0 0 0 4-4" />
    </Svg>
  ),
  ecommerce: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.7 13.4a2 2 0 0 0 2 1.6h9.7a2 2 0 0 0 2-1.6L23 6H6" />
    </Svg>
  ),
  hardware: (p: IconProps) => (
    <Svg {...p}>
      <rect x="4" y="4" width="16" height="12" rx="2" />
      <path d="M8 20h8M12 16v4" />
    </Svg>
  ),
  settings: (p: IconProps) => (
    <Svg {...p}>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4" />
    </Svg>
  ),
  subscription: (p: IconProps) => (
    <Svg {...p}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20M7 15h4" />
    </Svg>
  ),
  admin: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </Svg>
  ),
  home: (p: IconProps) => (
    <Svg {...p}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
    </Svg>
  ),
  logout: (p: IconProps) => (
    <Svg {...p}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </Svg>
  ),
  chevron: (p: IconProps) => (
    <Svg {...p}>
      <path d="M9 18l6-6-6-6" />
    </Svg>
  ),
  panelLeft: (p: IconProps) => (
    <Svg {...p}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <path d="M9 3v18" />
    </Svg>
  ),
  menu: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </Svg>
  ),
  close: (p: IconProps) => (
    <Svg {...p}>
      <path d="M18 6 6 18M6 6l12 12" />
    </Svg>
  ),
  plus: (p: IconProps) => (
    <Svg {...p}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  ),
  calculator: (p: IconProps) => (
    <Svg {...p}>
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <rect x="7" y="5" width="10" height="3" rx="0.5" />
      <rect x="7" y="11" width="3" height="2.5" rx="0.5" />
      <rect x="10.5" y="11" width="3" height="2.5" rx="0.5" />
      <rect x="14" y="11" width="3" height="2.5" rx="0.5" />
      <rect x="7" y="15.5" width="3" height="2.5" rx="0.5" />
      <rect x="10.5" y="15.5" width="3" height="2.5" rx="0.5" />
      <rect x="14" y="15.5" width="3" height="2.5" rx="0.5" />
    </Svg>
  ),
  corrections: (p: IconProps) => (
    <Svg {...p}>
      <path d="M4 7h12" />
      <path d="M4 12h16" />
      <path d="M4 17h10" />
      <path d="M16 15l3 3 5-6" />
    </Svg>
  ),
} as const;

export type NavIconName = keyof typeof NavIcons;

export function NavIcon({ name, className }: { name: string; className?: string }) {
  const Icon = NavIcons[name as NavIconName] ?? NavIcons.overview;
  return <Icon className={className ?? 'h-4 w-4 shrink-0'} />;
}
