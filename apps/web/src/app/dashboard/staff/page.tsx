'use client';

import { useEffect, useState } from 'react';
import { Button, Card, formatINR } from '@retail-sarathi/ui';
import { apiWithAuth } from '@/lib/helpers';
import { pageShellClassName, MessageBanner, PageHeader, formatDateTime, inputClassName, parseError, selectClassName, toNumber } from '../_components/dashboard-ui';

export default function StaffPage() {
  const [staff, setStaff] = useState<Array<Record<string, unknown>>>([]);
  const [attendance, setAttendance] = useState<Array<Record<string, unknown>>>([]);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'CASHIER' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function load() {
    const [s, a] = await Promise.all([
      apiWithAuth<Array<Record<string, unknown>>>('/staff'),
      apiWithAuth<Array<Record<string, unknown>>>('/staff/attendance'),
    ]);
    setStaff(s);
    setAttendance(a);
  }

  useEffect(() => { void load().catch((e) => setError(parseError(e))); }, []);

  return (
    <div className={pageShellClassName}>
      <PageHeader title="Staff" description="Manage team members, attendance, and sales/repair commissions." actions={
        <Button type="button" variant="secondary" onClick={() => {
          const now = new Date();
          const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
          const end = now.toISOString().slice(0, 10);
          void apiWithAuth('/staff/commissions/calculate', { method: 'POST', body: JSON.stringify({ periodStart: start, periodEnd: end, commissionPct: 2 }) }).then(() => setSuccess('Commissions calculated for this month')).catch((e) => setError(parseError(e)));
        }}>Calculate commissions</Button>
      } />
      {error ? <MessageBanner tone="error">{error}</MessageBanner> : null}
      {success ? <MessageBanner tone="success">{success}</MessageBanner> : null}
      <Card className="border-slate-200">
        <form className="grid gap-3 md:grid-cols-5" onSubmit={(e) => { e.preventDefault(); void apiWithAuth('/staff', { method: 'POST', body: JSON.stringify(form) }).then(() => { setForm({ name: '', email: '', password: '', role: 'CASHIER' }); setSuccess('Staff added'); void load(); }).catch((err) => setError(parseError(err))); }}>
          <input className={inputClassName} placeholder="Name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
          <input className={inputClassName} placeholder="Email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
          <input className={inputClassName} type="password" placeholder="Password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />
          <select className={selectClassName} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            {['OWNER', 'MANAGER', 'CASHIER', 'TECHNICIAN'].map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <Button type="submit">Add staff</Button>
        </form>
      </Card>
      <section className="grid gap-4 xl:grid-cols-2">
        <Card className="border-slate-200">
          <h3 className="mb-3 text-lg font-semibold">Team ({staff.length})</h3>
          {staff.map((s) => (
            <div key={String(s.id)} className="mb-2 rounded-xl border border-slate-200 px-3 py-2 text-sm">
              <strong>{String(s.name)}</strong> · {String(s.role)} · {String(s.email)}
            </div>
          ))}
        </Card>
        <Card className="border-slate-200">
          <h3 className="mb-3 text-lg font-semibold">Attendance</h3>
          {attendance.slice(0, 15).map((a) => (
            <div key={String(a.id)} className="mb-2 text-sm text-slate-600">
              {(a.user as { name: string })?.name} — {formatDateTime(String(a.checkIn))} {a.checkOut ? `→ ${formatDateTime(String(a.checkOut))}` : '(active)'}
            </div>
          ))}
        </Card>
      </section>
    </div>
  );
}
