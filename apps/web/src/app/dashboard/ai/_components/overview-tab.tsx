'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card } from '@retail-sarathi/ui';
import { apiWithAuth } from '@/lib/helpers';
import { formatDateTime, parseError, StatusBadge } from '../../_components/dashboard-ui';
import { ChartCard, DonutChart, HorizontalBarList } from '../../_components/charts';
import { NavIcon } from '../../_components/nav-icons';

type Alert = {
  type: string;
  severity: 'critical' | 'warn' | 'info';
  message: string;
};

type ReorderRow = { productId: string; productName: string; stockCoverDays: number };
type AgentAction = { id: string; title: string; type: string; status: string; createdAt: string };

const SEVERITY_STYLE: Record<string, string> = {
  critical: 'border-red-200 bg-red-50 text-red-800',
  warn: 'border-amber-200 bg-amber-50 text-amber-900',
  info: 'border-slate-200 bg-slate-50 text-slate-700',
};

const ALERT_TYPE_LABEL: Record<string, string> = {
  LOW_STOCK: 'Low stock',
  CREDIT_LIMIT: 'Credit limit',
  AGENT_PENDING: 'Agent pending',
  REPAIR_READY: 'Repair ready',
  EXPIRING_BATCH: 'Expiring batch',
};

export function OverviewTab({ onOpenTab }: { onOpenTab: (tab: 'reorder' | 'actions') => void }) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertsAt, setAlertsAt] = useState('');
  const [severityFilter, setSeverityFilter] = useState<'all' | 'critical' | 'warn' | 'info'>('all');
  const [topReorder, setTopReorder] = useState<ReorderRow[]>([]);
  const [pendingActions, setPendingActions] = useState<AgentAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    void (async () => {
      setLoading(true);
      try {
        const [alertRes, reorderRes, actionsRes] = await Promise.all([
          apiWithAuth<{ generatedAt: string; alerts: Alert[] }>('/ai/alerts'),
          apiWithAuth<{ items: ReorderRow[] }>('/ai/reorder?pageSize=5&sortBy=stockCoverDays&sortDir=asc'),
          apiWithAuth<{ items: AgentAction[] }>('/ai/agent-actions?status=PENDING&pageSize=5'),
        ]);
        setAlerts(alertRes.alerts);
        setAlertsAt(alertRes.generatedAt);
        setTopReorder(reorderRes.items);
        setPendingActions(actionsRes.items);
      } catch (err) {
        setError(parseError(err));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filteredAlerts = severityFilter === 'all' ? alerts : alerts.filter((a) => a.severity === severityFilter);
  const byType = Object.entries(
    alerts.reduce<Record<string, number>>((acc, a) => {
      acc[a.type] = (acc[a.type] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([type, value]) => ({ label: ALERT_TYPE_LABEL[type] ?? type.replace(/_/g, ' '), value }));

  if (loading) return <p className="py-10 text-center text-sm text-slate-500">Loading overview…</p>;
  if (error) return <p className="py-10 text-center text-sm text-red-600">{error}</p>;

  return (
    <div className="grid gap-4 lg:grid-cols-[1.6fr_1fr]">
      <Card className="border-slate-200">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Realtime alerts</h3>
          {alertsAt ? <span className="text-xs text-slate-400">Updated {formatDateTime(alertsAt)}</span> : null}
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          {(['all', 'critical', 'warn', 'info'] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setSeverityFilter(s)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium capitalize transition ${
                severityFilter === s ? 'bg-teal-700 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {s === 'all' ? `All (${alerts.length})` : `${s} (${alerts.filter((a) => a.severity === s).length})`}
            </button>
          ))}
        </div>
        {filteredAlerts.length ? (
          <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
            {filteredAlerts.map((a, i) => (
              <div key={`${a.type}-${i}`} className={`rounded-xl border px-3 py-2 text-sm ${SEVERITY_STYLE[a.severity]}`}>
                <span className="font-medium">{a.type.replace(/_/g, ' ')}</span> — {a.message}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No alerts right now.</p>
        )}
      </Card>

      <ChartCard title="Alerts by type" subtitle="Composition of the current feed">
        {byType.length ? (
          <DonutChart data={byType} valueFormat={(n) => `${n}`} size={140} />
        ) : (
          <p className="py-8 text-center text-sm text-slate-500">No alerts right now.</p>
        )}
      </ChartCard>

      <div className="lg:col-span-2">
        <ChartCard title="Top reorder priorities" subtitle="Lowest stock cover, worst first">
          {topReorder.length ? (
            <HorizontalBarList
              data={topReorder.map((r) => ({ label: r.productName, value: Math.max(r.stockCoverDays, 0.1) }))}
              valueFormat={(n) => `${Math.round(n)}d cover`}
            />
          ) : (
            <p className="py-8 text-center text-sm text-slate-500">Stock levels look healthy.</p>
          )}
          <button
            type="button"
            onClick={() => onOpenTab('reorder')}
            className="mt-3 text-xs font-semibold text-teal-700 hover:underline"
          >
            View full reorder list →
          </button>
        </ChartCard>
      </div>

      <Card className="border-slate-200 lg:col-span-2">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Pending agent actions</h3>
          <button type="button" onClick={() => onOpenTab('actions')} className="text-xs font-semibold text-teal-700 hover:underline">
            View all →
          </button>
        </div>
        {pendingActions.length ? (
          <div className="space-y-2">
            {pendingActions.map((a) => (
              <div key={a.id} className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <div className="flex items-center gap-2 min-w-0">
                  <NavIcon name="ai" className="h-4 w-4 shrink-0 text-teal-600" />
                  <span className="truncate font-medium text-slate-800">{a.title}</span>
                </div>
                <StatusBadge status={a.status} />
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No pending actions. Nothing needs your decision right now.</p>
        )}
      </Card>
    </div>
  );
}
