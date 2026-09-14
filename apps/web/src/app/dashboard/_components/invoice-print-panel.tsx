'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { Button, formatINR } from '@retail-sarathi/ui';
import { apiWithAuth } from '@/lib/helpers';
import {
  buildInvoicePrintHtml,
  getCreditSummary,
  INVOICE_COPY_OPTIONS,
  openPrintWindow,
  type InvoiceCopyKind,
  type InvoicePrintSource,
} from '@/lib/invoice-print';
import type { PrintInvoiceData } from '@retail-sarathi/ui';
import { cn, parseError } from './dashboard-ui';

type Variant = 'panel' | 'toolbar' | 'compact';

interface InvoicePrintPanelProps {
  invoiceId: string;
  invoice?: InvoicePrintSource | null;
  printData?: PrintInvoiceData | null;
  variant?: Variant;
  disabled?: boolean;
  className?: string;
  onError?: (message: string) => void;
  /** Highlight panel when landing from POS */
  autoFocus?: boolean;
}

type BusyKey = InvoiceCopyKind | 'ack' | 'thermal' | 'whatsapp' | null;

function openThermalPreview(text: string, invoiceNumber: string): string | null {
  const escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"/><title>Thermal · ${invoiceNumber}</title>
<style>
  @page { margin: 4mm; size: 58mm auto; }
  body { margin: 0; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 12px; line-height: 1.35; }
  pre { white-space: pre-wrap; word-break: break-word; margin: 0; }
  .hint { font-family: system-ui, sans-serif; font-size: 11px; color: #64748b; margin-bottom: 8px; }
  @media print { .hint { display: none; } }
</style></head><body>
<p class="hint">Thermal preview (58mm). Choose your receipt printer in the print dialog.</p>
<pre>${escaped}</pre>
</body></html>`;
  return openPrintWindow(html);
}

export function InvoicePrintPanel({
  invoiceId,
  invoice,
  printData: printDataProp,
  variant = 'panel',
  disabled = false,
  className,
  onError,
  autoFocus = false,
}: InvoicePrintPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState<BusyKey>(null);
  const [printData, setPrintData] = useState<PrintInvoiceData | null>(printDataProp ?? null);
  const [waHint, setWaHint] = useState('');

  useEffect(() => {
    if (printDataProp) setPrintData(printDataProp);
  }, [printDataProp]);

  useEffect(() => {
    if (!autoFocus) return;
    panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [autoFocus]);

  useEffect(() => {
    if (!menuOpen) return;
    const onPointer = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  const creditSummary = useMemo(
    () => (invoice ? getCreditSummary(invoice) : null),
    [invoice],
  );

  const showThermal = Boolean(printData?.displayOptions?.showThermalPrint);
  const showWhatsApp = Boolean(printData?.displayOptions?.showWhatsAppBill);
  const canPrint = Boolean(invoiceId) && !disabled && invoice?.status !== 'CANCELLED';
  const showExtraPanel = showThermal || showWhatsApp || Boolean(creditSummary);

  const runPrint = useCallback(
    async (copy: InvoiceCopyKind, acknowledgementOnly = false) => {
      if (!invoice) {
        onError?.('Invoice details not loaded yet.');
        return;
      }
      const key: BusyKey = acknowledgementOnly ? 'ack' : copy;
      setBusy(key);
      setMenuOpen(false);
      try {
        const data = await apiWithAuth<PrintInvoiceData>(
          `/invoices/${invoiceId}/print?copy=${acknowledgementOnly ? 'original' : copy}`,
        );
        setPrintData(data);

        const html = buildInvoicePrintHtml(
          data,
          invoice,
          acknowledgementOnly
            ? { kind: 'acknowledgement' }
            : { kind: 'invoice', copy, includeAcknowledgement: true },
        );
        const popupError = openPrintWindow(html);
        if (popupError) onError?.(popupError);
      } catch (err) {
        onError?.(parseError(err));
      } finally {
        setBusy(null);
      }
    },
    [invoice, invoiceId, onError],
  );

  const runThermal = useCallback(async () => {
    if (!invoice) {
      onError?.('Invoice details not loaded yet.');
      return;
    }
    setBusy('thermal');
    setMenuOpen(false);
    try {
      const data = await apiWithAuth<{ text: string; escposBase64: string }>(
        `/invoices/${invoiceId}/thermal`,
      );
      const popupError = openThermalPreview(data.text, invoice.invoiceNumber);
      if (popupError) onError?.(popupError);
    } catch (err) {
      onError?.(parseError(err));
    } finally {
      setBusy(null);
    }
  }, [invoice, invoiceId, onError]);

  const runWhatsApp = useCallback(async () => {
    setBusy('whatsapp');
    setMenuOpen(false);
    setWaHint('');
    try {
      const res = await apiWithAuth<{
        sent?: boolean;
        shareUrl?: string | null;
        reason?: string;
        hint?: string;
      }>(`/invoices/${invoiceId}/whatsapp`, { method: 'POST' });

      if (res.shareUrl) {
        window.open(res.shareUrl, '_blank', 'noopener,noreferrer');
        setWaHint(res.sent ? 'WhatsApp sent.' : 'WhatsApp share opened.');
      } else {
        const msg = res.hint || res.reason || 'Could not open WhatsApp for this bill.';
        setWaHint(msg);
        onError?.(msg);
      }
    } catch (err) {
      onError?.(parseError(err));
    } finally {
      setBusy(null);
    }
  }, [invoiceId, onError]);

  /** Header / list: Original · Duplicate · Triplicate (+ acknowledgement if udhaar). */
  if (variant === 'toolbar') {
    return (
      <div className={cn('flex flex-wrap gap-2', className)}>
        {INVOICE_COPY_OPTIONS.map((option) => (
          <Button
            key={option.copy}
            type="button"
            size="sm"
            variant="secondary"
            disabled={!canPrint || Boolean(busy)}
            onClick={() => void runPrint(option.copy)}
            title={option.hint}
          >
            {busy === option.copy ? '…' : option.shortLabel}
          </Button>
        ))}
        {creditSummary ? (
          <Button
            type="button"
            size="sm"
            disabled={!canPrint || Boolean(busy)}
            onClick={() => void runPrint('original', true)}
          >
            {busy === 'ack' ? '…' : 'Acknowledgement'}
          </Button>
        ) : null}
      </div>
    );
  }

  if (variant === 'compact') {
    return (
      <div ref={menuRef} className={cn('relative inline-block', className)}>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={!canPrint || Boolean(busy)}
          aria-expanded={menuOpen}
          aria-controls={menuId}
          onClick={() => setMenuOpen((open) => !open)}
        >
          {busy ? 'Printing…' : 'Print ▾'}
        </Button>
        {menuOpen ? (
          <div
            id={menuId}
            className="absolute right-0 z-30 mt-2 w-72 rounded-xl border border-slate-200 bg-white p-2 shadow-xl"
          >
            <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Tax invoice
            </p>
            {INVOICE_COPY_OPTIONS.map((option) => (
              <button
                key={option.copy}
                type="button"
                className="flex w-full flex-col rounded-lg px-3 py-2 text-left hover:bg-slate-50"
                onClick={() => void runPrint(option.copy)}
              >
                <span className="text-sm font-medium text-slate-900">{option.label}</span>
                <span className="text-xs text-slate-500">{option.hint}</span>
              </button>
            ))}
            {creditSummary ? (
              <>
                <div className="my-1 border-t border-slate-100" />
                <button
                  type="button"
                  className="flex w-full flex-col rounded-lg px-3 py-2 text-left hover:bg-amber-50"
                  onClick={() => void runPrint('original', true)}
                >
                  <span className="text-sm font-medium text-slate-900">Acknowledgement only</span>
                  <span className="text-xs text-slate-500">Original + customer copy</span>
                </button>
              </>
            ) : null}
            {showThermal || showWhatsApp ? (
              <>
                <div className="my-1 border-t border-slate-100" />
                {showThermal ? (
                  <button
                    type="button"
                    className="flex w-full flex-col rounded-lg px-3 py-2 text-left hover:bg-slate-50"
                    onClick={() => void runThermal()}
                  >
                    <span className="text-sm font-medium text-slate-900">Thermal receipt</span>
                    <span className="text-xs text-slate-500">58mm counter slip</span>
                  </button>
                ) : null}
                {showWhatsApp ? (
                  <button
                    type="button"
                    className="flex w-full flex-col rounded-lg px-3 py-2 text-left hover:bg-slate-50"
                    onClick={() => void runWhatsApp()}
                  >
                    <span className="text-sm font-medium text-slate-900">WhatsApp bill</span>
                    <span className="text-xs text-slate-500">Share to customer phone</span>
                  </button>
                ) : null}
              </>
            ) : null}
          </div>
        ) : null}
      </div>
    );
  }

  /* Body panel: only thermal / WhatsApp (settings) + udhaar acknowledgement — GST copies live in header. */
  if (!showExtraPanel) {
    return null;
  }

  return (
    <div
      ref={panelRef}
      className={cn(
        'rounded-2xl border bg-white shadow-sm',
        autoFocus ? 'border-teal-300 ring-2 ring-teal-100' : 'border-slate-200',
        className,
      )}
    >
      <div className="border-b border-slate-100 px-4 py-3 sm:px-5">
        <h3 className="text-base font-semibold text-slate-900">Share & extras</h3>
        <p className="mt-0.5 text-sm text-slate-500">
          GST Original / Duplicate / Triplicate are in the header next to Cancel.
        </p>
      </div>

      <div className="space-y-4 p-4 sm:p-5">
        {showThermal || showWhatsApp ? (
          <div className="grid gap-3 sm:grid-cols-2">
            {showThermal ? (
              <button
                type="button"
                disabled={!canPrint || Boolean(busy)}
                onClick={() => void runThermal()}
                className={cn(
                  'rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-teal-300 hover:bg-teal-50/40',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  busy === 'thermal' && 'border-teal-400 ring-2 ring-teal-100',
                )}
              >
                <span className="block text-sm font-semibold text-slate-900">
                  {busy === 'thermal' ? 'Opening…' : 'Thermal receipt'}
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">58mm counter slip</span>
              </button>
            ) : null}
            {showWhatsApp ? (
              <button
                type="button"
                disabled={!canPrint || Boolean(busy)}
                onClick={() => void runWhatsApp()}
                className={cn(
                  'rounded-xl border border-slate-200 bg-white px-4 py-3 text-left transition hover:border-teal-300 hover:bg-teal-50/40',
                  'disabled:cursor-not-allowed disabled:opacity-50',
                  busy === 'whatsapp' && 'border-teal-400 ring-2 ring-teal-100',
                )}
              >
                <span className="block text-sm font-semibold text-slate-900">
                  {busy === 'whatsapp' ? 'Opening…' : 'WhatsApp bill'}
                </span>
                <span className="mt-0.5 block text-xs text-slate-500">Send / share to customer</span>
              </button>
            ) : null}
          </div>
        ) : null}

        {waHint ? <p className="text-xs text-slate-500">{waHint}</p> : null}

        {creditSummary ? (
          <section className="rounded-xl border border-amber-200 bg-amber-50/80 p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-sm font-semibold text-amber-900">Credit / udhaar on this bill</p>
                <p className="mt-1 text-sm text-amber-800">
                  Paid {formatINR(creditSummary.amountPaid)} · Pending{' '}
                  {formatINR(creditSummary.creditPending)} · Total{' '}
                  {formatINR(creditSummary.grandTotal)}
                </p>
                <p className="mt-2 text-xs text-amber-700">
                  Tax invoice prints from the header include acknowledgement pages. Use the button
                  below for acknowledgement slips only.
                </p>
              </div>
              <Button
                type="button"
                size="sm"
                className="shrink-0"
                disabled={!canPrint || Boolean(busy)}
                onClick={() => void runPrint('original', true)}
              >
                {busy === 'ack' ? 'Opening…' : 'Acknowledgement only'}
              </Button>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
