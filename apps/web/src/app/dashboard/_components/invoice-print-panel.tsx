'use client';

import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Button, formatINR } from '@retail-sarathi/ui';
import { apiWithAuth } from '@/lib/helpers';
import {
  buildInvoicePrintHtml,
  getCreditSummary,
  openPrintWindow,
  type InvoiceCopyKind,
  type InvoicePrintSource,
} from '@/lib/invoice-print';
import type { PrintInvoiceData } from '@retail-sarathi/ui';
import { cn, parseError } from './dashboard-ui';
import { NavIcon } from './nav-icons';
import type { RowAction } from './row-actions-menu';
import { InvoicePreviewModal } from './invoice-preview-modal';
import { downloadBlob } from './export-dropdown';

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
  /** compact variant only — non-print items (e.g. "Open bill") prepended to the menu, so a
      row's whole action set (Open + print/share) lives in one kebab instead of two controls. */
  extraActions?: RowAction[];
  /** Tenant's configured copy count (1=Original, 2=+Duplicate, 3=+Triplicate) for "Download
      invoice". Ignored for credit notes, which are always a single copy. Defaults to 1. */
  invoiceCopyCount?: number;
}

type BusyKey = InvoiceCopyKind | 'ack' | 'thermal' | 'whatsapp' | 'download' | null;

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
  extraActions = [],
  invoiceCopyCount = 1,
}: InvoicePrintPanelProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuPanelRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number; openUpward: boolean } | null>(null);
  const [busy, setBusy] = useState<BusyKey>(null);
  const [printData, setPrintData] = useState<PrintInvoiceData | null>(printDataProp ?? null);
  const [waHint, setWaHint] = useState('');
  const [previewOpen, setPreviewOpen] = useState(false);
  const isCreditNote = invoice?.documentType === 'CREDIT_NOTE';

  useEffect(() => {
    if (printDataProp) setPrintData(printDataProp);
  }, [printDataProp]);

  useEffect(() => {
    if (!autoFocus) return;
    panelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [autoFocus]);

  useEffect(() => {
    if (!menuOpen) return;
    // Compact menu rows are ~2 lines tall (label + hint) — a taller estimate than a flat
    // single-line menu, purely for deciding whether to flip the panel upward near the fold.
    const place = () => {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      const estimatedHeight = 260;
      const roomBelow = window.innerHeight - rect.bottom;
      const openUpward = roomBelow < estimatedHeight && rect.top > estimatedHeight;
      setMenuPos({
        top: openUpward ? rect.top - 6 : rect.bottom + 6,
        left: rect.right,
        openUpward,
      });
    };
    place();
    const close = () => setMenuOpen(false);
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuPanelRef.current?.contains(target)) return;
      close();
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    // Close on a real user scroll gesture, not the raw 'scroll' event — see the equivalent
    // comment in row-actions-menu.tsx for why (this app's global smooth-scroll behavior makes
    // 'scroll' fire well after the click that opened the menu, closing it immediately).
    document.addEventListener('wheel', close, { passive: true });
    document.addEventListener('touchmove', close, { passive: true });
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('wheel', close);
      document.removeEventListener('touchmove', close);
      window.removeEventListener('resize', close);
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

  /** True one-click file download — the backend bundles the tenant's configured copy count
      (1-3, always 1 for a credit note) into a single real PDF rendered server-side via a headless
      browser, and returns it as base64 (same {filename, base64} shape this app's CSV/XLSX export
      already uses), so this stays on the normal apiWithAuth JSON path with no special-casing. */
  const runDownload = useCallback(async () => {
    setBusy('download');
    setMenuOpen(false);
    try {
      const res = await apiWithAuth<{ filename: string; base64: string }>(`/invoices/${invoiceId}/download`);
      const binary = atob(res.base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      downloadBlob(res.filename, new Blob([bytes], { type: 'application/pdf' }));
    } catch (err) {
      onError?.(parseError(err));
    } finally {
      setBusy(null);
    }
  }, [invoiceId, onError]);

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

  /** Header / list: Preview + one Download action (+ acknowledgement if udhaar). */
  if (variant === 'toolbar') {
    return (
      <div className={cn('flex flex-wrap gap-2', className)}>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={!canPrint || Boolean(busy)}
          onClick={() => setPreviewOpen(true)}
        >
          Preview
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={!canPrint || Boolean(busy)}
          onClick={() => void runPrint('original')}
        >
          {busy === 'original' ? '…' : 'Print'}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!canPrint || Boolean(busy)}
          onClick={() => void runDownload()}
        >
          {busy === 'download' ? '…' : isCreditNote ? 'Download credit note' : 'Download invoice'}
        </Button>
        {creditSummary ? (
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={!canPrint || Boolean(busy)}
            onClick={() => void runPrint('original', true)}
          >
            {busy === 'ack' ? '…' : 'Acknowledgement'}
          </Button>
        ) : null}
        <InvoicePreviewModal
          open={previewOpen}
          invoiceId={invoiceId}
          invoiceNumber={invoice?.invoiceNumber}
          onClose={() => setPreviewOpen(false)}
        />
      </div>
    );
  }

  if (variant === 'compact') {
    const visibleExtraActions = extraActions.filter((a) => !a.hidden);
    return (
      <div className={cn('inline-block', className)}>
        <button
          ref={triggerRef}
          type="button"
          disabled={Boolean(busy)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-controls={menuId}
          aria-label="Row actions"
          onClick={() => setMenuOpen((open) => !open)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-slate-500 transition hover:bg-slate-50 disabled:opacity-50"
        >
          <NavIcon name="kebab" className="h-4 w-4" />
        </button>
        {menuOpen && menuPos
          ? createPortal(
              <div
                ref={menuPanelRef}
                id={menuId}
                role="menu"
                style={{
                  position: 'fixed',
                  top: menuPos.openUpward ? undefined : menuPos.top,
                  bottom: menuPos.openUpward ? window.innerHeight - menuPos.top : undefined,
                  left: menuPos.left,
                  transform: 'translateX(-100%)',
                }}
                className="z-[100] w-72 rounded-xl border border-slate-200 bg-white p-2 shadow-xl"
              >
                {visibleExtraActions.length ? (
                  <>
                    {visibleExtraActions.map((a) => (
                      <button
                        key={a.key}
                        type="button"
                        role="menuitem"
                        disabled={a.disabled}
                        onClick={() => {
                          setMenuOpen(false);
                          a.onClick();
                        }}
                        className={cn(
                          'flex w-full items-center rounded-lg px-3 py-2 text-left text-sm transition disabled:cursor-not-allowed disabled:opacity-50',
                          a.tone === 'danger' ? 'text-rose-700 hover:bg-rose-50' : 'text-slate-800 hover:bg-slate-50',
                        )}
                      >
                        {a.label}
                      </button>
                    ))}
                    <div className="my-1 border-t border-slate-100" />
                  </>
                ) : null}
                <p className="px-2 py-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {isCreditNote ? 'Credit note' : 'Tax invoice'}
                </p>
                <button
                  type="button"
                  role="menuitem"
                  disabled={!canPrint || Boolean(busy)}
                  className="flex w-full flex-col rounded-lg px-3 py-2 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => {
                    setMenuOpen(false);
                    setPreviewOpen(true);
                  }}
                >
                  <span className="text-sm font-medium text-slate-900">Preview</span>
                  <span className="text-xs text-slate-500">See the layout before printing</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={!canPrint || Boolean(busy)}
                  className="flex w-full flex-col rounded-lg px-3 py-2 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => void runPrint('original')}
                >
                  <span className="text-sm font-medium text-slate-900">{busy === 'original' ? 'Opening…' : 'Print'}</span>
                  <span className="text-xs text-slate-500">Opens the browser print dialog</span>
                </button>
                <button
                  type="button"
                  role="menuitem"
                  disabled={!canPrint || Boolean(busy)}
                  className="flex w-full flex-col rounded-lg px-3 py-2 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => void runDownload()}
                >
                  <span className="text-sm font-medium text-slate-900">
                    {busy === 'download' ? 'Preparing…' : isCreditNote ? 'Download credit note' : 'Download invoice'}
                  </span>
                  <span className="text-xs text-slate-500">
                    {isCreditNote ? 'Single copy' : `${Math.min(3, Math.max(1, invoiceCopyCount))} ${Math.min(3, Math.max(1, invoiceCopyCount)) === 1 ? 'copy' : 'copies'} — set in Settings`}
                  </span>
                </button>
                {creditSummary ? (
                  <>
                    <div className="my-1 border-t border-slate-100" />
                    <button
                      type="button"
                      role="menuitem"
                      disabled={!canPrint || Boolean(busy)}
                      className="flex w-full flex-col rounded-lg px-3 py-2 text-left hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-50"
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
                        role="menuitem"
                        disabled={!canPrint || Boolean(busy)}
                        className="flex w-full flex-col rounded-lg px-3 py-2 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => void runThermal()}
                      >
                        <span className="text-sm font-medium text-slate-900">Thermal receipt</span>
                        <span className="text-xs text-slate-500">58mm counter slip</span>
                      </button>
                    ) : null}
                    {showWhatsApp ? (
                      <button
                        type="button"
                        role="menuitem"
                        disabled={!canPrint || Boolean(busy)}
                        className="flex w-full flex-col rounded-lg px-3 py-2 text-left hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                        onClick={() => void runWhatsApp()}
                      >
                        <span className="text-sm font-medium text-slate-900">WhatsApp bill</span>
                        <span className="text-xs text-slate-500">Share to customer phone</span>
                      </button>
                    ) : null}
                  </>
                ) : null}
              </div>,
              document.body,
            )
          : null}
        <InvoicePreviewModal
          open={previewOpen}
          invoiceId={invoiceId}
          invoiceNumber={invoice?.invoiceNumber}
          onClose={() => setPreviewOpen(false)}
        />
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
