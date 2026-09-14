'use client';

import { useState } from 'react';
import { Button, Card } from '@retail-sarathi/ui';
import { apiFetch } from '@/lib/api';
import { pageShellClassName,
  MessageBanner,
  PageHeader,
  inputClassName,
  selectClassName,
} from '../_components/dashboard-ui';

export default function GstPage() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [gstr1, setGstr1] = useState<object | null>(null);
  const [gstr3b, setGstr3b] = useState<object | null>(null);
  const [loading, setLoading] = useState<'gstr1' | 'gstr3b' | null>(null);
  const [error, setError] = useState('');

  async function exportGstr1() {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      setLoading('gstr1');
      setError('');
      const data = await apiFetch<object>(`/gst/gstr1?year=${year}&month=${month}`, {}, token);
      setGstr1(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate GSTR-1');
    } finally {
      setLoading(null);
    }
  }

  async function exportGstr3b() {
    const token = localStorage.getItem('token');
    if (!token) return;
    try {
      setLoading('gstr3b');
      setError('');
      const data = await apiFetch<object>(`/gst/gstr3b?year=${year}&month=${month}`, {}, token);
      setGstr3b(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate GSTR-3B');
    } finally {
      setLoading(null);
    }
  }

  function downloadJson(data: object, filename: string) {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className={pageShellClassName}>
      <PageHeader
        title="GST exports"
        description="Generate GSTR-1 and GSTR-3B JSON previews for your CA or filing tool. Credit notes from returns are netted in turnover."
      />

      {error ? <MessageBanner tone="error">{error}</MessageBanner> : null}

      <Card className="border-slate-200">
        <h2 className="text-lg font-semibold text-slate-900">Return period</h2>
        <p className="mt-1 text-sm text-slate-500">Pick month and year, then generate the export pack.</p>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
          <label className="space-y-1 text-sm font-medium text-slate-700">
            <span>Month</span>
            <select
              className={`${selectClassName} min-w-[8rem]`}
              value={month}
              onChange={(e) => setMonth(Number(e.target.value))}
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                <option key={m} value={m}>
                  {new Date(2000, m - 1, 1).toLocaleString('en-IN', { month: 'long' })}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm font-medium text-slate-700">
            <span>Year</span>
            <input
              type="number"
              className={`${inputClassName} w-28`}
              value={year}
              min={2020}
              max={2100}
              onChange={(e) => setYear(Number(e.target.value))}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button type="button" disabled={loading !== null} onClick={() => void exportGstr1()}>
              {loading === 'gstr1' ? 'Generating…' : 'Generate GSTR-1'}
            </Button>
            <Button type="button" variant="secondary" disabled={loading !== null} onClick={() => void exportGstr3b()}>
              {loading === 'gstr3b' ? 'Generating…' : 'GSTR-3B summary'}
            </Button>
          </div>
        </div>
      </Card>

      {gstr1 ? (
        <Card className="border-slate-200">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-semibold text-slate-900">GSTR-1 preview</h2>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => downloadJson(gstr1, `GSTR1-${year}-${String(month).padStart(2, '0')}.json`)}
            >
              Download JSON
            </Button>
          </div>
          <pre className="max-h-[28rem] overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-800">
            {JSON.stringify(gstr1, null, 2)}
          </pre>
        </Card>
      ) : null}

      {gstr3b ? (
        <Card className="border-slate-200">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">GSTR-3B summary</h2>
          <pre className="max-h-[28rem] overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-800">
            {JSON.stringify(gstr3b, null, 2)}
          </pre>
        </Card>
      ) : null}
    </div>
  );
}
