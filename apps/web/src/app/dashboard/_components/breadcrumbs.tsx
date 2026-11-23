'use client';

import Link from 'next/link';
import {
  NAV_SECTIONS,
  itemMatchingPath,
  sectionContainingPath,
  type NavLink,
  type NavSection,
} from './nav-sections';

export type BreadcrumbItem = {
  label: string;
  href?: string;
};

function sectionById(id: string | null): NavSection | null {
  if (!id) return null;
  return NAV_SECTIONS.find((s) => s.id === id) ?? null;
}

function humanizeSegment(segment: string): string {
  if (!segment) return 'Detail';
  // cuid / uuid-ish → generic label
  if (/^[a-z0-9]{20,}$/i.test(segment) || /^c[a-z0-9]{20,}$/i.test(segment)) {
    return 'Detail';
  }
  return decodeURIComponent(segment)
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/**
 * Build Home → section → page → detail crumbs from the dashboard pathname.
 * Pass `currentLabel` on detail screens (invoice #, customer name, etc.).
 */
export function buildDashboardBreadcrumbs(
  pathname: string | null | undefined,
  currentLabel?: string | null,
): BreadcrumbItem[] {
  const path = (pathname || '').split('?')[0] || '';
  if (!path.startsWith('/dashboard') && path !== '/admin') {
    return [];
  }

  const crumbs: BreadcrumbItem[] = [{ label: 'Home', href: '/dashboard' }];

  if (path === '/dashboard' || path === '/dashboard/') {
    return crumbs;
  }

  if (path === '/admin' || path.startsWith('/admin/')) {
    crumbs.push({ label: 'SaaS Admin', href: path === '/admin' ? undefined : '/admin' });
    if (path !== '/admin') {
      crumbs.push({ label: currentLabel?.trim() || humanizeSegment(path.split('/').pop() || '') });
    }
    return crumbs;
  }

  const section = sectionById(sectionContainingPath(path));
  const item = itemMatchingPath(path);

  if (section) {
    crumbs.push({ label: section.shortTitle || section.title });
  }

  if (item) {
    const atListRoot = path === item.href || path === `${item.href}/`;
    crumbs.push({
      label: item.label,
      href: atListRoot ? undefined : item.href,
    });

    if (!atListRoot) {
      const rest = path.slice(item.href.length).replace(/^\//, '');
      const parts = rest.split('/').filter(Boolean);
      if (parts.length) {
        crumbs.push({
          label: currentLabel?.trim() || humanizeSegment(parts[parts.length - 1]),
        });
      }
    }
  } else {
    // Unknown dashboard route — still show last segment
    const last = path.split('/').filter(Boolean).pop();
    if (last && last !== 'dashboard') {
      crumbs.push({ label: currentLabel?.trim() || humanizeSegment(last) });
    }
  }

  return crumbs;
}

export function Breadcrumbs({
  items,
  className,
}: {
  items: BreadcrumbItem[];
  className?: string;
}) {
  if (!items.length) return null;
  // Home alone on overview — still useful as orientation, keep it.

  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs" style={{ color: 'var(--rs-muted)' }}>
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`} className="flex min-w-0 items-center gap-1.5">
              {index > 0 ? (
                <span
                  className="select-none"
                  style={{ color: 'color-mix(in srgb, var(--rs-muted) 45%, var(--rs-border))' }}
                  aria-hidden
                >
                  /
                </span>
              ) : null}
              {item.href && !isLast ? (
                <Link
                  href={item.href}
                  className="truncate font-medium transition hover:underline"
                  style={{ color: 'var(--rs-accent)' }}
                >
                  {item.label}
                </Link>
              ) : (
                <span
                  className={isLast ? 'truncate font-semibold' : 'truncate font-medium'}
                  style={{ color: isLast ? 'var(--rs-ink)' : 'var(--rs-muted)' }}
                  aria-current={isLast ? 'page' : undefined}
                >
                  {item.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

/** Prefer longest href match so nested routes pick the right nav item. */
export function resolveNavItem(pathname: string | null): NavLink | null {
  return itemMatchingPath(pathname);
}
