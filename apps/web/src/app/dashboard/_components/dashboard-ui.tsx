'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState, type ReactNode } from 'react';
import { Badge, Card } from '@retail-sarathi/ui';
import { BrandMark } from '@/app/_components/brand-logo';
import { toast } from '@/app/_components/toast';
import { useShopBranding } from '@/lib/shop-branding';
import { Breadcrumbs, buildDashboardBreadcrumbs, type BreadcrumbItem } from './breadcrumbs';
import { NavIcon } from './nav-icons';

export const inputClassName =
  'w-full min-h-11 rounded-xl border border-rs-border bg-rs-surface px-3.5 py-2.5 text-sm text-rs-ink shadow-sm outline-none transition placeholder:text-rs-muted focus:border-brand focus:ring-2 focus:ring-brand-light';

export const textareaClassName = `${inputClassName} min-h-28 resize-y py-3`;
export const selectClassName = inputClassName;

/** Standard page shell — same gutters on every dashboard view. */
export const pageShellClassName = 'space-y-6 p-4 sm:p-6 lg:p-8';

/** Compact toolbar / chip row gap. */
export const controlGapClassName = 'flex flex-wrap items-center gap-2';

export const tableHeaderClassName =
  'px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-rs-muted';
export const tableCellClassName = 'px-4 py-3 align-top text-sm text-rs-ink';

/** Native <button> / <a> that should match Button md height when not using <Button>. */
export const nativeButtonClassName =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition';

export const nativeButtonSecondaryClassName = `${nativeButtonClassName} border border-rs-border bg-rs-surface text-rs-ink hover:bg-rs-surface-2`;
export const nativeButtonPrimaryClassName = `${nativeButtonClassName} bg-brand text-brand-on hover:bg-brand-dark`;

/** Quiet text button / chip hover used across lists & tables */
export const softHoverClassName = 'transition hover:bg-rs-surface-2';

export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(' ');
}

export function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseError(error: unknown): string {
  if (error instanceof Error && error.message) {
    const msg = error.message.trim();
    if (/internal server error/i.test(msg)) {
      return 'Server error. Please try again. If it keeps failing, restart the API.';
    }
    return msg;
  }
  return 'Something went wrong. Please try again.';
}

export function formatDate(value?: string | Date | null) {
  if (!value) return '—';
  return new Date(value).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(value?: string | Date | null) {
  if (!value) return '—';
  return new Date(value).toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function PageHeader({
  title,
  description,
  actions,
  breadcrumbs,
  breadcrumbLabel,
  showBreadcrumbs = true,
}: {
  title: string;
  description: string;
  actions?: ReactNode;
  /** Explicit crumbs — overrides auto path crumbs. */
  breadcrumbs?: BreadcrumbItem[];
  /** Label for the current (last) crumb on detail routes, e.g. invoice number. */
  breadcrumbLabel?: string | null;
  /** Set false only for rare full-bleed screens. Default true app-wide. */
  showBreadcrumbs?: boolean;
}) {
  const pathname = usePathname();
  const { shopName } = useShopBranding();
  const autoCrumbs = showBreadcrumbs ? buildDashboardBreadcrumbs(pathname, breadcrumbLabel) : [];
  const crumbs =
    breadcrumbs ??
    (pathname === '/dashboard' || pathname === '/dashboard/' ? [] : autoCrumbs);

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-rs-border bg-rs-surface/90 p-4 shadow-sm sm:gap-4 sm:rounded-3xl sm:p-5 sm:flex-row sm:items-start sm:justify-between lg:p-6">
      <div className="min-w-0 space-y-1.5">
        {crumbs.length > 0 ? <Breadcrumbs items={crumbs} className="mb-0.5" /> : null}
        <div className="flex items-center gap-2">
          <BrandMark size={22} className="shadow-none" title={shopName} />
          <p className="truncate text-xs font-semibold uppercase tracking-[0.24em]" style={{ color: 'var(--rs-accent)' }}>
            {shopName}
          </p>
        </div>
        <h1 className="text-xl font-semibold text-rs-ink sm:text-2xl lg:text-3xl">{title}</h1>
        <p className="max-w-3xl text-sm leading-6 text-rs-muted">{description}</p>
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2 sm:gap-3">{actions}</div> : null}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  href,
}: {
  label: string;
  value: string;
  hint?: string;
  href?: string;
}) {
  const content = (
    <div className="space-y-2.5 p-1">
      <p className="text-sm font-medium text-rs-muted">{label}</p>
      <p className="text-2xl font-semibold tracking-tight text-rs-ink sm:text-3xl">{value}</p>
      {hint ? <p className="text-xs text-rs-muted">{hint}</p> : null}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block transition hover:opacity-90">
        <Card className="border-rs-border hover:border-brand hover:shadow-sm">{content}</Card>
      </Link>
    );
  }

  return <Card className="border-rs-border">{content}</Card>;
}

/** "▲18%" in a solid green pill when good, "▼7%" in a rose pill when bad — a colorful badge, not
    just tinted text, so a delta reads at a glance from across the card. `invert` for metrics where
    lower is better (e.g. turnaround time). Shared by every stat card that shows a period-over-
    period delta. */
