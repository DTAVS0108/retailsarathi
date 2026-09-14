'use client';
import { AppLoader } from '@/app/_components/app-loader';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Card, formatINR } from '@retail-sarathi/ui';
import { calculateInvoice } from '@retail-sarathi/gst-engine';
import { apiWithAuth } from '@/lib/helpers';
import { pageShellClassName,
  EmptyState,
  MessageBanner,
  PageHeader,
  formatDate,
  inputClassName,
  parseError,
  selectClassName,
  tableCellClassName,
  tableHeaderClassName,
  toNumber,
} from '../_components/dashboard-ui';

interface InvoiceLine {
  id: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  gstRate: number;
  hsnCode: string;
  total: number;
}

interface Invoice {
  id: string;
  invoiceNumber: string;
  grandTotal: number;
  status: string;
  type: string;
  supplyType: string;
  customer?: { name?: string | null; stateCode?: string | null } | null;
  branch?: { stateCode?: string | null } | null;
  lines?: InvoiceLine[];
}

interface ReturnSummaryLine {
  invoiceLineId: string;
  productName: string;
  soldQty: number;
  returnedQty: number;
  remainingQty: number;
}

interface ReturnSummary {
  originalInvoiceNumber: string;
  originalGrandTotal: number;
  totalReturned: number;
  totalProcessingFees: number;
  netRefunded: number;
  netSalesValue: number;
  lines: ReturnSummaryLine[];
  creditNotes: Array<{
    id: string;
    invoiceNumber: string;
    grandTotal: number;
    processingFee: number;
    netRefund: number;
    createdAt: string;
  }>;
  itrGuidance: {
    keepOriginalInvoice: boolean;
    fileCreditNoteInGstr1: boolean;
    netTurnoverNote: string;
  };
}

interface ReturnLine {
  invoiceLineId: string;
  productName: string;
  soldQty: number;
  returnedQty: number;
  maxQty: number;
  returnQty: string;
  selected: boolean;
}

