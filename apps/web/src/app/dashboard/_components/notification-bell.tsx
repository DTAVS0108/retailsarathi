'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { apiWithAuth } from '@/lib/helpers';
import { NavIcon } from './nav-icons';

type Alert = {
  type: string;
  severity: 'critical' | 'warn' | 'info';
  message: string;
  productId?: string;
  customerId?: string;
  actionId?: string;
  jobId?: string;
};

// Same reserved-status classes as alerts-feed.tsx, so a bell row and a Dashboard-feed row for the
// same alert always look identical.
const SEVERITY_STYLE: Record<Alert['severity'], string> = {
  critical: 'border-red-200 bg-red-50 text-red-800',
  warn: 'border-amber-200 bg-amber-50 text-amber-900',
  info: 'border-slate-200 bg-slate-50 text-slate-700',
};

function hrefFor(a: Alert): string {
  if (a.type === 'LOW_STOCK') return '/dashboard/products?filter=low';
  if (a.type === 'CREDIT_LIMIT') return '/dashboard/customers';
  if (a.type === 'REPAIR_READY') return '/dashboard/repairs';
  if (a.type === 'AGENT_PENDING') return '/dashboard/ai';
  if (a.type === 'EXPIRING_BATCH') return '/dashboard/products';
  return '/dashboard';
}

/** A live count of "things needing attention right now" (not a true unread-since-last-viewed
    count — no per-user read state exists anywhere in this app, and adding one just for a header
    badge would be new schema for a cosmetic feature). Reuses the same /ai/alerts data already
    powering the Dashboard's AlertsFeed, so the count and the dropdown always agree with what's
    shown there. */
export function NotificationBell({ light = false }: { light?: boolean }) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiWithAuth<{ alerts: Alert[] }>('/ai/alerts');
        if (!cancelled) setAlerts(Array.isArray(res.alerts) ? res.alerts : []);
      } catch {
        if (!cancelled) setAlerts([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, []);

  const hasCritical = alerts.some((a) => a.severity === 'critical');
  const badgeClass = hasCritical ? 'bg-red-600' : 'bg-amber-500';

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="relative inline-flex h-10 w-10 items-center justify-center rounded-xl"
        style={
          light
            ? { border: '1px solid color-mix(in srgb, var(--rs-header-ink) 22%, transparent)', color: 'var(--rs-header-ink)' }
            : { border: '1px solid var(--rs-border)', color: 'var(--rs-ink)' }
        }
        aria-label={`Notifications${alerts.length ? ` (${alerts.length})` : ''}`}
      >
        <NavIcon name="bell" className="h-4 w-4" />
        {alerts.length ? (
          <span
            className={`absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-bold text-white ${badgeClass}`}
          >
            {alerts.length > 9 ? '9+' : alerts.length}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          className="absolute right-0 top-full z-50 mt-2 w-80 max-w-[90vw] overflow-hidden rounded-xl border shadow-lg"
          style={{ borderColor: 'var(--rs-border)', background: 'var(--rs-surface)', color: 'var(--rs-ink)' }}
        >
          <div className="border-b px-4 py-2.5 text-sm font-semibold" style={{ borderColor: 'var(--rs-border)' }}>
            Needs attention {alerts.length ? `(${alerts.length})` : ''}
          </div>
          <div className="max-h-80 overflow-y-auto p-2">
            {alerts.length === 0 ? (
              <p className="px-2 py-6 text-center text-sm" style={{ color: 'var(--rs-muted)' }}>
                All quiet — nothing needs attention.
              </p>
            ) : (
              alerts.slice(0, 6).map((a, i) => (
                <Link
                  key={i}
                  href={hrefFor(a)}
                  onClick={() => setOpen(false)}
                  className={`mb-1.5 block rounded-lg border px-3 py-2 text-xs last:mb-0 ${SEVERITY_STYLE[a.severity]}`}
                >
                  {a.message}
                </Link>
              ))
            )}
          </div>
          <Link
            href="/dashboard"
            onClick={() => setOpen(false)}
            className="block border-t px-4 py-2.5 text-center text-xs font-semibold"
            style={{ borderColor: 'var(--rs-border)', color: 'var(--rs-accent)' }}
          >
            View all on Dashboard
          </Link>
        </div>
      ) : null}
    </div>
  );
}