export function DeltaChip({ value, invert = false }: { value: number | null; invert?: boolean }) {
  if (value == null) {
    return (
      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
        No prior-period data
      </span>
    );
  }
  if (value === 0) {
    return (
      <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-500">
        Flat vs previous period
      </span>
    );
  }
  const isGood = invert ? value < 0 : value > 0;
  const arrow = value > 0 ? '▲' : '▼';
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ${
        isGood ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
      }`}
    >
      {arrow} {Math.abs(value)}% vs previous period
    </span>
  );
}

/** Small pill-group toggle — shared by every widget that switches between a few named views
    (metric, tab, category) without needing a full dropdown. */
export function SegmentedToggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: Array<{ value: T; label: string }>;
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
      {options.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
            value === opt.value ? 'bg-white text-brand shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-dashed border-rs-border bg-rs-surface-2 px-6 py-12 text-center">
      <h3 className="text-lg font-semibold text-rs-ink">{title}</h3>
      <p className="mt-2 text-sm text-rs-muted">{description}</p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function MessageBanner({
  tone,
  children,
  dismissible = true,
  /** Raise a global toast (default true for string children). */
  alsoToast,
  /** Auto-hide after this many ms (default 3000). Set 0 to keep until dismissed. */
  autoHideMs = 3000,
  className,
  onDismiss,
}: {
  tone: 'error' | 'success' | 'info' | 'warn';
  children: ReactNode;
  dismissible?: boolean;
  alsoToast?: boolean;
  autoHideMs?: number;
  className?: string;
  onDismiss?: () => void;
}) {
  const [hidden, setHidden] = useState(false);
  const message = typeof children === 'string' ? children : null;
  const shouldToast = alsoToast ?? Boolean(message);

  useEffect(() => {
    setHidden(false);
  }, [children, tone]);

  useEffect(() => {
    if (!shouldToast || !message) return;
    const key = `${tone}:${message}`;
    const now = Date.now();
    const prev = (globalThis as { __rsToastDedupe?: Map<string, number> }).__rsToastDedupe;
    const map = prev ?? new Map<string, number>();
    (globalThis as { __rsToastDedupe?: Map<string, number> }).__rsToastDedupe = map;
    const last = map.get(key) ?? 0;
    if (now - last < 1200) return;
    map.set(key, now);

    if (tone === 'success') toast.success(message);
    else if (tone === 'error') toast.error(message);
    else if (tone === 'warn') toast.warn(message);
    else toast.info(message);
  }, [message, shouldToast, tone]);

  useEffect(() => {
    if (!children || autoHideMs <= 0) return;
    // Success / plain info already toast-only (no banner).
    if (tone === 'success' || (tone === 'info' && message)) return;
    const timer = window.setTimeout(() => {
      setHidden(true);
      onDismiss?.();
    }, autoHideMs);
    return () => window.clearTimeout(timer);
  }, [children, tone, message, autoHideMs, onDismiss]);

  // Plain success / info strings are toast-only (less banner clutter).
  // Rich info (links, JSX) stays as an inline banner.
  if (tone === 'success' || (tone === 'info' && message)) {
    return null;
  }

  if (hidden || !children) return null;

  const tones = {
    error: {
      wrap: 'border-red-200 bg-red-50 text-red-800',
      iconWrap: 'bg-red-100 text-red-700',
      glyph: '!',
      title: 'Error',
    },
    warn: {
      wrap: 'border-amber-200 bg-amber-50 text-amber-900',
      iconWrap: 'bg-amber-100 text-amber-800',
      glyph: '⚠',
      title: 'Check this',
    },
    success: {
      wrap: 'border-emerald-200 bg-emerald-50 text-emerald-800',
      iconWrap: 'bg-emerald-100 text-emerald-700',
      glyph: '✓',
      title: 'Success',
    },
    info: {
      wrap: 'border-teal-200 bg-teal-50 text-teal-800',
      iconWrap: 'bg-teal-100 text-brand',
      glyph: 'i',
      title: 'Info',
    },
  } as const;

  const t = tones[tone];

  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm shadow-sm',
        t.wrap,
        className,
      )}
    >
      <span className={cn('mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold', t.iconWrap)}>
        {t.glyph}
      </span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{t.title}</p>
        <div className="mt-0.5 leading-5 opacity-90">{children}</div>
      </div>
      {dismissible ? (
        <button
          type="button"
          aria-label="Dismiss"
          className="rounded-lg px-2 py-1 text-current/60 transition hover:bg-black/5 hover:text-current"
          onClick={() => {
            setHidden(true);
            onDismiss?.();
          }}
        >
          ✕
        </button>
      ) : null}
    </div>
  );
}

export function ModuleLinkCard({
  href,
  title,
  description,
  badge,
  icon,
}: {
  href: string;
  title: string;
  description: string;
  badge?: string;
  icon?: string;
}) {
  return (
    <Link href={href} className="group block">
      <Card className="h-full border-slate-200 transition duration-150 group-hover:-translate-y-0.5 group-hover:border-teal-200 group-hover:shadow-md">
        <div className="flex h-full flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              {icon ? (
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-brand">
                  <NavIcon name={icon} className="h-4 w-4" />
                </span>
              ) : null}
              <div className="min-w-0">
                <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">{description}</p>
              </div>
            </div>
            {badge ? <Badge color="teal">{badge}</Badge> : null}
          </div>
          <span className="mt-auto text-sm font-medium text-brand">Open module</span>
        </div>
      </Card>
    </Link>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const normalized = status.toUpperCase();
  const color =
    normalized === 'FINALIZED' ||
    normalized === 'READY' ||
    normalized === 'DELIVERED' ||
    normalized === 'AVAILABLE'
      ? 'green'
      : normalized === 'CANCELLED' || normalized === 'RETIRED'
        ? 'red'
        : normalized === 'LOW' ||
            normalized === 'AWAITING_PARTS' ||
            normalized === 'ON_HOLD' ||
            normalized === 'ON_LOAN'
          ? 'amber'
          : normalized === 'IN_REPAIR' ||
              normalized === 'DIAGNOSED' ||
              normalized === 'AWAITING_CUSTOMER_APPROVAL'
            ? 'teal'
            : 'gray';

  return <Badge color={color}>{status.replace(/_/g, ' ')}</Badge>;
}
