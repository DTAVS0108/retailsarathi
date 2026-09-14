'use client';

import { AppLoader } from '@/app/_components/app-loader';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button, Card, formatINR } from '@retail-sarathi/ui';
import { apiWithAuth } from '@/lib/helpers';
import {
  pageShellClassName,
  MessageBanner,
  PageHeader,
  StatusBadge,
  cn,
  formatDate,
  inputClassName,
  parseError,
  selectClassName,
  tableCellClassName,
  tableHeaderClassName,
  toNumber,
} from '../_components/dashboard-ui';

type Gstr2bLine = {
  id: string;
  supplierGstin?: string | null;
  supplierName?: string | null;
  invoiceNumber: string;
  invoiceDate?: string | null;
  taxableValue: number | string;
  totalAmount: number | string;
  matchStatus: string;
  matchedPurchaseBillId?: string | null;
  notes?: string | null;
};

type Gstr2bImport = {
  id: string;
  period: string;
  source: string;
  createdAt: string;
  summary?: {
    unmatched: number;
    matched: number;
    mismatch: number;
    ignored: number;
  };
  lines?: Gstr2bLine[];
  _count?: { lines: number };
};

type PurchaseRegisterRow = {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  supplierName?: string | null;
  gstin?: string | null;
  status: string;
  totalAmount: number | string;
};

