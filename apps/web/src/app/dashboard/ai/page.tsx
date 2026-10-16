'use client';

import { useEffect, useState } from 'react';
import { apiWithAuth } from '@/lib/helpers';
import { pageShellClassName, PageHeader, parseError, MessageBanner } from '../_components/dashboard-ui';
import { KpiCard } from '../_components/kpi-card';
import { ScrollableTabBar } from '../_components/scrollable-tab-bar';
import { OverviewTab } from './_components/overview-tab';
import { ReorderTab } from './_components/reorder-tab';
import { AgentActionsTab } from './_components/agent-actions-tab';
import { DataQualityTab } from './_components/data-quality-tab';

type Tab = 'overview' | 'reorder' | 'actions' | 'quality';

const TABS: Array<{ id: Tab; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'reorder', label: 'Reorder & Forecast' },
  { id: 'actions', label: 'Agent Actions' },
  { id: 'quality', label: 'Data Quality' },
];

export default function AiPage() {
  const [tab, setTab] = useState<Tab>('overview');
  const [visited, setVisited] = useState<Set<Tab>>(new Set(['overview']));

  const [kpis, setKpis] = useState({ alerts: 0, criticalAlerts: 0, pendingActions: 0, reorderItems: 0, dupImeis: 0 });
  const [kpiError, setKpiError] = useState('');

  function openTab(next: Tab) {
    setTab(next);
    setVisited((prev) => new Set(prev).add(next));
  }

  async function loadKpis() {
    try {
      const [alertRes, reorderRes, actionsRes, imeiRes] = await Promise.all([
        apiWithAuth<{ alerts: Array<{ severity: string }> }>('/ai/alerts'),
        apiWithAuth<{ total: number }>('/ai/reorder?pageSize=1'),
        apiWithAuth<{ total: number }>('/ai/agent-actions?status=PENDING&pageSize=1'),
        apiWithAuth<unknown[]>('/ai/duplicate-imei'),
      ]);
      setKpis({
        alerts: alertRes.alerts.length,
        criticalAlerts: alertRes.alerts.filter((a) => a.severity === 'critical').length,
        pendingActions: actionsRes.total,
        reorderItems: reorderRes.total,
        dupImeis: imeiRes.length,
      });
    } catch (err) {
      setKpiError(parseError(err));
    }
  }

  useEffect(() => {
    void loadKpis();
  }, []);

  return (
    <div className={pageShellClassName}>
      <PageHeader
        title="AI Insights"
        description="Realtime shop alerts, agent actions with owner approval, reorder hints, and data-quality checks."
      />
      {kpiError ? <MessageBanner tone="error">{kpiError}</MessageBanner> : null}

      <section className="grid gap-4 grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Active alerts" value={String(kpis.alerts)} icon="insights" tone={kpis.criticalAlerts ? 'rose' : 'amber'} hint="Right now" />
        <KpiCard label="Pending actions" value={String(kpis.pendingActions)} icon="ai" tone="indigo" hint="Awaiting your decision" />
        <KpiCard label="Items to reorder" value={String(kpis.reorderItems)} icon="stock" tone="amber" hint="Below healthy stock" />
        <KpiCard label="Duplicate IMEIs" value={String(kpis.dupImeis)} icon="compliance" tone="rose" hint="Possible data issues" />
      </section>

      <ScrollableTabBar tabs={TABS} active={tab} onChange={(id) => openTab(id)} />

      <div>
        {tab === 'overview' ? <OverviewTab onOpenTab={(t) => openTab(t === 'reorder' ? 'reorder' : 'actions')} /> : null}
        {visited.has('reorder') ? <div hidden={tab !== 'reorder'}><ReorderTab /></div> : null}
        {visited.has('actions') ? <div hidden={tab !== 'actions'}><AgentActionsTab onChanged={() => void loadKpis()} /></div> : null}
        {visited.has('quality') ? <div hidden={tab !== 'quality'}><DataQualityTab /></div> : null}
      </div>
    </div>
  );
}
