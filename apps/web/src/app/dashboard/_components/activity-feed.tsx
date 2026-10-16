'use client';

import { useEffect, useState } from 'react';
import { apiWithAuth } from '@/lib/helpers';
import { ChartCard } from './charts';

type ActivityEvent = { kind: 'invoice' | 'repair' | 'stock'; id: string; label: string; detail: string; at: string };

const KIND_ICON: Record<ActivityEvent['kind'], string> = { invoice: '🧾', repair: '🔧', stock: '📦' };
const KIND_DOT: Record<ActivityEvent['kind'], string> = {
  invoice: 'bg-blue-500',
  repair: 'bg-violet-500',
  stock: 'bg-emerald-500',
};

function relativeTime(iso: string): string {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** A live-feeling timeline of what just happened across the shop — invoices, repair status
    changes, and stock movements, unioned server-side and sorted by recency. */
export function ActivityFeed() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void (async () => {
      try {
        const res = await apiWithAuth<{ events: ActivityEvent[] }>('/analytics/recent-activity?limit=8');
        setEvents(Array.isArray(res.events) ? res.events : []);
      } catch {
        setEvents([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  return (
    <ChartCard title="Recent activity" subtitle="Latest invoices, repairs, and stock movements">
      {loading ? (
        <p className="py-6 text-center text-sm text-slate-500">Loading…</p>
      ) : !events.length ? (
        <p className="py-6 text-center text-sm text-slate-500">Nothing has happened yet.</p>
      ) : (
        <ul className="max-h-80 space-y-3 overflow-y-auto">
          {events.map((e) => (
            <li key={`${e.kind}-${e.id}`} className="flex items-start gap-3">
              <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${KIND_DOT[e.kind]}`} aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-700">
                  <span className="mr-1.5">{KIND_ICON[e.kind]}</span>
                  {e.label}
                </p>
                <p className="truncate text-xs text-slate-500">{e.detail}</p>
              </div>
              <span className="shrink-0 whitespace-nowrap text-xs text-slate-400">{relativeTime(e.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </ChartCard>
  );
}
