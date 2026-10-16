'use client';

import { useEffect, useRef, useState } from 'react';
import { Button } from '@retail-sarathi/ui';
import { apiWithAuth } from '@/lib/helpers';
import { parseError } from './dashboard-ui';
import { INVOICE_COPY_OPTIONS, type InvoiceCopyKind } from '@/lib/invoice-print';

/** Renders the same server-side HTML the mobile app already prints from
    (`GET /invoices/:id/print-html`) into a sandboxed iframe — a look-before-you-print view that
    doesn't touch `window.print()` until the user explicitly asks for it. */
export function InvoicePreviewModal({
  open,
  invoiceId,
  invoiceNumber,
  onClose,
}: {
  open: boolean;
  invoiceId: string;
  invoiceNumber?: string;
  onClose: () => void;
}) {
  const [copy, setCopy] = useState<InvoiceCopyKind>('original');
  const [html, setHtml] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    if (open) setCopy('original');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await apiWithAuth<{ html: string }>(`/invoices/${invoiceId}/print-html?copy=${copy}`);
        if (!cancelled) setHtml(res.html);
      } catch (err) {
        if (!cancelled) setError(parseError(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, copy, invoiceId]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/50 p-4">
      <div className="flex h-full max-h-[92vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-5 py-3">
          <h2 className="text-lg font-semibold text-slate-900">
            Preview{invoiceNumber ? ` — ${invoiceNumber}` : ''}
          </h2>
          <div className="flex items-center gap-2">
            <select
              value={copy}
              onChange={(e) => setCopy(e.target.value as InvoiceCopyKind)}
              className="rounded-lg border border-slate-200 px-2 py-1.5 text-sm text-slate-700"
            >
              {INVOICE_COPY_OPTIONS.map((o) => (
                <option key={o.copy} value={o.copy}>
                  {o.shortLabel}
                </option>
              ))}
            </select>
            <Button
              type="button"
              size="sm"
              disabled={loading || !html}
              onClick={() => iframeRef.current?.contentWindow?.print()}
            >
              Print
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto bg-slate-100 p-4">
          {error ? (
            <p className="p-4 text-center text-sm text-red-600">{error}</p>
          ) : (
            <iframe
              ref={iframeRef}
              srcDoc={html}
              title="Invoice preview"
              className="mx-auto h-full min-h-[600px] w-full max-w-[820px] rounded-lg border border-slate-200 bg-white shadow-sm"
            />
          )}
          {loading ? <p className="mt-2 text-center text-xs text-slate-400">Loading…</p> : null}
        </div>
      </div>
    </div>
  );
}
