'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { formatINR } from '@retail-sarathi/ui';
import { apiWithAuth } from '@/lib/helpers';
import { NavIcon } from './nav-icons';

type DailySummary = {
  revenue: { todayRevenue: number; yesterdaySoFarRevenue: number; deltaPct: number | null };
  lowStockCount: number;
  criticalLowStockCount: number;
  repairsReadyCount: number;
  creditLimitCount: number;
  pendingActionCount: number;
};

type Tone = 'teal' | 'amber' | 'rose' | 'indigo' | 'emerald';
type Clause = { icon: string; tone: Tone; text: string; href: string };

const TEXT_TONE_CLASSES: Record<Tone, string> = {
  teal: 'text-teal-700',
  amber: 'text-amber-700',
  rose: 'text-rose-700',
  indigo: 'text-indigo-700',
  emerald: 'text-emerald-700',
};

/** A quiet, templated "what's going on today" ticker under the WelcomeCard — plain arithmetic
    over numbers already computed for the Alerts feed / Overview KPIs, not an LLM call (same
    honesty convention as the revenue forecast's `weighted_recency_weekday_trend` label). A slim
    single-line row (colored icon + text per item, divided by thin separators), not stacked cards —
    a quiet summary reads better as a compact line than as a row of boxes. */
export function DailySummaryStrip() {
  const [data, setData] = useState<DailySummary | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await apiWithAuth<DailySummary>('/analytics/daily-summary');
        if (!cancelled) setData(res);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (failed || !data) return null;

  const clauses: Clause[] = [];
  const { revenue } = data;

  if (revenue.deltaPct !== null && Math.abs(revenue.deltaPct) >= 1) {
    const up = revenue.deltaPct >= 0;
    clauses.push({
      icon: 'pos',
      tone: up ? 'emerald' : 'rose',
      text: `Revenue ${up ? 'up' : 'down'} ${Math.abs(revenue.deltaPct).toFixed(0)}% vs yesterday (${formatINR(revenue.todayRevenue)})`,
      href: '/dashboard/invoices?status=FINALIZED',
    });
  }
  if (data.repairsReadyCount > 0) {
    clauses.push({
      icon: 'repairs',
      tone: 'indigo',
      text: `${data.repairsReadyCount} repair${data.repairsReadyCount > 1 ? 's' : ''} ready for pickup`,
      href: '/dashboard/repairs',
    });
  }
  if (data.criticalLowStockCount > 0) {
    clauses.push({
      icon: 'stock',
      tone: 'rose',
      text: `${data.criticalLowStockCount} item${data.criticalLowStockCount > 1 ? 's' : ''} out of stock`,
      href: '/dashboard/products?filter=low',
    });
  } else if (data.lowStockCount > 0) {
    clauses.push({
      icon: 'stock',
      tone: 'amber',
      text: `${data.lowStockCount} item${data.lowStockCount > 1 ? 's' : ''} low on stock`,
      href: '/dashboard/products?filter=low',
    });
  }
  if (data.creditLimitCount > 0) {
    clauses.push({
      icon: 'customers',
      tone: 'amber',
      text: `${data.creditLimitCount} customer${data.creditLimitCount > 1 ? 's' : ''} over credit limit`,
      href: '/dashboard/customers',
    });
  }
  if (data.pendingActionCount > 0) {
    clauses.push({
      icon: 'ai',
      tone: 'teal',
      text: `${data.pendingActionCount} AI suggestion${data.pendingActionCount > 1 ? 's' : ''} waiting for review`,
      href: '/dashboard/ai',
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-lg bg-slate-50 px-3.5 py-2.5 text-sm">
      <span className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-rs-muted">
        <NavIcon name="insights" className="h-3.5 w-3.5" />
        Today
      </span>
      {clauses.length === 0 ? (
        <span className="text-sm text-rs-muted">No urgent items today — all quiet.</span>
      ) : (
        clauses.map((c, i) => (
          <span key={i} className="flex items-center gap-3">
            {i > 0 ? <span className="text-slate-300">│</span> : null}
            <Link href={c.href} className={`inline-flex items-center gap-1.5 font-medium transition hover:underline ${TEXT_TONE_CLASSES[c.tone]}`}>
              <NavIcon name={c.icon} className="h-3.5 w-3.5" />
              {c.text}
            </Link>
          </span>
        ))
      )}
    </div>
  );
}
