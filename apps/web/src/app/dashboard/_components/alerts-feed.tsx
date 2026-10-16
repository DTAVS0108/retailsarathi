'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiWithAuth } from '@/lib/helpers';
import { ChartCard } from './charts';

type Alert = {
  type: string;
  severity: 'critical' | 'warn' | 'info';
  message: string;
  productId?: string;
  customerId?: string;
  actionId?: string;
  jobId?: string;
};

// Reserved status colors (dataviz skill) — never the categorical chart palette, so an alert's
// urgency is never confused with "which series is this."
const SEVERITY_STYLE: Record<Alert['severity'], string> = {
  critical: 'border-red-200 bg-red-50 text-red-800',
  warn: 'border-amber-200 bg-amber-50 text-amber-900',
  info: 'border-slate-200 bg-slate-50 text-slate-700',
};

function hrefFor(a: Alert): string | null {
  if (a.type === 'LOW_STOCK') return '/dashboard/products?filter=low';
  if (a.type === 'CREDIT_LIMIT') return '/dashboard/customers';
  if (a.type === 'REPAIR_READY') return '/dashboard/repairs';
  if (a.type === 'AGENT_PENDING') return '/dashboard/ai';
  if (a.type === 'EXPIRING_BATCH') return '/dashboard/products';
  return null;
}

/** Reuses the same /ai/alerts endpoint already powering the AI Insights page — "what needs my
    attention today," clickable straight through to the relevant page. */
export function AlertsFeed() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const res = await apiWithAuth<{ alerts: Alert[] }>('/ai/alerts');
        setAlerts(Array.isArray(res.alerts) ? res.alerts : []);
      } catch {
        setAlerts([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <ChartCard title="Needs attention" subtitle="Low stock, credit limits, repairs ready for pickup">
      {loading ? (
        <p className="py-6 text-center text-sm text-slate-500">Loading…</p>
      ) : !alerts.length ? (
        <p className="py-6 text-center text-sm text-slate-500">All clear — nothing needs attention right now.</p>
      ) : (
        <ul className="max-h-80 space-y-2 overflow-y-auto">
          {alerts.map((a, i) => {
            const href = hrefFor(a);
            const row = (
              <div className={`rounded-xl border px-3 py-2 text-sm transition ${SEVERITY_STYLE[a.severity]} ${href ? 'hover:opacity-80' : ''}`}>
                {a.message}
              </div>
            );
            return <li key={`${a.type}-${i}`}>{href ? <Link href={href}>{row}</Link> : row}</li>;
          })}
        </ul>
      )}
    </ChartCard>
  );
}
