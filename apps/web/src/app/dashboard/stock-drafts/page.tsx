'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, formatINR } from '@retail-sarathi/ui';
import { confirmDialog } from '@/app/_components/confirm-dialog';
import { apiWithAuth } from '@/lib/helpers';
import { pageShellClassName, MessageBanner, PageHeader, formatDate, parseError } from '../_components/dashboard-ui';

type Draft = {
  id: string;
  supplierName: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  gstin: string | null;
  notes: string | null;
  status: string;
  updatedAt: string;
  uploadId?: string | null;
  lineCount?: number;
  needsSerials?: number;
  unmatched?: number;
  ready?: number;
  missingFields?: string[];
  totalAmount?: number | null;
  previewJson: Record<string, unknown>;
};

const FIELD_LABELS: Record<string, string> = {
  supplier: 'Supplier',
  invoiceNumber: 'Invoice #',
  items: 'Items',
  serials: 'Serials',
};

export default function StockDraftsPage() {
  const router = useRouter();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setError('');
      const data = await apiWithAuth<Draft[]>('/scan/drafts');
      setDrafts(data);
      setExpandedId((prev) => {
        if (data.length === 0) return null;
        if (prev && data.some((d) => d.id === prev)) return prev;
        return data[0].id;
      });
    } catch (err) {
      setError(parseError(err));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function discard(id: string) {
    const ok = await confirmDialog.confirm({
      title: 'Discard draft?',
      message: 'This only removes the unfinished stock-in draft. Confirmed stock is not changed.',
      confirmLabel: 'Discard',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      setBusyId(id);
      setError('');
      setSuccess('');
      await apiWithAuth(`/scan/drafts/${id}`, { method: 'DELETE' });
      setSuccess('Draft discarded.');
      await load();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setBusyId(null);
    }
  }

  async function resume(id: string) {
    try {
      setBusyId(id);
      setError('');
      setSuccess('');
      const draft = await apiWithAuth<Draft>(`/scan/drafts/${id}`);
      const preview = draft.previewJson && typeof draft.previewJson === 'object' ? draft.previewJson : {};
      const missing = draft.missingFields || [];
      if (missing.includes('items')) {
        setError('This draft has no line items. Open Stock-in and parse an invoice, or discard it.');
        setExpandedId(id);
        return;
      }
      sessionStorage.setItem(
        'stockInDraft',
        JSON.stringify({
          ...preview,
          draftId: draft.id,
          uploadId: draft.uploadId || (preview.uploadId as string | undefined),
          supplierName: draft.supplierName || preview.supplierName,
          invoiceNumber: draft.invoiceNumber || preview.invoiceNumber,
          invoiceDate: draft.invoiceDate || preview.invoiceDate,
          gstin: draft.gstin || preview.gstin,
          notes: draft.notes || preview.notes,
        }),
      );
      router.push('/dashboard/stock-in?draft=1');
    } catch (err) {
      setError(parseError(err));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className={pageShellClassName}>
      <PageHeader
        title="Stock-in drafts"
        description="Unfinished supplier invoice sessions. Resume to finish serials/matches, then confirm. Required chips must be clear before stock posts."
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href="/dashboard/stock-in">
              <Button type="button" variant="secondary">
                Stock-in
              </Button>
            </Link>
            <Link href="/dashboard/corrections">
              <Button type="button" variant="secondary">
                Corrections
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

      {drafts.length === 0 ? (
        <Card className="border-slate-200 p-10 text-center">
          <p className="text-base font-semibold text-slate-800">No open drafts</p>
          <p className="mt-2 text-sm text-slate-500">
            On Stock-in, parse an invoice and click Save draft to pause mid-enrichment. PARTIAL drafts stay here after a partial confirm.
          </p>
          <div className="mt-4">
            <Link href="/dashboard/stock-in">
              <Button type="button">Go to Stock-in</Button>
            </Link>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">
            <span className="font-semibold text-slate-800">{drafts.length}</span> draft
            {drafts.length === 1 ? '' : 's'} waiting to confirm
          </p>
          {drafts.map((d) => {
            const open = expandedId === d.id;
            const busy = busyId === d.id;
            const missing = d.missingFields?.length ? d.missingFields : [];
            const lineCount = d.lineCount ?? (Array.isArray(d.previewJson?.lines) ? d.previewJson.lines.length : 0);
            const canResume = !missing.includes('items');
            return (
              <Card key={d.id} className="overflow-hidden border-slate-200 p-0">
                <button
                  type="button"
                  className="flex w-full items-start gap-3 px-4 py-4 text-left transition hover:bg-slate-50/80 sm:px-5"
                  onClick={() => setExpandedId(open ? null : d.id)}
                >
                  <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-teal-50 text-teal-800">
                    <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={1.75}
                        d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                      />
                    </svg>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-semibold text-slate-900">
                      {d.supplierName || 'Supplier'} · {d.invoiceNumber || 'No invoice #'}
                    </span>
                    <span className="mt-0.5 block text-sm text-slate-500">
                      {formatDate(d.invoiceDate) || '—'}
                      {d.gstin ? ` · ${d.gstin}` : ''}
                      {d.totalAmount != null ? ` · ${formatINR(Number(d.totalAmount))}` : ''}
                      {' · '}
                      {lineCount} line{lineCount === 1 ? '' : 's'}
                      {' · '}
                      <span className={d.status === 'PARTIAL' ? 'text-amber-800' : ''}>{d.status}</span>
                      {' · updated '}
                      {new Date(d.updatedAt).toLocaleString('en-IN')}
                    </span>
                    <span className="mt-2 flex flex-wrap gap-1.5">
                      {missing.length ? (
                        missing.map((field) => (
                          <span
                            key={field}
                            className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-800"
                          >
                            {FIELD_LABELS[field] || field}
                          </span>
                        ))
                      ) : (
                        <span className="inline-flex rounded-full border border-teal-200 bg-teal-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-teal-800">
                          Ready to resume
                        </span>
                      )}
                      {(d.needsSerials ?? 0) > 0 ? (
                        <span className="inline-flex rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-orange-800">
                          {d.needsSerials} need serials
                        </span>
                      ) : null}
                      {(d.unmatched ?? 0) > 0 ? (
                        <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-slate-700">
                          {d.unmatched} unmatched
                        </span>
                      ) : null}
                    </span>
                  </span>
                  <span className="mt-1 shrink-0 text-slate-400" aria-hidden>
                    {open ? '▾' : '▸'}
                  </span>
                </button>

                {open ? (
                  <div className="border-t border-slate-100 bg-slate-50/40 px-4 py-4 sm:px-5">
                    <div className="grid gap-2 text-sm text-slate-600 sm:grid-cols-3">
                      <p>
                        <span className="font-semibold text-slate-800">{d.ready ?? 0}</span> ready lines
                      </p>
                      <p>
                        <span className="font-semibold text-slate-800">{d.needsSerials ?? 0}</span> need
                        serials
                      </p>
                      <p>
                        <span className="font-semibold text-slate-800">{d.unmatched ?? 0}</span> need
                        match / enrich
                      </p>
                    </div>
                    {d.notes ? <p className="mt-2 text-sm text-slate-500">Notes: {d.notes}</p> : null}
                    {missing.length ? (
                      <p className="mt-2 text-xs text-amber-800">
                        Still need: {missing.map((f) => FIELD_LABELS[f] || f).join(', ')}
                        {missing.includes('serials')
                          ? ' — resume and fill serials before confirming those lines.'
                          : ''}
                      </p>
                    ) : (
                      <p className="mt-2 text-xs text-slate-500">
                        Header looks complete. Resume to review lines and confirm stock.
                      </p>
                    )}
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        disabled={busy || !canResume}
                        title={!canResume ? 'Draft has no items to resume' : undefined}
                        onClick={() => void resume(d.id)}
                      >
                        {busy ? 'Opening…' : 'Resume'}
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={busy}
                        onClick={() => void discard(d.id)}
                      >
                        Discard
                      </Button>
                      <Link
                        href="/dashboard/stock-in"
                        className="text-sm font-medium text-teal-700 hover:underline"
                      >
                        New stock-in
                      </Link>
                    </div>
                  </div>
                ) : null}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