export default function Gstr2bPage() {
  const [imports, setImports] = useState<Gstr2bImport[]>([]);
  const [selected, setSelected] = useState<Gstr2bImport | null>(null);
  const [register, setRegister] = useState<PurchaseRegisterRow[]>([]);
  const [csvText, setCsvText] = useState('');
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function loadImports() {
    const list = await apiWithAuth<Gstr2bImport[]>('/gstr2b');
    setImports(list);
    return list;
  }

  async function loadRegister() {
    const res = await apiWithAuth<{ rows?: PurchaseRegisterRow[] } | PurchaseRegisterRow[]>('/purchase-register');
    setRegister(Array.isArray(res) ? res : res.rows ?? []);
  }

  async function load() {
    try {
      setError('');
      await Promise.all([loadImports(), loadRegister()]);
    } catch (e) {
      setError(parseError(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function openImport(id: string) {
    setSaving(true);
    setError('');
    try {
      const detail = await apiWithAuth<Gstr2bImport>(`/gstr2b/${id}`);
      setSelected(detail);
    } catch (e) {
      setError(parseError(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    if (!csvText.trim()) {
      setError('Paste GSTR-2B CSV text.');
      return;
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const imp = await apiWithAuth<Gstr2bImport>('/gstr2b/import', {
        method: 'POST',
        body: JSON.stringify({ period: period.trim(), csvText: csvText.trim() }),
      });
      setCsvText('');
      setSuccess(`Imported ${imp.lines?.length ?? 0} line(s) for ${imp.period}.`);
      await loadImports();
      setSelected(imp);
    } catch (err) {
      setError(parseError(err));
    } finally {
      setSaving(false);
    }
  }

  async function autoMatch(id: string) {
    setSaving(true);
    setError('');
    try {
      const imp = await apiWithAuth<Gstr2bImport>(`/gstr2b/${id}/auto-match`, { method: 'POST' });
      setSelected(imp);
      setSuccess('Auto-match complete.');
      await loadImports();
    } catch (e) {
      setError(parseError(e));
    } finally {
      setSaving(false);
    }
  }

  async function ignoreLine(lineId: string) {
    setSaving(true);
    setError('');
    try {
      await apiWithAuth(`/gstr2b/lines/${lineId}/ignore`, { method: 'POST' });
      if (selected) await openImport(selected.id);
      setSuccess('Line ignored.');
    } catch (e) {
      setError(parseError(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <AppLoader label="Loading GSTR-2B…" />;
  }

  const summary = selected?.summary;

  return (
    <div className={pageShellClassName}>
      <PageHeader
        title="GSTR-2B reconciliation"
        description="Import portal CSV, match to purchase register bills, and resolve ITC gaps."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/purchase-bills">
              <Button type="button" variant="secondary">
                Purchase bills
              </Button>
            </Link>
            <Button type="button" variant="secondary" onClick={() => void load()}>
              Refresh
            </Button>
          </div>
        }
      />

      {error ? <MessageBanner tone="error">{error}</MessageBanner> : null}
      {success ? <MessageBanner tone="success">{success}</MessageBanner> : null}

      <Card className="border-teal-200 bg-gradient-to-br from-teal-50 to-white p-4">
        <h2 className="text-lg font-semibold">Import GSTR-2B CSV</h2>
        <p className="mt-1 text-sm text-slate-500">
          Columns: gstin, supplierName, invoiceNumber, invoiceDate, taxable, cgst, sgst, igst, total
        </p>
        <form className="mt-4 space-y-3" onSubmit={(e) => void handleImport(e)}>
          <div className="flex flex-wrap gap-3">
            <label className="space-y-1 text-sm font-medium text-slate-700">
              <span>Period (YYYY-MM)</span>
              <input
                className={`${inputClassName} max-w-[10rem]`}
                value={period}
                onChange={(e) => setPeriod(e.target.value)}
                placeholder="2026-07"
              />
            </label>
          </div>
          <textarea
            className={`${inputClassName} min-h-32 font-mono text-xs`}
            placeholder="gstin,supplierName,invoiceNumber,invoiceDate,taxable,cgst,sgst,igst,total"
            value={csvText}
            onChange={(e) => setCsvText(e.target.value)}
          />
          <Button type="submit" disabled={saving}>
            {saving ? 'Importing…' : 'Import & auto-match'}
          </Button>
        </form>
      </Card>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="border-slate-200 p-4">
          <h2 className="mb-3 text-lg font-semibold">Imports</h2>
          {!imports.length ? (
            <p className="text-sm text-slate-500">No imports yet.</p>
          ) : (
            <div className="space-y-2">
              {imports.map((imp) => (
                <button
                  key={imp.id}
                  type="button"
                  className={cn(
                    'flex w-full flex-wrap items-center justify-between gap-2 rounded-xl border px-3 py-2 text-left text-sm transition hover:bg-slate-50',
                    selected?.id === imp.id ? 'border-teal-300 bg-teal-50/50' : 'border-slate-200',
                  )}
                  onClick={() => void openImport(imp.id)}
                >
                  <span>
                    {imp.period} · {formatDate(imp.createdAt)} · {imp._count?.lines ?? imp.lines?.length ?? 0}{' '}
                    lines
                  </span>
                  <span className="text-xs text-slate-500">{imp.source}</span>
                </button>
              ))}
            </div>
          )}
        </Card>

        <Card className="border-slate-200 p-4">
          <h2 className="mb-3 text-lg font-semibold">Purchase register</h2>
          <p className="mb-3 text-xs text-slate-500">Latest posted bills — matched against 2B invoice numbers.</p>
          {!register.length ? (
            <p className="text-sm text-slate-500">No purchase bills in register.</p>
          ) : (
            <div className="max-h-64 overflow-y-auto">
              <table className="min-w-full text-sm">
                <thead>
                  <tr>
                    <th className={tableHeaderClassName}>Invoice</th>
                    <th className={tableHeaderClassName}>Supplier</th>
                    <th className={tableHeaderClassName}>Total</th>
                  </tr>
                </thead>
                <tbody>
                  {register.slice(0, 20).map((r) => (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className={tableCellClassName}>
                        <Link href={`/dashboard/purchase-bills/${r.id}`} className="font-medium text-teal-700 underline">
                          {r.invoiceNumber}
                        </Link>
                        <div className="text-xs text-slate-400">{formatDate(r.invoiceDate)}</div>
                      </td>
                      <td className={tableCellClassName}>{r.supplierName ?? '—'}</td>
                      <td className={tableCellClassName}>{formatINR(toNumber(r.totalAmount))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      {selected ? (
        <Card className="border-slate-200 p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">Import {selected.period}</h2>
              {summary ? (
                <p className="text-sm text-slate-500">
                  {summary.matched} matched · {summary.mismatch} mismatch · {summary.unmatched} unmatched ·{' '}
                  {summary.ignored} ignored
                </p>
              ) : null}
            </div>
            <Button type="button" variant="secondary" disabled={saving} onClick={() => void autoMatch(selected.id)}>
              Auto-match
            </Button>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr>
                  <th className={tableHeaderClassName}>Invoice</th>
                  <th className={tableHeaderClassName}>Supplier</th>
                  <th className={tableHeaderClassName}>Total</th>
                  <th className={tableHeaderClassName}>Status</th>
                  <th className={tableHeaderClassName}>Bill</th>
                  <th className={tableHeaderClassName} />
                </tr>
              </thead>
              <tbody>
                {(selected.lines ?? []).map((l) => (
                  <tr key={l.id} className="border-t border-slate-100">
                    <td className={tableCellClassName}>
                      {l.invoiceNumber}
                      {l.invoiceDate ? (
                        <div className="text-xs text-slate-400">{formatDate(l.invoiceDate)}</div>
                      ) : null}
                    </td>
                    <td className={tableCellClassName}>
                      {l.supplierName ?? '—'}
                      {l.supplierGstin ? <div className="text-xs text-slate-400">{l.supplierGstin}</div> : null}
                    </td>
                    <td className={tableCellClassName}>{formatINR(toNumber(l.totalAmount || l.taxableValue))}</td>
                    <td className={tableCellClassName}>
                      <StatusBadge status={l.matchStatus} />
                      {l.notes ? <div className="text-xs text-amber-700">{l.notes}</div> : null}
                    </td>
                    <td className={tableCellClassName}>
                      {l.matchedPurchaseBillId ? (
                        <Link
                          href={`/dashboard/purchase-bills/${l.matchedPurchaseBillId}`}
                          className="text-teal-700 underline"
                        >
                          View bill
                        </Link>
                      ) : (
                        '—'
                      )}
                    </td>
                    <td className={tableCellClassName}>
                      {l.matchStatus !== 'IGNORED' && l.matchStatus !== 'MATCHED' ? (
                        <Button type="button" size="sm" variant="secondary" disabled={saving} onClick={() => void ignoreLine(l.id)}>
                          Ignore
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  );
}
