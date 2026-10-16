'use client';
import { AppLoader } from '@/app/_components/app-loader';

import { useEffect, useState } from 'react';
import { Button, Card } from '@retail-sarathi/ui';
import { apiWithAuth } from '@/lib/helpers';
import { pageShellClassName,
  EmptyState,
  MessageBanner,
  PageHeader,
  cn,
  formatDateTime,
  inputClassName,
  parseError,
  selectClassName,
  tableCellClassName,
  tableHeaderClassName,
  textareaClassName,
} from '../_components/dashboard-ui';

type Channel = 'SMS' | 'WHATSAPP' | 'EMAIL';

interface Template {
  id: string;
  name: string;
  channel: Channel;
  body: string;
  variables: string[];
}

const REPAIR_TEMPLATE_PRESETS: Array<{ name: string; channel: Channel; body: string }> = [
  {
    name: 'repair_estimate_ready',
    channel: 'WHATSAPP',
    body: 'Repair estimate for {{deviceModel}} ({{jobNumber}}): ₹{{amount}}. Reply YES to approve.',
  },
  {
    name: 'repair_ready_for_pickup',
    channel: 'WHATSAPP',
    body: 'Your {{deviceModel}} ({{jobNumber}}) is ready for pickup. Please collect it at your earliest convenience.',
  },
  {
    name: 'repair_warranty_expiring',
    channel: 'WHATSAPP',
    body: 'The warranty on your {{deviceModel}} repair ({{jobNumber}}) ends on {{warrantyEndsAt}}. Contact us before then for any warranty claims.',
  },
  {
    name: 'repair_overdue_pickup',
    channel: 'WHATSAPP',
    body: 'Reminder: your {{deviceModel}} ({{jobNumber}}) has been ready for pickup for a while. Please collect it soon.',
  },
];

interface LogEntry {
  id: string;
  channel: Channel;
  recipient: string;
  body: string;
  status: string;
  createdAt: string;
  sentAt?: string | null;
  deliveredAt?: string | null;
  error?: string | null;
}

const STATUS_STYLE: Record<string, string> = {
  SENT: 'bg-emerald-100 text-emerald-800',
  PENDING: 'bg-amber-100 text-amber-800',
  FAILED: 'bg-rose-100 text-rose-800',
};