export default function ReturnsPage() {
  const router = useRouter();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoiceId, setInvoiceId] = useState('');
  const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
  const [returnSummary, setReturnSummary] = useState<ReturnSummary | null>(null);
  const [returnLines, setReturnLines] = useState<ReturnLine[]>([]);
  const [processingFee, setProcessingFee] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const res = await apiWithAuth<{ items: Invoice[] }>('/invoices?status=FINALIZED&pageSize=100');
        const taxInvoices = res.items.filter((inv) => inv.type === 'TAX_INVOICE');
        setInvoices(taxInvoices);
        if (taxInvoices[0]?.id) setInvoiceId(taxInvoices[0].id);
      } catch (e) {
        setError(parseError(e));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!invoiceId) {
      setSelectedInvoice(null);
      setReturnSummary(null);
      setReturnLines([]);
      return;
    }
    void (async () => {
      try {
        setError('');
        const [inv, summary] = await Promise.all([
          apiWithAuth<Invoice>(`/invoices/${invoiceId}`),
          apiWithAuth<ReturnSummary>(`/invoices/${invoiceId}/return-summary`),
        ]);
        setSelectedInvoice(inv);
        setReturnSummary(summary);
        setProcessingFee('');
        setReturnLines(
          summary.lines.map((l) => ({
            invoiceLineId: l.invoiceLineId,
            productName: l.productName,
            soldQty: l.soldQty,
            returnedQty: l.returnedQty,
            maxQty: l.remainingQty,
            returnQty: l.remainingQty > 0 ? String(l.remainingQty) : '0',
            selected: false,
          })),
        );
      } catch (e) {
        setError(parseError(e));
      }
    })();
  }, [invoiceId]);

  const previewTotals = useMemo(() => {
    if (!selectedInvoice) return null;
    const lines = returnLines
      .filter((l) => l.selected && toNumber(l.returnQty) > 0)
      .map((l) => {
        const src = selectedInvoice.lines?.find((x) => x.id === l.invoiceLineId);
        if (!src) return null;
        const qty = toNumber(l.returnQty);
        const ratio = qty / toNumber(src.quantity);
        return {
          productName: src.productName,
          hsnCode: src.hsnCode,
          quantity: qty,
          unitPrice: toNumber(src.unitPrice),
          discount: toNumber(src.discount) * ratio,
          gstRate: toNumber(src.gstRate),
        };
      })
      .filter(Boolean) as Array<{
      productName: string;
      hsnCode: string;
      quantity: number;
      unitPrice: number;
      discount: number;
      gstRate: number;
    }>;
    if (!lines.length) return null;
    return calculateInvoice(
      lines,
      selectedInvoice.branch?.stateCode ?? '',
      selectedInvoice.customer?.stateCode ?? undefined,
    );
  }, [returnLines, selectedInvoice]);

  const feeAmount = Math.max(0, toNumber(processingFee));
  const grossReturn = previewTotals?.grandTotal ?? 0;
  const netRefund = Math.max(0, grossReturn - feeAmount);

  const selectedCount = useMemo(
    () => returnLines.filter((l) => l.selected && toNumber(l.returnQty) > 0).length,
    [returnLines],
  );

  async function submitReturn() {
    const lines = returnLines
      .filter((l) => l.selected && toNumber(l.returnQty) > 0)
      .map((l) => ({
        invoiceLineId: l.invoiceLineId,
        quantity: toNumber(l.returnQty),
      }));

    if (!invoiceId || !lines.length) {
      setError('Select at least one line with a return quantity.');
      return;
    }

    for (const l of returnLines.filter((x) => x.selected)) {
      const qty = toNumber(l.returnQty);
      if (qty <= 0 || qty > l.maxQty) {
        setError(`Invalid return qty for ${l.productName} (max ${l.maxQty} remaining).`);
        return;
      }
    }

    if (feeAmount > grossReturn + 0.01) {
      setError('Processing fee cannot exceed return value.');
      return;
    }

    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const creditNote = await apiWithAuth<{
        id: string;
        invoiceNumber: string;
        netRefund?: number;
      }>('/invoices/returns', {
        method: 'POST',
        body: JSON.stringify({
          originalInvoiceId: invoiceId,
          notes: notes.trim() || undefined,
          processingFee: feeAmount > 0 ? feeAmount : undefined,
          lines,
        }),
      });
      const refundNote =
        feeAmount > 0 && creditNote.netRefund != null
          ? ` Net refund: ${formatINR(creditNote.netRefund)} (after ${formatINR(feeAmount)} fee).`
          : '';
      setSuccess(`Credit note ${creditNote.invoiceNumber} created. Stock restored.${refundNote}`);
      setTimeout(() => router.push(`/dashboard/invoices/${creditNote.id}`), 1400);
    } catch (e) {
      setError(parseError(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <AppLoader label="Loading returns…" />;
  }

  return (
    <div className={pageShellClassName}>
      <PageHeader
        title="Returns / Credit Notes"
        description="Issue a GST credit note against a finalized tax invoice. Processing fees reduce the customer refund; both documents stay on record for ITR and GSTR-1."
      />

      {error ? <MessageBanner tone="error">{error}</MessageBanner> : null}
      {success ? <MessageBanner tone="success">{success}</MessageBanner> : null}

      <Card className="border-amber-200 bg-amber-50">
        <h3 className="text-sm font-semibold text-amber-900">ITR &amp; GST — how returns work</h3>
        <ul className="mt-2 list-inside list-disc space-y-1 text-sm text-amber-900/90">
          <li>
            <strong>Keep the original tax invoice</strong> — do not delete it from your records even after a
            return.
          </li>
          <li>
            <strong>Issue a credit note</strong> — this legally reverses the supply and adjusts GST output tax.
          </li>
          <li>
            <strong>Net turnover for ITR</strong> = original invoice value − credit note value(s). Processing
            fees you retain are your income (not part of the reversed supply).
          </li>
          <li>
            File the credit note in <strong>GSTR-1</strong> (CDNR/CDNUR) linked to the original invoice where
            applicable.
          </li>
        </ul>
      </Card>

      <Card className="border-slate-200">
        <h3 className="mb-3 text-lg font-semibold">Original invoice</h3>
        {invoices.length ? (
          <select
            className={selectClassName}
            value={invoiceId}
            onChange={(e) => setInvoiceId(e.target.value)}
          >
            {invoices.map((inv) => (
              <option key={inv.id} value={inv.id}>
                {inv.invoiceNumber}
                {inv.customer?.name ? ` · ${inv.customer.name}` : ''}
                {` · ${formatINR(toNumber(inv.grandTotal))}`}
              </option>
            ))}
          </select>
        ) : (
          <EmptyState title="No finalized invoices" description="Create a bill from POS first." />
        )}

        {returnSummary && selectedInvoice ? (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              <p className="text-slate-500">Invoice value</p>
              <p className="font-semibold text-slate-900">
                {formatINR(returnSummary.originalGrandTotal)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              <p className="text-slate-500">Already returned</p>
              <p className="font-semibold text-slate-900">
                {formatINR(returnSummary.totalReturned)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              <p className="text-slate-500">Net sales (after returns)</p>
              <p className="font-semibold text-brand">{formatINR(returnSummary.netSalesValue)}</p>
            </div>
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
              <p className="text-slate-500">Prior credit notes</p>
              <p className="font-semibold text-slate-900">{returnSummary.creditNotes.length}</p>
            </div>
          </div>
        ) : null}

        {returnSummary?.creditNotes.length ? (
          <div className="mt-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Existing credit notes
            </p>
            <ul className="mt-2 space-y-2">
              {returnSummary.creditNotes.map((cn) => (
                <li
                  key={cn.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm"
                >
                  <Link href={`/dashboard/invoices/${cn.id}`} className="font-medium text-brand hover:underline">
                    {cn.invoiceNumber}
                  </Link>
                  <span className="text-slate-500">{formatDate(cn.createdAt)}</span>
                  <span className="font-semibold text-slate-900">{formatINR(cn.grandTotal)}</span>
                  {cn.processingFee > 0 ? (
                    <span className="text-xs text-slate-500">
                      Fee {formatINR(cn.processingFee)} · Net {formatINR(cn.netRefund)}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>

      {selectedInvoice && returnLines.some((l) => l.maxQty > 0) ? (
        <Card className="border-slate-200">
          <h3 className="mb-3 text-lg font-semibold">Lines to return</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr>
                  <th className={tableHeaderClassName}>Return</th>
                  <th className={tableHeaderClassName}>Item</th>
                  <th className={tableHeaderClassName}>Sold</th>
                  <th className={tableHeaderClassName}>Returned</th>
                  <th className={tableHeaderClassName}>Remaining</th>
                  <th className={tableHeaderClassName}>Return qty</th>
                </tr>
              </thead>
              <tbody>
                {returnLines.map((l) => (
                  <tr key={l.invoiceLineId} className="border-t border-slate-100">
                    <td className={tableCellClassName}>
                      <input
                        type="checkbox"
                        checked={l.selected}
                        disabled={l.maxQty <= 0}
                        onChange={(e) =>
                          setReturnLines((prev) =>
                            prev.map((x) =>
                              x.invoiceLineId === l.invoiceLineId
                                ? { ...x, selected: e.target.checked }
                                : x,
                            ),
                          )
                        }
                      />
                    </td>
                    <td className={tableCellClassName}>{l.productName}</td>
                    <td className={tableCellClassName}>{l.soldQty}</td>
                    <td className={tableCellClassName}>{l.returnedQty}</td>
                    <td className={tableCellClassName}>{l.maxQty}</td>
                    <td className={tableCellClassName}>
                      <input
                        className={`${inputClassName} max-w-24`}
                        type="number"
                        min="0"
                        max={l.maxQty}
                        step="1"
                        value={l.returnQty}
                        disabled={!l.selected || l.maxQty <= 0}
                        onChange={(e) =>
                          setReturnLines((prev) =>
                            prev.map((x) =>
                              x.invoiceLineId === l.invoiceLineId
                                ? { ...x, returnQty: e.target.value }
                                : x,
                            ),
                          )
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <label className="space-y-1 text-sm font-medium text-slate-700">
              <span>Processing / restocking fee (optional)</span>
              <input
                className={inputClassName}
                type="number"
                min="0"
                step="0.01"
                placeholder="0"
                value={processingFee}
                onChange={(e) => setProcessingFee(e.target.value)}
              />
              <p className="text-xs font-normal text-slate-500">
                Deducted from refund to customer. You retain this as handling income; GST on the fee
                (if applicable) is separate from the reversed supply.
              </p>
            </label>

            {previewTotals ? (
              <div className="rounded-xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-900">
                <p className="font-semibold">Refund preview</p>
                <div className="mt-2 space-y-1">
                  <div className="flex justify-between">
                    <span>Return value (credit note)</span>
                    <span>{formatINR(grossReturn)}</span>
                  </div>
                  {feeAmount > 0 ? (
                    <div className="flex justify-between">
                      <span>Processing fee</span>
                      <span>− {formatINR(feeAmount)}</span>
                    </div>
                  ) : null}
                  <div className="flex justify-between border-t border-teal-200 pt-2 font-semibold">
                    <span>Net refund to customer</span>
                    <span>{formatINR(netRefund)}</span>
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-slate-500">Select lines to see refund preview.</p>
            )}
          </div>

          <textarea
            className={`${inputClassName} mt-4 min-h-20`}
            placeholder="Return notes (optional)"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
          <Button className="mt-4" disabled={saving || !selectedCount} onClick={() => void submitReturn()}>
            {saving
              ? 'Creating credit note…'
              : `Create credit note (${selectedCount} line${selectedCount === 1 ? '' : 's'})`}
          </Button>
        </Card>
      ) : selectedInvoice && returnSummary ? (
        <Card className="border-slate-200">
          <EmptyState
            title="Fully returned"
            description="All lines on this invoice have been returned. No further credit notes can be issued."
          />
        </Card>
      ) : null}
    </div>
  );
}
