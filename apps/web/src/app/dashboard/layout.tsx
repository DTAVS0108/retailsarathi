'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { AppLoader } from '@/app/_components/app-loader';
import { BrandLogo, BrandMark } from '@/app/_components/brand-logo';
import { getToken } from '@/lib/helpers';
import { NavIcon } from './_components/nav-icons';
import { itemMatchingPath, sectionContainingPath } from './_components/nav-sections';
import { MobileBottomNav, SidebarNav } from './_components/responsive-shell';
import { FloatingActionDock } from './_components/floating-action-dock';
import { FloatingCalculator, requestOpenCalculator } from './_components/floating-calculator';
import { CommandPalette, requestOpenCommandPalette } from './_components/command-palette';
import { NotificationBell } from './_components/notification-bell';
import { PartySearch } from './_components/party-search';
import { useWebAppearance } from '@/lib/use-web-appearance';
import { getWebTheme } from '@/lib/appearance-prefs';
import {
  PRODUCT_NAME,
  ShopBrandingProvider,
  clearShopBranding,
  useShopBranding,
} from '@/lib/shop-branding';

const OPEN_KEY = 'rs-nav-open-sections';
const COLLAPSE_KEY = 'rs-nav-collapsed';

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return (
    <ShopBrandingProvider>
      <DashboardLayoutInner>{children}</DashboardLayoutInner>
    </ShopBrandingProvider>
  );
}

