'use client';

import Link from 'next/link';
import { NavIcon } from './nav-icons';

const TONE_CLASSES: Record<string, string> = {
  teal: 'bg-teal-100 text-teal-700 group-hover:bg-teal-200',
  indigo: 'bg-indigo-100 text-indigo-700 group-hover:bg-indigo-200',
  sky: 'bg-sky-100 text-sky-700 group-hover:bg-sky-200',
  violet: 'bg-violet-100 text-violet-700 group-hover:bg-violet-200',
  amber: 'bg-amber-100 text-amber-700 group-hover:bg-amber-200',
};

const ACTIONS = [
  { href: '/dashboard/pos', label: 'New Bill', icon: 'pos', tone: 'teal' },
  { href: '/dashboard/repairs', label: 'New Repair', icon: 'repairs', tone: 'indigo' },
  { href: '/dashboard/stock-in', label: 'Stock In', icon: 'stock', tone: 'sky' },
  { href: '/dashboard/scan', label: 'Scan Sheet', icon: 'scan', tone: 'violet' },
  { href: '/dashboard/returns', label: 'Returns', icon: 'returns', tone: 'amber' },
];

/** Prominent one-click shortcuts for the most common tasks — the "required links" that replace the
    old full-nav-mirroring module grid. Full-width tinted pill buttons (icon + label side by side),
    laid out in an equal-column grid so the row always fills the available width edge to edge
    instead of clustering left with dead space to the right. */
export function QuickActionsRow() {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
      {ACTIONS.map((a) => (
        <Link key={a.href} href={a.href} className="group block">
          <div
            className={`flex items-center justify-center gap-2.5 rounded-xl px-4 py-4 shadow-sm transition duration-150 group-hover:-translate-y-0.5 group-hover:shadow-md ${TONE_CLASSES[a.tone]}`}
          >
            <NavIcon name={a.icon} className="h-5 w-5 shrink-0" />
            <span className="whitespace-nowrap text-sm font-semibold">{a.label}</span>
          </div>
        </Link>
      ))}
    </div>
  );
}
