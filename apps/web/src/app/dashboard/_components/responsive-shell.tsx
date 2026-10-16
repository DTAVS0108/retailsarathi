'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { NavIcon } from './nav-icons';
import { NAV_SECTIONS, itemMatchingPath } from './nav-sections';

function isActivePath(pathname: string | null, href: string) {
  if (!pathname) return false;
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname === href || pathname.startsWith(`${href}/`);
}

const navIdle =
  'text-rs-muted transition hover:bg-rs-surface-2 hover:text-rs-ink';
const navActive =
  'bg-brand-light font-semibold text-brand shadow-sm ring-1 ring-brand/25';

export function SidebarNav({
  openSections,
  activeSectionId,
  onToggleSection,
  onEnsureSectionOpen,
  onNavigate,
  collapsed = false,
}: {
  openSections: Record<string, boolean>;
  activeSectionId: string | null;
  onToggleSection: (id: string) => void;
  onEnsureSectionOpen?: (id: string) => void;
  onNavigate?: () => void;
  collapsed?: boolean;
}) {
  const pathname = usePathname();
  // Pick the single most-specific matching item (e.g. /dashboard/repairs/analytics wins over
  // the shorter /dashboard/repairs) so two sibling nav links never highlight at once.
  const activeItem = itemMatchingPath(pathname);

  if (collapsed) {
    return (
      <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-2 py-3" aria-label="Main">
        <Link
          href="/dashboard"
          title="Overview"
          onClick={onNavigate}
          className={`flex h-10 w-10 items-center justify-center rounded-xl transition ${
            isActivePath(pathname, '/dashboard') ? navActive : navIdle
          }`}
        >
          <NavIcon name="overview" className="h-[18px] w-[18px]" />
        </Link>

        <div className="my-1 h-px bg-rs-border" />

        {NAV_SECTIONS.map((section) => {
          const sectionActive = section.id === activeSectionId;
          const first = section.items[0];
          return (
            <Link
              key={section.id}
              href={first?.href ?? '/dashboard'}
              title={section.title}
              onClick={() => {
                onEnsureSectionOpen?.(section.id);
                onNavigate?.();
              }}
              className={`flex h-10 w-10 items-center justify-center rounded-xl transition ${
                sectionActive ? navActive : navIdle
              }`}
            >
              <NavIcon name={section.icon} className="h-[18px] w-[18px]" />
            </Link>
          );
        })}
      </nav>
    );
  }

  return (
    <nav className="flex-1 overflow-y-auto px-2 py-3" aria-label="Main">
      <Link
        href="/dashboard"
        onClick={onNavigate}
        className={`mb-2 flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
          isActivePath(pathname, '/dashboard') ? navActive : navIdle
        }`}
      >
        <NavIcon name="overview" className="h-4 w-4 text-current" />
        <span>Overview</span>
      </Link>

      <div className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-rs-muted">
        Modules
      </div>

      {NAV_SECTIONS.map((section) => {
        const isOpen = openSections[section.id] ?? section.id === activeSectionId;
        const sectionActive = section.id === activeSectionId;

        return (
          <div key={section.id} className="mb-1">
            <button
              type="button"
              onClick={() => onToggleSection(section.id)}
              className={`flex w-full items-center gap-2.5 rounded-xl px-3 py-2 text-left transition ${
                sectionActive
                  ? 'bg-rs-surface-2 text-rs-ink'
                  : 'text-rs-muted hover:bg-rs-surface-2 hover:text-rs-ink'
              }`}
              aria-expanded={isOpen}
            >
              <span
                className={`flex h-7 w-7 items-center justify-center rounded-lg ${
                  sectionActive
                    ? 'bg-rs-surface text-brand shadow-sm ring-1 ring-rs-border'
                    : 'bg-rs-surface-2 text-rs-muted'
                }`}
              >
                <NavIcon name={section.icon} className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-semibold leading-tight">{section.title}</span>
                <span className="mt-0.5 block truncate text-[10px] font-normal text-rs-muted">
                  {section.description}
                </span>
              </span>
              <NavIcon
                name="chevron"
                className={`h-3.5 w-3.5 shrink-0 text-rs-muted transition-transform duration-200 ${
                  isOpen ? 'rotate-90' : ''
                }`}
              />
            </button>

            <div
              className={`grid transition-[grid-template-rows] duration-200 ease-out ${
                isOpen ? 'grid-rows-[1fr]' : 'grid-rows-[0fr]'
              }`}
            >
              <div className="overflow-hidden">
                <div className="relative ml-[1.35rem] border-l border-rs-border py-1 pl-3">
                  {section.items.map((item) => {
                    const active = activeItem?.href === item.href;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={onNavigate}
                        title={item.description}
                        className={`mb-0.5 flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition ${
                          active ? navActive : navIdle
                        }`}
                      >
                        <NavIcon
                          name={item.icon}
                          className={`h-3.5 w-3.5 ${active ? 'text-brand' : 'text-rs-muted'}`}
                        />
                        <span className="min-w-0 truncate">{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </nav>
  );
}

const MOBILE_QUICK = [
  { href: '/dashboard', label: 'Home', icon: 'home' },
  { href: '/dashboard/pos', label: 'POS', icon: 'pos' },
  { href: '/dashboard/stock-in', label: 'Stock', icon: 'stock-in' },
  { href: '/dashboard/invoices', label: 'Bills', icon: 'invoices' },
  { href: '/dashboard/products', label: 'Items', icon: 'products' },
] as const;

export function MobileBottomNav() {
  const pathname = usePathname();

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-40 border-t border-rs-border bg-rs-surface/95 backdrop-blur md:hidden"
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      aria-label="Quick links"
    >
      <div className="mx-auto grid max-w-lg grid-cols-5 gap-1 px-1 py-1.5">
        {MOBILE_QUICK.map((item) => {
          const active = isActivePath(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`relative flex flex-col items-center rounded-xl px-1 py-2 text-[11px] font-medium transition-all duration-200 active:scale-95 ${
                active ? 'text-brand' : 'text-rs-muted hover:bg-rs-surface-2'
              }`}
            >
              {active ? (
                <span className="absolute inset-x-2 top-0 h-0.5 rounded-full bg-brand" aria-hidden />
              ) : null}
              <span
                className={`flex h-8 w-8 items-center justify-center rounded-xl transition-colors ${
                  active ? 'bg-brand-light' : ''
                }`}
              >
                <NavIcon name={item.icon} className="h-4 w-4" />
              </span>
              <span className="mt-0.5">{item.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
