'use client';

import { AppLoader } from '@/app/_components/app-loader';
import { useEffect, useRef, useState } from 'react';
import { Button, Card, formatINR } from '@retail-sarathi/ui';
import { apiWithAuth, getToken } from '@/lib/helpers';
import {
  pageShellClassName,
  EmptyState,
  MessageBanner,
  PageHeader,
  cn,
  inputClassName,
  parseError,
  selectClassName,
  tableCellClassName,
  tableHeaderClassName,
  toNumber,
} from '../_components/dashboard-ui';
import { RowActionsMenu } from '../_components/row-actions-menu';

const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? 'http://localhost:4000';

type BankStatement = {
  id: string;
  date: string;
  description: string;
  amount: number | string;
  type: 'CREDIT' | 'DEBIT';
  status: 'UNMATCHED' | 'MATCHED' | 'IGNORED';
  reference?: string | null;
  suggestion?: {
    matchId: string;
    matchType: string;
    confidence: number;
    label: string;
  } | null;
};

type ImportResult = {
  imported: number;
  skipped: number;
};

type AaStatus = {
  connected: boolean;
  provider?: string | null;
  consentId?: string | null;
  feedUrl?: string | null;
  accountMask?: string | null;
  connectedAt?: string | null;
};

export default function BankReconcilePage() {
  const [statements, setStatements] = useState<BankStatement[]>([]);
  const [aaStatus, setAaStatus] = useState<AaStatus | null>(null);
  const [aaProvider, setAaProvider] = useState('');
  const [aaConsentId, setAaConsentId] = useState('');
  const [aaFeedUrl, setAaFeedUrl] = useState('');
  const [aaAccountMask, setAaAccountMask] = useState('');
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [csvText, setCsvText] = useState('');
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [rowActions, setRowActions] = useState<Record<string, boolean>>({});
  const [suggestLoading, setSuggestLoading] = useState<Record<string, boolean>>({});
  const fileRef = useRef<HTMLInputElement>(null);

  async function loadStatements() {
    try {
      setLoading(true);
      setError('');
      const [rows, aaRaw] = await Promise.all([
        apiWithAuth<BankStatement[]>('/bank-statements?status=UNMATCHED'),
        apiWithAuth<{
          aa?: {
            provider?: string;
            consentId?: string;
            accountMask?: string | null;
            status?: string;
          } | null;
          bankFeedUrl?: string | null;
        }>('/bank-statements/aa/status').catch(() => null),
      ]);
      setStatements(rows);
      if (aaRaw?.aa) {
        const a = aaRaw.aa;
        setAaStatus({
          connected: a.status === 'ACTIVE',
          provider: a.provider,
          consentId: a.consentId,
          feedUrl: aaRaw.bankFeedUrl || undefined,
          accountMask: a.accountMask || undefined,
        });
        setAaProvider(a.provider ?? '');
        setAaConsentId(a.consentId ?? '');
        setAaFeedUrl(aaRaw.bankFeedUrl ?? '');
        setAaAccountMask(a.accountMask ?? '');
      }
    } catch (e) {
      setError(parseError(e));
    } finally {
      setLoading(false);
    }
  }

  async function loadAaStatus() {
    const aaRaw = await apiWithAuth<{
      aa?: {
        provider?: string;
        consentId?: string;
        accountMask?: string | null;
        status?: string;
      } | null;
      bankFeedUrl?: string | null;
    }>('/bank-statements/aa/status').catch(() => null);
    if (!aaRaw?.aa) return;
    const a = aaRaw.aa;
    setAaStatus({
      connected: a.status === 'ACTIVE',
      provider: a.provider,
      consentId: a.consentId,
      feedUrl: aaRaw.bankFeedUrl || undefined,
      accountMask: a.accountMask || undefined,
    });
  }

  useEffect(() => {
    void loadStatements();
  }, []);

  async function handleImport(e: React.FormEvent) {
    e.preventDefault();
    if (!csvFile && !csvText.trim()) {
      setError('Upload a CSV file or paste CSV text.');
      return;
    }
    try {
      setImporting(true);
      setError('');
      const token = getToken();
      if (!token) throw new Error('Not signed in');
      const form = new FormData();
      if (csvFile) {
        form.append('file', csvFile);
      } else {
        form.append('csvText', csvText.trim());
      }
      const res = await fetch(`${API_ORIGIN}/api/v1/bank-statements/import`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { message?: string };
        throw new Error(err.message || res.statusText);
      }
      const result = (await res.json()) as ImportResult & { count?: number };
      setSuccess(
        `Imported ${result.count ?? result.imported ?? 0} row(s)${result.skipped ? `, ${result.skipped} skipped (duplicate).` : '.'}`,
      );
      setCsvText('');
      setCsvFile(null);
      if (fileRef.current) fileRef.current.value = '';
      await loadStatements();
    } catch (e) {
      setError(parseError(e));
    } finally {
      setImporting(false);
    }
  }

  async function handleAaConnect(e: React.FormEvent) {
    e.preventDefault();
    try {
      setImporting(true);
      setError('');
      const result = await apiWithAuth<{
        ok?: boolean;
        aa?: { provider?: string; consentId?: string; accountMask?: string | null; status?: string };
        bankFeedUrl?: string | null;
      }>('/bank-statements/aa/connect', {
        method: 'POST',
        body: JSON.stringify({
          provider: aaProvider.trim() || undefined,
          consentId: aaConsentId.trim() || undefined,
          feedUrl: aaFeedUrl.trim() || undefined,
          accountMask: aaAccountMask.trim() || undefined,
        }),
      });
      if (result.aa) {
        setAaStatus({
          connected: result.aa.status === 'ACTIVE' || !result.aa.status,
          provider: result.aa.provider,
          consentId: result.aa.consentId,
          feedUrl: result.bankFeedUrl || undefined,
          accountMask: result.aa.accountMask || undefined,
        });
      }
      setSuccess('Account Aggregator connected.');
    } catch (e) {
      setError(parseError(e));
    } finally {
      setImporting(false);
    }
  }

  async function handleAaConsentStart() {
    try {
      setImporting(true);
      setError('');
      const result = await apiWithAuth<{ consentUrl: string; consentId: string }>(
        '/bank-statements/aa/connect/start',
        {
          method: 'POST',
          body: JSON.stringify({
            provider: aaProvider.trim() || 'mock',
            accountMask: aaAccountMask.trim() || undefined,
          }),
        },
      );
      setSuccess(`Consent started (${result.consentId}). Complete approval in the opened window.`);
      window.open(result.consentUrl, '_blank', 'noopener,noreferrer,width=480,height=640');
      setTimeout(() => {
        void loadAaStatus();
      }, 2500);
    } catch (e) {
      setError(parseError(e));
    } finally {
      setImporting(false);
    }
  }

  async function handleAaSync() {
    try {
      setImporting(true);
      setError('');
      const result = await apiWithAuth<{ imported: number; autoMatched?: number }>('/bank-statements/aa/sync', {
        method: 'POST',
      });
      setSuccess(`AA feed synced: imported ${result.imported} row(s).`);
      await loadStatements();
    } catch (e) {
      setError(parseError(e));
    } finally {
      setImporting(false);
    }
  }

  async function handleSyncFeed() {
    try {
      setImporting(true);
      setError('');
      const result = await apiWithAuth<{
        imported: number;
        autoMatched: number;
        feedUrl: string;
      }>('/bank-statements/sync', { method: 'POST', body: JSON.stringify({}) });
      setSuccess(
        `Feed synced: imported ${result.imported}, auto-matched ${result.autoMatched}.`,
      );
      await loadStatements();
    } catch (e) {
      setError(parseError(e));
    } finally {
      setImporting(false);
    }
  }

  async function handleAutoMatch() {
    try {
      setImporting(true);
      setError('');
      const result = await apiWithAuth<{ scanned: number; matched: number }>('/bank-statements/auto-match', {
        method: 'POST',
      });
      setSuccess(`Auto-matched ${result.matched} of ${result.scanned} unmatched lines.`);
      await loadStatements();
    } catch (e) {
      setError(parseError(e));
    } finally {
      setImporting(false);
    }
  }

  async function suggestMatch(id: string) {
    try {
      setSuggestLoading((prev) => ({ ...prev, [id]: true }));
      const suggestion = await apiWithAuth<BankStatement['suggestion']>(`/bank-statements/${id}/suggest`);
      setStatements((prev) =>
        prev.map((s) => (s.id === id ? { ...s, suggestion } : s)),
      );
    } catch (e) {
      setError(parseError(e));
    } finally {
      setSuggestLoading((prev) => ({ ...prev, [id]: false }));
    }
  }

  async function matchStatement(id: string) {
    try {
      setRowActions((prev) => ({ ...prev, [id]: true }));
      await apiWithAuth(`/bank-statements/${id}/match`, { method: 'POST' });
      setSuccess('Statement row matched.');
      await loadStatements();
    } catch (e) {
      setError(parseError(e));
    } finally {
      setRowActions((prev) => ({ ...prev, [id]: false }));
    }
  }

  async function ignoreStatement(id: string) {
    try {
      setRowActions((prev) => ({ ...prev, [id]: true }));
      await apiWithAuth(`/bank-statements/${id}/ignore`, { method: 'POST' });
      setSuccess('Statement row ignored.');
      await loadStatements();
    } catch (e) {
      setError(parseError(e));
    } finally {
      setRowActions((prev) => ({ ...prev, [id]: false }));
    }
  }

  const totalUnmatched = statements.reduce((s, r) => s + toNumber(r.amount), 0);

  return (
    <div className={pageShellClassName}>
      <PageHeader
        title="Bank reconciliation"
        description="Import bank statements, match transactions to payments and invoices, and mark leftovers."
      />
      {error ? <MessageBanner tone="error">{error}</MessageBanner> : null}
      {success ? <MessageBanner tone="success">{success}</MessageBanner> : null}

      <Card className="border-violet-200 bg-gradient-to-br from-violet-50 to-white p-4 sm:p-5">
        <h2 className="mb-1 text-base font-semibold text-slate-900">Account Aggregator (AA)</h2>
        <p className="mb-4 text-xs text-slate-500">
          Connect bank feed via AA provider — consent stored in shop settings; sync pulls new statement rows.
        </p>
        {aaStatus?.connected ? (
          <p className="mb-3 text-sm text-teal-800">
            Connected · {aaStatus.provider || 'Provider'} · {aaStatus.accountMask || 'Account'} · consent{' '}
            {aaStatus.consentId ? 'active' : 'pending'}
          </p>
        ) : null}
        <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => void handleAaConnect(e)}>
          <input
            className={inputClassName}
            placeholder="Provider (e.g. Setu, Finvu)"
            value={aaProvider}
            onChange={(e) => setAaProvider(e.target.value)}
          />
          <input
            className={inputClassName}
            placeholder="Consent ID"
            value={aaConsentId}
            onChange={(e) => setAaConsentId(e.target.value)}
          />
          <input
            className={`${inputClassName} sm:col-span-2`}
            placeholder="Feed URL (CSV/JSON endpoint)"
            value={aaFeedUrl}
            onChange={(e) => setAaFeedUrl(e.target.value)}
          />
          <input
            className={inputClassName}
            placeholder="Account mask (optional)"
            value={aaAccountMask}
            onChange={(e) => setAaAccountMask(e.target.value)}
          />
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            <Button type="button" variant="secondary" disabled={importing} onClick={() => void handleAaConsentStart()}>
              Start bank consent
            </Button>
            <Button type="submit" disabled={importing}>
              {importing ? 'Connecting…' : aaStatus?.connected ? 'Update AA' : 'Connect AA (manual)'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={importing || !aaStatus?.connected}
              onClick={() => void handleAaSync()}
            >
              AA sync
            </Button>
          </div>
        </form>
      </Card>

      <Card className="border-slate-200 p-4 sm:p-5">
        <h2 className="mb-1 text-base font-semibold text-slate-900">Import bank statement</h2>
        <p className="mb-4 text-xs text-slate-500">
          Upload a CSV from your bank or paste the raw CSV text. Duplicate rows are skipped automatically.
        </p>
        <form className="space-y-4" onSubmit={(e) => void handleImport(e)}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="space-y-1 text-xs font-medium text-slate-600">
              Upload CSV file
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="mt-1 block w-full text-sm text-slate-700"
                onChange={(e) => {
                  setCsvFile(e.target.files?.[0] ?? null);
                  if (e.target.files?.[0]) setCsvText('');
                }}
              />
            </label>
            <label className="space-y-1 text-xs font-medium text-slate-600 sm:col-span-1">
              Or paste CSV text
              <textarea
                className={`${inputClassName} min-h-24 resize-y py-2 font-mono text-xs`}
                placeholder={'Date,Description,Amount,Type\n01/07/2026,UPI-SUPPLIER-XYZ,-5000,DEBIT'}
                value={csvText}
                onChange={(e) => {
                  setCsvText(e.target.value);
                  if (e.target.value.trim()) {
                    setCsvFile(null);
                    if (fileRef.current) fileRef.current.value = '';
                  }
                }}
              />
            </label>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={importing}>
              {importing ? 'Importing…' : 'Import'}
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={importing}
              onClick={() => void handleSyncFeed()}
            >
              Sync feed
            </Button>
            <Button
              type="button"
              variant="secondary"
              disabled={importing}
              onClick={() => void handleAutoMatch()}
            >
              Auto-match
            </Button>
          </div>
        </form>
      </Card>

      <Card className="border-slate-200 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Unmatched rows</h2>
            <p className="text-xs text-slate-500">
              {statements.length} rows · {formatINR(totalUnmatched)} net unmatched
            </p>
          </div>
          <Button type="button" variant="secondary" onClick={() => void loadStatements()}>
            Refresh
          </Button>
        </div>

        {loading ? (
          <AppLoader label="Loading…" size="sm" />
        ) : statements.length === 0 ? (
          <EmptyState
            title="All caught up"
            description="No unmatched bank statement rows. Import a statement to start reconciling."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className={tableHeaderClassName}>Date</th>
                  <th className={tableHeaderClassName}>Description</th>
                  <th className={tableHeaderClassName}>Amount</th>
                  <th className={tableHeaderClassName}>Type</th>
                  <th className={tableHeaderClassName}>Suggestion</th>
                  <th className={tableHeaderClassName}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {statements.map((row) => {
                  const busy = rowActions[row.id] ?? false;
                  return (
                    <tr key={row.id} className="border-t border-slate-100">
                      <td className={tableCellClassName}>
                        {new Date(row.date).toLocaleDateString('en-IN')}
                      </td>
                      <td className={tableCellClassName}>
                        <div className="max-w-xs truncate font-medium text-slate-800">{row.description}</div>
                        {row.reference ? (
                          <div className="font-mono text-xs text-slate-500">{row.reference}</div>
                        ) : null}
                      </td>
                      <td className={tableCellClassName}>
                        <span
                          className={cn(
                            'font-semibold',
                            row.type === 'CREDIT' ? 'text-teal-800' : 'text-rose-700',
                          )}
                        >
                          {row.type === 'CREDIT' ? '+' : '−'}
                          {formatINR(toNumber(row.amount))}
                        </span>
                      </td>
                      <td className={tableCellClassName}>
                        <span
                          className={cn(
                            'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                            row.type === 'CREDIT'
                              ? 'bg-teal-50 text-teal-800'
                              : 'bg-rose-50 text-rose-800',
                          )}
                        >
                          {row.type}
                        </span>
                      </td>
                      <td className={tableCellClassName}>
                        {row.suggestion ? (
                          <div className="text-xs">
                            <p className="font-medium text-slate-800">{row.suggestion.label}</p>
                            <p className="text-slate-500">
                              {row.suggestion.matchType} ·{' '}
                              {Math.round(row.suggestion.confidence * 100)}% confidence
                            </p>
                          </div>
                        ) : (
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={suggestLoading[row.id]}
                            onClick={() => void suggestMatch(row.id)}
                          >
                            {suggestLoading[row.id] ? 'Searching…' : 'Suggest'}
                          </Button>
                        )}
                      </td>
                      <td className={tableCellClassName}>
                        <div className="flex justify-end">
                          <RowActionsMenu
                            actions={[
                              { key: 'match', label: 'Match', disabled: busy, onClick: () => void matchStatement(row.id) },
                              { key: 'ignore', label: 'Ignore', tone: 'danger', disabled: busy, onClick: () => void ignoreStatement(row.id) },
                            ]}
                          />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
