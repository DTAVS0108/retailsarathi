'use client';

import { useEffect, useState } from 'react';
import { Button, Card } from '@retail-sarathi/ui';
import { apiWithAuth } from '@/lib/helpers';
import { pageShellClassName,
  MessageBanner,
  PageHeader,
  StatusBadge,
  formatDateTime,
  parseError,
  tableCellClassName,
  tableHeaderClassName,
  toNumber,
} from '../_components/dashboard-ui';

interface Alert {
  type: string;
  severity: string;
  message: string;
  productId?: string;
  customerId?: string;
  actionId?: string;
}

interface AgentAction {
  id: string;
  type: string;
  title: string;
  status: string;
  payload?: Record<string, unknown>;
  createdAt: string;
}

export default function AiPage() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [alertsAt, setAlertsAt] = useState('');
  const [agentActions, setAgentActions] = useState<AgentAction[]>([]);
  const [reorder, setReorder] = useState<Array<Record<string, unknown>>>([]);
  const [imeiAlerts, setImeiAlerts] = useState<Array<Record<string, unknown>>>([]);
  const [ocrText, setOcrText] = useState('Name: Rajesh\nPhone: 9876543210\nBarcode: 8901234567890\nQty: 2');
  const [ocrHints, setOcrHints] = useState<Array<Record<string, unknown>>>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function loadAll() {
    const [alertRes, actions, re, imei] = await Promise.all([
      apiWithAuth<{ generatedAt: string; alerts: Alert[] }>('/ai/alerts'),
      apiWithAuth<AgentAction[]>('/ai/agent-actions'),
      apiWithAuth<Array<Record<string, unknown>>>('/ai/reorder'),
      apiWithAuth<Array<Record<string, unknown>>>('/ai/duplicate-imei'),
    ]);
    setAlerts(alertRes.alerts);
    setAlertsAt(alertRes.generatedAt);
    setAgentActions(actions);
    setReorder(re);
    setImeiAlerts(imei);
  }

  useEffect(() => {
    void loadAll().catch((err) => setError(parseError(err)));
  }, []);

  async function proposeReorder() {
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const created = await apiWithAuth<AgentAction[]>('/ai/agent-actions/propose-reorder', { method: 'POST' });
      setSuccess(`Created ${created.length} reorder action(s) for your approval.`);
      await loadAll();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setBusy(false);
    }
  }

  async function decideAction(id: string, decision: 'APPROVED' | 'REJECTED') {
    setBusy(true);
    setError('');
    try {
      await apiWithAuth(`/ai/agent-actions/${id}/decide`, {
        method: 'POST',
        body: JSON.stringify({ decision }),
      });
      setSuccess(decision === 'APPROVED' ? 'Action approved.' : 'Action rejected.');
      await loadAll();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setBusy(false);
    }
  }

  async function runOcrHints() {
    try {
      const res = await apiWithAuth<{ suggestions: Array<Record<string, unknown>> }>('/ai/ocr-hints', {
        method: 'POST',
        body: JSON.stringify({ text: ocrText }),
      });
      setOcrHints(res.suggestions);
    } catch (err) {
      setError(parseError(err));
    }
  }

  const pendingActions = agentActions.filter((a) => a.status === 'PENDING');

  return (
    <div className={pageShellClassName}>
      <PageHeader
        title="AI Insights"
        description="Realtime shop alerts, agent actions with owner approval, reorder hints, and OCR helpers."
        actions={
          <Button type="button" disabled={busy} onClick={() => void proposeReorder()}>
            Propose reorder actions
          </Button>
        }
      />
      {error ? <MessageBanner tone="error">{error}</MessageBanner> : null}
      {success ? <MessageBanner tone="success">{success}</MessageBanner> : null}

      <Card className="border-slate-200">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-semibold">Realtime alerts</h3>
          {alertsAt ? <span className="text-xs text-slate-400">Updated {formatDateTime(alertsAt)}</span> : null}
        </div>
        {alerts.length ? (
          <div className="space-y-2">
            {alerts.map((a, i) => (
              <div
                key={`${a.type}-${i}`}
                className={`rounded-xl border px-3 py-2 text-sm ${
                  a.severity === 'critical'
                    ? 'border-red-200 bg-red-50 text-red-800'
                    : a.severity === 'warn'
                      ? 'border-amber-200 bg-amber-50 text-amber-900'
                      : 'border-slate-200 bg-slate-50 text-slate-700'
                }`}
              >
                <span className="font-medium">{a.type.replace(/_/g, ' ')}</span> — {a.message}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500">No alerts right now.</p>
        )}
      </Card>

      <Card className="border-slate-200">
        <h3 className="mb-3 text-lg font-semibold">Agent actions</h3>
        {!agentActions.length ? (
          <p className="text-sm text-slate-500">No agent actions yet. Click &quot;Propose reorder actions&quot; above.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr>
                  <th className={tableHeaderClassName}>When</th>
                  <th className={tableHeaderClassName}>Action</th>
                  <th className={tableHeaderClassName}>Status</th>
                  <th className={tableHeaderClassName}>Decide</th>
                </tr>
              </thead>
              <tbody>
                {agentActions.map((a) => (
                  <tr key={a.id} className="border-t border-slate-100">
                    <td className={tableCellClassName}>{formatDateTime(a.createdAt)}</td>
                    <td className={tableCellClassName}>
                      <strong>{a.title}</strong>
                      <p className="text-xs text-slate-500">{a.type.replace(/_/g, ' ')}</p>
                    </td>
                    <td className={tableCellClassName}><StatusBadge status={a.status} /></td>
                    <td className={tableCellClassName}>
                      {a.status === 'PENDING' ? (
                        <div className="flex gap-2">
                          <Button type="button" size="sm" disabled={busy} onClick={() => void decideAction(a.id, 'APPROVED')}>
                            Approve
                          </Button>
                          <Button type="button" size="sm" variant="secondary" disabled={busy} onClick={() => void decideAction(a.id, 'REJECTED')}>
                            Reject
                          </Button>
                        </div>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pendingActions.length ? (
          <p className="mt-2 text-xs text-slate-500">{pendingActions.length} pending approval.</p>
        ) : null}
      </Card>

      <section className="grid gap-4 xl:grid-cols-2">
        <Card className="border-slate-200">
          <h3 className="mb-3 text-lg font-semibold">Smart reorder list</h3>
          {reorder.length ? reorder.map((r) => (
            <div key={String(r.productId)} className="mb-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
              <strong>{String(r.productName)}</strong> — {String(r.recommendation)} · {toNumber(r.stockCoverDays)} days cover · suggest {toNumber(r.suggestedReorderQty)} units
            </div>
          )) : <p className="text-sm text-slate-500">Stock levels look healthy.</p>}
        </Card>
        <Card className="border-slate-200">
          <h3 className="mb-3 text-lg font-semibold">Duplicate IMEI alerts</h3>
          {imeiAlerts.length ? imeiAlerts.map((a) => (
            <div key={String(a.imei)} className="mb-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              IMEI {String(a.imei)} found {toNumber(a.count)} times — {String(a.message)}
            </div>
          )) : <p className="text-sm text-slate-500">No duplicate IMEIs detected.</p>}
        </Card>
      </section>

      <Card className="space-y-3 border-slate-200">
        <h3 className="text-lg font-semibold">OCR field hints</h3>
        <textarea className="w-full rounded-xl border border-slate-200 p-3 text-sm" rows={6} value={ocrText} onChange={(e) => setOcrText(e.target.value)} />
        <Button type="button" onClick={() => void runOcrHints()}>Analyze text</Button>
        {ocrHints.length ? (
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                <th className={tableHeaderClassName}>Line</th>
                <th className={tableHeaderClassName}>Suggestion</th>
                <th className={tableHeaderClassName}>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {ocrHints.map((h, i) => (
                <tr key={i}>
                  <td className={tableCellClassName}>{String(h.line)}</td>
                  <td className={tableCellClassName}>{String(h.suggestion)}</td>
                  <td className={tableCellClassName}>{Math.round(toNumber(h.confidence) * 100)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </Card>
    </div>
  );
}