export default function NotificationsPage() {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [name, setName] = useState('');
  const [channel, setChannel] = useState<Channel>('SMS');
  const [body, setBody] = useState('Hello {{name}}, your repair estimate is ₹{{amount}}.');
  const [testRecipient, setTestRecipient] = useState('');
  const [testBody, setTestBody] = useState('Test message from RetailSarathi');

  const [broadcastTemplateId, setBroadcastTemplateId] = useState('');
  const [broadcastAudienceType, setBroadcastAudienceType] = useState<'customers' | 'staff'>('customers');
  const [broadcastOutstandingOnly, setBroadcastOutstandingOnly] = useState(false);
  const [broadcastPreviewCount, setBroadcastPreviewCount] = useState<number | null>(null);
  const [broadcastResult, setBroadcastResult] = useState<{ audienceSize: number; sent: number; failed: number; skipped: number } | null>(null);
  const [broadcasting, setBroadcasting] = useState(false);

  async function load() {
    try {
      setLoading(true);
      setError('');
      const [templateRes, logRes] = await Promise.all([
        apiWithAuth<Template[]>('/notifications/templates'),
        apiWithAuth<LogEntry[]>('/notifications/logs'),
      ]);
      setTemplates(templateRes);
      setLogs(logRes);
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function createTemplate(event: React.FormEvent) {
    event.preventDefault();
    try {
      setSaving(true);
      setError('');
      const variables = [...body.matchAll(/\{\{(\w+)\}\}/g)].map((m) => m[1]);
      await apiWithAuth('/notifications/templates', {
        method: 'POST',
        body: JSON.stringify({ name, channel, body, variables }),
      });
      setName('');
      setSuccess('Template saved.');
      await load();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setSaving(false);
    }
  }

  async function sendTest(event: React.FormEvent) {
    event.preventDefault();
    try {
      setSaving(true);
      setError('');
      await apiWithAuth('/notifications/send', {
        method: 'POST',
        body: JSON.stringify({ channel, recipient: testRecipient, body: testBody }),
      });
      setSuccess('Message queued (dry-run unless NOTIFICATION_DRY_RUN=false in API env).');
      await load();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setSaving(false);
    }
  }

  async function retryLog(id: string) {
    try {
      setError('');
      await apiWithAuth(`/notifications/logs/${id}/retry`, { method: 'POST' });
      setSuccess('Retried');
      await load();
    } catch (err) {
      setError(parseError(err));
    }
  }

  async function markDelivery(id: string, delivered: boolean) {
    try {
      setError('');
      await apiWithAuth(`/notifications/logs/${id}/delivery-status`, {
        method: 'PATCH',
        body: JSON.stringify({ delivered }),
      });
      await load();
    } catch (err) {
      setError(parseError(err));
    }
  }

  function broadcastAudience() {
    return {
      type: broadcastAudienceType,
      filter: broadcastAudienceType === 'customers' ? { hasOutstandingBalance: broadcastOutstandingOnly } : undefined,
    };
  }

  async function previewBroadcast() {
    try {
      setError('');
      const result = await apiWithAuth<{ count: number }>('/notifications/broadcast/preview', {
        method: 'POST',
        body: JSON.stringify({ audience: broadcastAudience() }),
      });
      setBroadcastPreviewCount(result.count);
    } catch (err) {
      setError(parseError(err));
    }
  }

  async function sendBroadcast() {
    if (!broadcastTemplateId) {
      setError('Pick a template to broadcast.');
      return;
    }
    try {
      setBroadcasting(true);
      setError('');
      const result = await apiWithAuth<{ audienceSize: number; sent: number; failed: number; skipped: number }>('/notifications/broadcast', {
        method: 'POST',
        body: JSON.stringify({ templateId: broadcastTemplateId, audience: broadcastAudience() }),
      });
      setBroadcastResult(result);
      setSuccess(`Broadcast sent to ${result.sent} of ${result.audienceSize} recipients.`);
      await load();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setBroadcasting(false);
    }
  }

  return (
    <div className={pageShellClassName}>
      <PageHeader
        title="Notifications"
        description="Manage SMS/WhatsApp templates and view delivery logs. Repair estimates and alerts use these templates."
      />

      {error ? <MessageBanner tone="error">{error}</MessageBanner> : null}
      {success ? <MessageBanner tone="success">{success}</MessageBanner> : null}

      <section className="grid gap-4 xl:grid-cols-2">
        <Card className="border-slate-200">
          <form className="space-y-4" onSubmit={createTemplate}>
            <h3 className="text-lg font-semibold text-slate-900">Message templates</h3>
            <div className="rounded-xl border border-teal-100 bg-teal-50/50 p-3">
              <p className="text-xs font-medium text-slate-600">
                Quick-fill a recommended repairs template (the repairs module looks for these names
                automatically and falls back to a built-in message if you haven&apos;t created them):
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {REPAIR_TEMPLATE_PRESETS.filter((preset) => !templates.some((t) => t.name === preset.name)).map(
                  (preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      className="rounded-lg border border-teal-200 bg-white px-3 py-1.5 text-xs font-medium text-brand hover:bg-teal-50"
                      onClick={() => {
                        setName(preset.name);
                        setChannel(preset.channel);
                        setBody(preset.body);
                      }}
                    >
                      + {preset.name}
                    </button>
                  ),
                )}
              </div>
            </div>
            <label className="block space-y-2 text-sm font-medium text-slate-700">
              <span>Template name</span>
              <input className={inputClassName} value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label className="block space-y-2 text-sm font-medium text-slate-700">
              <span>Channel</span>
              <select className={selectClassName} value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
                <option value="SMS">SMS</option>
                <option value="WHATSAPP">WhatsApp</option>
                <option value="EMAIL">Email</option>
              </select>
            </label>
            <label className="block space-y-2 text-sm font-medium text-slate-700">
              <span>Body (use {'{{variable}}'} placeholders)</span>
              <textarea className={textareaClassName} value={body} onChange={(e) => setBody(e.target.value)} required />
            </label>
            <Button type="submit" disabled={saving}>Save template</Button>
          </form>

          <div className="mt-6 space-y-2">
            {loading ? <AppLoader label="Loading…" size="sm" /> : templates.length ? templates.map((t) => (
              <div key={t.id} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <p className="font-medium">{t.name} <span className="text-slate-500">({t.channel})</span></p>
                <p className="mt-1 text-slate-600">{t.body}</p>
              </div>
            )) : (
              <EmptyState title="No templates" description="Create templates for repair estimates and billing alerts." />
            )}
          </div>
        </Card>

        <Card className="border-slate-200">
          <form className="space-y-4" onSubmit={sendTest}>
            <h3 className="text-lg font-semibold text-slate-900">Send test message</h3>
            <label className="block space-y-2 text-sm font-medium text-slate-700">
              <span>{channel === 'EMAIL' ? 'Recipient email' : 'Recipient phone'}</span>
              <input
                className={inputClassName}
                value={testRecipient}
                onChange={(e) => setTestRecipient(e.target.value)}
                placeholder={channel === 'EMAIL' ? 'owner@example.com' : '9876543210'}
                required
              />
            </label>
            <label className="block space-y-2 text-sm font-medium text-slate-700">
              <span>Channel</span>
              <select className={selectClassName} value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
                <option value="SMS">SMS</option>
                <option value="WHATSAPP">WhatsApp</option>
                <option value="EMAIL">Email</option>
              </select>
            </label>
            <label className="block space-y-2 text-sm font-medium text-slate-700">
              <span>Message</span>
              <textarea className={textareaClassName} value={testBody} onChange={(e) => setTestBody(e.target.value)} required />
            </label>
            <Button type="submit" disabled={saving}>Send test</Button>
          </form>
        </Card>
      </section>

      <Card className="border-slate-200">
        <h3 className="mb-1 text-lg font-semibold text-slate-900">Broadcast</h3>
        <p className="mb-4 text-sm text-slate-500">Send a template to every customer or staff member matching a filter — useful for reminders or announcements.</p>
        <div className="grid gap-3 md:grid-cols-3">
          <label className="space-y-1 text-sm font-medium text-slate-700">
            <span>Template</span>
            <select className={selectClassName} value={broadcastTemplateId} onChange={(e) => { setBroadcastTemplateId(e.target.value); setBroadcastPreviewCount(null); setBroadcastResult(null); }}>
              <option value="">Choose a template</option>
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.channel})
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm font-medium text-slate-700">
            <span>Audience</span>
            <select
              className={selectClassName}
              value={broadcastAudienceType}
              onChange={(e) => { setBroadcastAudienceType(e.target.value as 'customers' | 'staff'); setBroadcastPreviewCount(null); setBroadcastResult(null); }}
            >
              <option value="customers">Customers</option>
              <option value="staff">Staff</option>
            </select>
          </label>
          {broadcastAudienceType === 'customers' ? (
            <label className="flex items-center gap-2 pt-6 text-sm font-medium text-slate-700">
              <input
                type="checkbox"
                checked={broadcastOutstandingOnly}
                onChange={(e) => { setBroadcastOutstandingOnly(e.target.checked); setBroadcastPreviewCount(null); setBroadcastResult(null); }}
              />
              <span>Only with outstanding balance</span>
            </label>
          ) : null}
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" onClick={previewBroadcast}>
            Preview audience
          </Button>
          {broadcastPreviewCount != null ? (
            <span className="text-sm text-slate-600">
              <strong>{broadcastPreviewCount}</strong> recipient{broadcastPreviewCount === 1 ? '' : 's'} match this filter.
            </span>
          ) : null}
          <Button type="button" onClick={sendBroadcast} disabled={broadcasting || !broadcastTemplateId}>
            {broadcasting ? 'Sending…' : 'Send broadcast'}
          </Button>
        </div>
        {broadcastResult ? (
          <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50/60 p-4 text-sm text-slate-700">
            Sent to <strong>{broadcastResult.sent}</strong> of {broadcastResult.audienceSize} recipients
            {broadcastResult.skipped ? ` (${broadcastResult.skipped} skipped — no phone/email on file)` : ''}
            {broadcastResult.failed ? `, ${broadcastResult.failed} failed` : ''}.
          </div>
        ) : null}
      </Card>

      <Card className="border-slate-200">
        <h3 className="mb-4 text-lg font-semibold text-slate-900">Recent delivery log</h3>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className={tableHeaderClassName}>When</th>
                <th className={tableHeaderClassName}>Channel</th>
                <th className={tableHeaderClassName}>Recipient</th>
                <th className={tableHeaderClassName}>Status</th>
                <th className={tableHeaderClassName}>Message</th>
                <th className={cn(tableHeaderClassName, 'text-right')}>Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.length ? logs.map((log) => (
                <tr key={log.id}>
                  <td className={tableCellClassName}>{formatDateTime(log.sentAt ?? log.createdAt)}</td>
                  <td className={tableCellClassName}>{log.channel}</td>
                  <td className={tableCellClassName}>{log.recipient}</td>
                  <td className={tableCellClassName}>
                    <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-medium', STATUS_STYLE[log.status] ?? 'bg-slate-100 text-slate-600')}>
                      {log.status}
                    </span>
                    {log.deliveredAt ? <p className="mt-1 text-xs text-slate-500">Delivered {formatDateTime(log.deliveredAt)}</p> : null}
                    {log.error ? <p className="mt-1 text-xs text-rose-600">{log.error}</p> : null}
                  </td>
                  <td className={tableCellClassName}>{log.body.slice(0, 80)}{log.body.length > 80 ? '…' : ''}</td>
                  <td className={cn(tableCellClassName, 'text-right')}>
                    <div className="flex justify-end gap-2">
                      {log.status === 'FAILED' ? (
                        <button type="button" className="text-sm font-medium text-brand hover:underline" onClick={() => retryLog(log.id)}>
                          Retry
                        </button>
                      ) : null}
                      {log.status === 'SENT' && !log.deliveredAt ? (
                        <button type="button" className="text-sm font-medium text-slate-500 hover:underline" onClick={() => markDelivery(log.id, true)}>
                          Mark delivered
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              )) : (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-500">No messages sent yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