function DashboardLayoutInner({ children }: { children: ReactNode }) {
  const { prefs: appearance } = useWebAppearance();
  const theme = getWebTheme(appearance.themeId);
  const sidebarDark = Boolean(theme.sidebarDark);
  const pathname = usePathname();
  const router = useRouter();
  const { shopName, ownerName, hasShopName, logoUrl } = useShopBranding();
  const [ready, setReady] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const activeSectionId = useMemo(() => sectionContainingPath(pathname), [pathname]);
  const activeItem = useMemo(() => itemMatchingPath(pathname), [pathname]);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const chromeSubtitle = ownerName || (hasShopName ? `${PRODUCT_NAME} · Shop OS` : 'Shop OS · desktop');

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.title = hasShopName ? `${shopName} · ${PRODUCT_NAME}` : `${PRODUCT_NAME} Dashboard`;
  }, [shopName, hasShopName]);

  useEffect(() => {
    if (!getToken()) router.replace('/login');
    else setReady(true);
  }, [router]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(OPEN_KEY);
      if (raw) setOpenSections(JSON.parse(raw) as Record<string, boolean>);
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === '1');
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!activeSectionId) return;
    setOpenSections((prev) => {
      if (prev[activeSectionId]) return prev;
      const next = { ...prev, [activeSectionId]: true };
      try {
        localStorage.setItem(OPEN_KEY, JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, [activeSectionId]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    function onResize() {
      if (window.innerWidth >= 768) setMenuOpen(false);
    }
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  function persistOpen(next: Record<string, boolean>) {
    try {
      localStorage.setItem(OPEN_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  }

  function toggleSection(id: string) {
    setOpenSections((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      persistOpen(next);
      return next;
    });
  }

  function toggleCollapsed() {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }

  function ensureSectionOpen(id: string) {
    setOpenSections((prev) => {
      if (prev[id]) return prev;
      const next = { ...prev, [id]: true };
      persistOpen(next);
      return next;
    });
  }

  function signOut() {
    localStorage.removeItem('token');
    clearShopBranding();
    router.push('/login');
  }

  if (!ready) {
    return (
      <AppLoader label={`Loading ${shopName}…`} size="lg" className="min-h-screen" />
    );
  }

  const useDarkRail = sidebarDark && appearance.stickySidebarGradient;

  const sidebarStyle = (
    appearance.stickySidebarGradient
      ? {
          borderColor: 'var(--rs-sidebar-border)',
          background: 'var(--rs-sidebar)',
          color: 'var(--rs-sidebar-ink)',
          ['--rs-ink' as string]: 'var(--rs-sidebar-ink)',
          ['--rs-muted' as string]: 'var(--rs-sidebar-muted)',
          ['--rs-border' as string]: 'var(--rs-sidebar-border)',
          ['--rs-surface' as string]: 'var(--rs-sidebar-surface)',
          ['--rs-surface-2' as string]: 'var(--rs-sidebar-soft)',
          ...(sidebarDark
            ? {
                ['--rs-accent-soft' as string]:
                  'color-mix(in srgb, var(--rs-accent) 28%, transparent)',
              }
            : null),
        }
      : {
          borderColor: 'var(--rs-border)',
          background: 'var(--rs-surface)',
          color: 'var(--rs-ink)',
        }
  ) as CSSProperties;

  const sidebarInner = (opts: { showCollapse?: boolean; onNavigate?: () => void; forceExpanded?: boolean }) => {
    const isCollapsed = opts.forceExpanded ? false : collapsed;
    return (
      <>
        <div
          className={`flex shrink-0 items-center border-b ${
            isCollapsed ? 'flex-col gap-2 px-2 py-3' : 'gap-3 px-4 py-4'
          }`}
          style={{ borderColor: useDarkRail ? 'var(--rs-sidebar-border)' : 'var(--rs-border)' }}
        >
          {isCollapsed ? (
            <BrandMark size={36} title={shopName} logoUrl={logoUrl} />
          ) : (
            <BrandLogo
              size="sm"
              title={shopName}
              logoUrl={logoUrl}
              subtitle={chromeSubtitle}
              className="min-w-0 flex-1"
              light={useDarkRail}
            />
          )}
          {opts.showCollapse ? (
            <button
              type="button"
              onClick={toggleCollapsed}
              className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-lg transition md:inline-flex"
              style={{ color: useDarkRail ? 'var(--rs-sidebar-muted)' : 'var(--rs-muted)' }}
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              <NavIcon name="panelLeft" className={`h-4 w-4 transition ${collapsed ? 'rotate-180' : ''}`} />
            </button>
          ) : null}
        </div>

        <SidebarNav
          openSections={openSections}
          activeSectionId={activeSectionId}
          onToggleSection={toggleSection}
          onEnsureSectionOpen={ensureSectionOpen}
          onNavigate={opts.onNavigate}
          collapsed={isCollapsed}
        />

        <div
          className={`shrink-0 border-t ${isCollapsed ? 'space-y-1 p-2' : 'space-y-1 p-3'}`}
          style={{ borderColor: useDarkRail ? 'var(--rs-sidebar-border)' : 'var(--rs-border)' }}
        >
          <Link
            href="/dashboard/settings"
            onClick={opts.onNavigate}
            title="Shop Settings"
            className={`flex items-center gap-2.5 rounded-xl text-sm transition ${
              isCollapsed ? 'h-10 w-10 justify-center' : 'px-3 py-2'
            }`}
            style={{ color: useDarkRail ? 'var(--rs-sidebar-muted)' : 'var(--rs-muted)' }}
          >
            <NavIcon name="settings" className="h-4 w-4" />
            {!isCollapsed ? <span>Shop Settings</span> : null}
          </Link>
          <button
            type="button"
            title="Sign out"
            className={`flex w-full items-center gap-2.5 rounded-xl text-sm transition hover:bg-red-500/15 ${
              isCollapsed ? 'h-10 w-10 justify-center' : 'px-3 py-2'
            }`}
            style={{ color: useDarkRail ? '#FCA5A5' : '#DC2626' }}
            onClick={signOut}
          >
            <NavIcon name="logout" className="h-4 w-4" />
            {!isCollapsed ? <span>Sign out</span> : null}
          </button>
        </div>
      </>
    );
  };

  return (
    <div className="rs-themed flex min-h-screen" style={{ background: 'var(--rs-bg)', color: 'var(--rs-ink)' }}>
      {/* Sticky desktop / tablet sidebar (visible from md / 768px up) */}
      <aside
        className={`rs-sidebar-panel sticky top-0 z-40 hidden h-screen w-72 shrink-0 flex-col border-r shadow-[1px_0_0_rgba(15,23,42,0.08)] transition-[width] duration-200 ease-out md:flex md:flex-col ${
          collapsed ? '!w-[4.5rem]' : ''
        }`}
        style={sidebarStyle}
      >
        {sidebarInner({ showCollapse: true })}
      </aside>

      {/* Phone drawer only */}
      {menuOpen ? (
        <div className="fixed inset-0 z-50 md:hidden">
          <button
            type="button"
            className="absolute inset-0 bg-slate-900/40"
            aria-label="Close menu"
            onClick={() => setMenuOpen(false)}
          />
          <aside
            className="rs-sidebar-panel absolute inset-y-0 left-0 flex w-[min(20rem,88vw)] flex-col shadow-2xl"
            style={sidebarStyle}
          >
            <div
              className="flex items-center justify-between border-b px-4 py-3"
              style={{ borderColor: 'var(--rs-sidebar-border)' }}
            >
              <span className="text-sm font-semibold" style={{ color: 'var(--rs-sidebar-ink)' }}>
                Menu
              </span>
              <button
                type="button"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg"
                style={{ color: 'var(--rs-sidebar-muted)' }}
                onClick={() => setMenuOpen(false)}
                aria-label="Close menu"
              >
                <NavIcon name="close" className="h-4 w-4" />
              </button>
            </div>
            {sidebarInner({ forceExpanded: true, onNavigate: () => setMenuOpen(false) })}
          </aside>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className="rs-topbar sticky top-0 z-30 flex items-center gap-3 border-b px-3 py-2.5 md:hidden"
          style={{
            paddingTop: 'max(0.625rem, env(safe-area-inset-top))',
            borderColor: 'color-mix(in srgb, var(--rs-header-ink) 18%, transparent)',
            background: 'var(--rs-header)',
            color: 'var(--rs-header-ink)',
          }}
        >
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl"
            style={{
              border: '1px solid color-mix(in srgb, var(--rs-header-ink) 22%, transparent)',
              color: 'var(--rs-header-ink)',
            }}
            onClick={() => setMenuOpen(true)}
            aria-label="Open menu"
          >
            <NavIcon name="menu" className="h-4 w-4" />
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-2.5">
            <BrandMark size={28} title={shopName} logoUrl={logoUrl} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold">{shopName}</div>
              <div className="truncate text-[11px] opacity-80">
                {activeItem?.label ?? (pathname === '/dashboard' ? 'Overview' : 'Menu')}
              </div>
            </div>
          </div>
          <div className="hidden min-w-[8rem] max-w-[10rem] sm:block">
            <PartySearch variant="onHeader" />
          </div>
          <NotificationBell light />
          <button
            type="button"
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl"
            style={{
              border: '1px solid color-mix(in srgb, var(--rs-header-ink) 22%, transparent)',
              color: 'var(--rs-header-ink)',
            }}
            onClick={() => requestOpenCalculator()}
            aria-label="Open calculator"
          >
            <NavIcon name="calculator" className="h-4 w-4" />
          </button>
          <Link
            href="/dashboard/pos"
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-semibold"
            style={{ background: 'var(--rs-surface)', color: 'var(--rs-accent)' }}
          >
            <NavIcon name="pos" className="h-3.5 w-3.5" />
            POS
          </Link>
        </header>

        {/* Desktop context bar — uses theme header chrome (matches Design & settings previews) */}
        <div
          className="rs-topbar sticky top-0 z-20 hidden items-center gap-3 border-b px-6 py-3 md:flex"
          style={{
            background: 'var(--rs-header)',
            borderColor: 'color-mix(in srgb, var(--rs-header-ink) 18%, transparent)',
            color: 'var(--rs-header-ink)',
            boxShadow: 'var(--rs-shadow)',
          }}
        >
          <PartySearch className="max-w-sm flex-1" variant="onHeader" />
          <button
            type="button"
            onClick={() => requestOpenCommandPalette()}
            className="hidden shrink-0 items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-medium opacity-90 transition hover:opacity-100 lg:inline-flex"
            style={{ borderColor: 'color-mix(in srgb, var(--rs-header-ink) 22%, transparent)', color: 'var(--rs-header-ink)' }}
            aria-label="Open command palette"
          >
            <NavIcon name="search" className="h-3.5 w-3.5" />
            <span>Search</span>
            <kbd
              className="rounded border px-1 text-[10px] opacity-80"
              style={{ borderColor: 'color-mix(in srgb, var(--rs-header-ink) 30%, transparent)' }}
            >
              Ctrl K
            </kbd>
          </button>
          <div className="flex min-w-0 flex-1 items-center gap-2 text-sm opacity-90">
            <NavIcon name={activeItem?.icon ?? 'overview'} className="h-4 w-4" />
            <span className="font-medium truncate">{shopName}</span>
            <span className="opacity-50">·</span>
            <span className="font-medium">
              {activeItem?.label ?? (pathname === '/dashboard' ? 'Overview' : 'Dashboard')}
            </span>
            {activeItem?.description ? (
              <>
                <span className="opacity-50">·</span>
                <span className="truncate opacity-80">{activeItem.description}</span>
              </>
            ) : null}
          </div>
          <NotificationBell light />
          <Link
            href="/dashboard/pos"
            className="inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-semibold shadow-sm transition hover:opacity-95"
            style={{
              background: 'var(--rs-surface)',
              color: 'var(--rs-accent)',
            }}
          >
            <NavIcon name="pos" className="h-3.5 w-3.5" />
            New bill
          </Link>
        </div>

        <main className="min-w-0 flex-1 overflow-auto pb-[calc(6.5rem+env(safe-area-inset-bottom))] md:pb-0">
          {children}
        </main>
        <MobileBottomNav />
        <FloatingActionDock />
        <FloatingCalculator showFab={appearance.showCalculatorFab} />
        <CommandPalette />
      </div>
    </div>
  );
}
