'use client';
import { AppLoader } from '@/app/_components/app-loader';

import { useEffect, useState } from 'react';
import { Button, Card } from '@retail-sarathi/ui';
import { apiWithAuth } from '@/lib/helpers';
import { pageShellClassName,
  EmptyState,
  MessageBanner,
  PageHeader,
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

interface LogEntry {
  id: string;
  channel: Channel;
  recipient: string;
  body: string;
  status: string;
  createdAt: string;
  sentAt?: string | null;
  error?: string | null;
}

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
              <span>Recipient phone</span>
              <input className={inputClassName} value={testRecipient} onChange={(e) => setTestRecipient(e.target.value)} placeholder="9876543210" required />
            </label>
            <label className="block space-y-2 text-sm font-medium text-slate-700">
              <span>Channel</span>
              <select className={selectClassName} value={channel} onChange={(e) => setChannel(e.target.value as Channel)}>
                <option value="SMS">SMS</option>
                <option value="WHATSAPP">WhatsApp</option>
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
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {logs.length ? logs.map((log) => (
                <tr key={log.id}>
                  <td className={tableCellClassName}>{formatDateTime(log.sentAt ?? log.createdAt)}</td>
                  <td className={tableCellClassName}>{log.channel}</td>
                  <td className={tableCellClassName}>{log.recipient}</td>
                  <td className={tableCellClassName}>{log.status}{log.error ? ` — ${log.error}` : ''}</td>
                  <td className={tableCellClassName}>{log.body.slice(0, 80)}{log.body.length > 80 ? '…' : ''}</td>
                </tr>
              )) : (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-sm text-slate-500">No messages sent yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
