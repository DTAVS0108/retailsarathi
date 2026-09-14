'use client';
import { AppLoader } from '@/app/_components/app-loader';
import { confirmDialog } from '@/app/_components/confirm-dialog';

import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Button, Card, formatINR } from '@retail-sarathi/ui';
import type { PrintInvoiceData } from '@retail-sarathi/ui';
import { calculateInvoice } from '@retail-sarathi/gst-engine';
import { apiWithAuth } from '@/lib/helpers';
import { InvoicePrintPanel } from '../../_components/invoice-print-panel';
import type { InvoicePrintSource } from '@/lib/invoice-print';
import { pageShellClassName,
  MessageBanner,
  PageHeader,
  StatusBadge,
  cn,
  formatDate,
  formatDateTime,
  inputClassName,
  parseError,
  tableCellClassName,
  tableHeaderClassName,
  toNumber,
} from '../../_components/dashboard-ui';

interface InvoiceLine {
  id: string;
  productName: string;
  productSku?: string | null;
  productBarcode?: string | null;
  hsnCode: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  gstRate: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
  serialNumbers?: string[];
}

interface InvoicePayment {
  id: string;
  method: string;
  amount: number;
  reference?: string | null;
  createdAt: string;
}

interface InvoiceDetail {
  id: string;
  invoiceNumber: string;
  createdAt: string;
  status: string;
  type: string;
  supplyType: string;
  subtotal: number;
  totalDiscount: number;
  totalCgst: number;
  totalSgst: number;
  totalIgst: number;
  grandTotal: number;
  processingFee?: number;
  notes?: string | null;
  irn?: string | null;
  ewayBillNo?: string | null;
  vehicleNo?: string | null;
  originalInvoice?: {
    id: string;
    invoiceNumber: string;
    grandTotal: number;
    createdAt: string;
  } | null;
  creditNotes?: Array<{
    id: string;
    invoiceNumber: string;
    grandTotal: number;
    processingFee: number;
    createdAt: string;
    notes?: string | null;
  }>;
  customer?: {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    gstin?: string | null;
    stateCode?: string | null;
    address?: string | null;
  } | null;
  branch?: {
    name?: string | null;
    address?: string | null;
    stateCode?: string | null;
  } | null;
  lines: InvoiceLine[];
  payments: InvoicePayment[];
}

export default function InvoiceDetailPage() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const highlightPrint = searchParams.get('print') === '1';
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [printData, setPrintData] = useState<PrintInvoiceData | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [ewayBillNo, setEwayBillNo] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [savingTransport, setSavingTransport] = useState(false);

  async function loadInvoice() {
    try {
      setLoading(true);
      setError('');
      const [invoiceResponse, printResponse] = await Promise.all([
        apiWithAuth<InvoiceDetail>(`/invoices/${params.id}`),
        apiWithAuth<PrintInvoiceData>(`/invoices/${params.id}/print`),
      ]);
      setInvoice(invoiceResponse);
      setPrintData(printResponse);
      setEwayBillNo(invoiceResponse.ewayBillNo ?? '');
      setVehicleNo(invoiceResponse.vehicleNo ?? '');
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (params.id) {
      void loadInvoice();
    }
  }, [params.id]);

  const recalculated = useMemo(() => {
    if (!invoice) return null;
    return calculateInvoice(
      invoice.lines.map((line) => ({
        productId: line.id,
        productName: line.productName,
        hsnCode: line.hsnCode,
        quantity: toNumber(line.quantity),
        unitPrice: toNumber(line.unitPrice),
        discount: toNumber(line.discount),
        gstRate: toNumber(line.gstRate),
      })),
      invoice.branch?.stateCode ?? invoice.customer?.stateCode ?? '',
      invoice.customer?.stateCode ?? undefined,
    );
  }, [invoice]);

  const printSource = useMemo((): InvoicePrintSource | null => {
    if (!invoice) return null;
    return {
      id: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      createdAt: invoice.createdAt,
      grandTotal: invoice.grandTotal,
      status: invoice.status,
      notes: invoice.notes,
      payments: invoice.payments,
      lines: invoice.lines.map((line) => ({
        productName: line.productName,
        quantity: line.quantity,
        total: line.total,
        serialNumbers: line.serialNumbers,
      })),
      customer: invoice.customer,
    };
  }, [invoice]);

  const netRefundAmount = useMemo(() => {
    if (!invoice) return 0;
    return toNumber(invoice.grandTotal) - toNumber(invoice.processingFee ?? 0);
  }, [invoice]);

  const totalReturned = useMemo(() => {
    if (!invoice?.creditNotes?.length) return 0;
    return invoice.creditNotes.reduce((s, cn) => s + toNumber(cn.grandTotal), 0);
  }, [invoice]);

  const netSalesAfterReturns = useMemo(() => {
    if (!invoice || invoice.type !== 'TAX_INVOICE') return null;
    return toNumber(invoice.grandTotal) - totalReturned;
  }, [invoice, totalReturned]);

  async function handleCancelInvoice() {
    if (!invoice || invoice.status === 'CANCELLED') return;
    const ok = await confirmDialog.confirm({
      title: 'Cancel invoice',
      message: `Cancel invoice ${invoice.invoiceNumber}? Stock and credit balances will be reversed.`,
      confirmLabel: 'Cancel invoice',
      cancelLabel: 'Keep invoice',
      tone: 'danger',
    });
    if (!ok) return;

    try {
      setSubmitting(true);
      setError('');
      setSuccess('');
      const response = await apiWithAuth<InvoiceDetail>(`/invoices/${params.id}/cancel`, {
        method: 'PATCH',
      });
      setInvoice(response);
      setSuccess('Invoice cancelled successfully.');
      await loadInvoice();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function saveTransport() {
    if (!invoice) return;
    try {
      setSavingTransport(true);
      setError('');
      const updated = await apiWithAuth<InvoiceDetail>(`/invoices/${invoice.id}/transport`, {
        method: 'PATCH',
        body: JSON.stringify({
          ewayBillNo: ewayBillNo.trim() || null,
          vehicleNo: vehicleNo.trim() || null,
        }),
      });
      setInvoice((current) =>
        current
          ? {
              ...current,
              ewayBillNo: updated.ewayBillNo,
              vehicleNo: updated.vehicleNo,
            }
          : current,
      );
      const printResponse = await apiWithAuth<PrintInvoiceData>(`/invoices/${params.id}/print`);
      setPrintData(printResponse);
      setSuccess('E-way / vehicle details saved for this invoice.');
    } catch (err) {
      setError(parseError(err));
    } finally {
      setSavingTransport(false);
    }
  }

  return (
    <div className={pageShellClassName}>
      <PageHeader
        title={invoice ? `Invoice ${invoice.invoiceNumber}` : 'Invoice detail'}
        description="Inspect billed lines, tax splits, customer details, and print-ready output for the selected invoice."
        breadcrumbLabel={invoice?.invoiceNumber ? `Invoice ${invoice.invoiceNumber}` : 'Invoice'}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {printSource ? (
              <InvoicePrintPanel
                invoiceId={params.id}
                invoice={printSource}
                printData={printData}
                variant="toolbar"
                onError={setError}
              />
            ) : null}
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={() => void handleCancelInvoice()}
              disabled={!invoice || invoice.status === 'CANCELLED' || submitting}
            >
              {submitting ? 'Cancelling...' : 'Cancel invoice'}
            </Button>
          </div>
        }
      />

      {error ? <MessageBanner tone="error">{error}</MessageBanner> : null}
      {success ? <MessageBanner tone="success">{success}</MessageBanner> : null}

      {invoice?.type === 'CREDIT_NOTE' && invoice.originalInvoice ? (
        <Card className="border-amber-200 bg-amber-50">
          <h2 className="text-lg font-semibold text-amber-950">Credit note · linked to original invoice</h2>
          <p className="mt-1 text-sm text-amber-900/90">
            For ITR/GST, keep both documents: the original tax invoice and this credit note. Net turnover
            uses invoice value minus credit note value.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
            <Link
              href={`/dashboard/invoices/${invoice.originalInvoice.id}`}
              className="font-semibold text-brand hover:underline"
            >
              Original: {invoice.originalInvoice.invoiceNumber}
            </Link>
            <span className="text-amber-900/70">{formatDate(invoice.originalInvoice.createdAt)}</span>
            <span className="font-medium text-amber-950">
              {formatINR(toNumber(invoice.originalInvoice.grandTotal))}
            </span>
          </div>
        </Card>
      ) : null}

      {printSource ? (
        <InvoicePrintPanel
          invoiceId={params.id}
          invoice={printSource}
          printData={printData}
          autoFocus={highlightPrint}
          onError={setError}
        />
      ) : null}

      {loading || !invoice ? (
        <Card className="border-slate-200">
          <AppLoader label="Loading invoice details..." />
        </Card>
      ) : (
        <>
          <section className="grid gap-4 xl:grid-cols-[1.2fr,0.8fr]">
            <Card className="border-slate-200">
              <div className="grid gap-6 md:grid-cols-2">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Billing details
                  </p>
                  <div className="mt-3 space-y-2 text-sm text-slate-600">
                    <p>
                      <span className="font-medium text-slate-900">Invoice number:</span>{' '}
                      {invoice.invoiceNumber}
                    </p>
                    <p>
                      <span className="font-medium text-slate-900">Issued on:</span>{' '}
                      {formatDateTime(invoice.createdAt)}
                    </p>
                    <p>
                      <span className="font-medium text-slate-900">Type:</span>{' '}
                      {invoice.type.replace(/_/g, ' ')}
                    </p>
                    <p>
                      <span className="font-medium text-slate-900">Supply type:</span>{' '}
                      {invoice.supplyType.replace(/_/g, ' ')}
                    </p>
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                    Customer
                  </p>
                  <div className="mt-3 space-y-2 text-sm text-slate-600">
                    <p className="font-semibold text-slate-900">{invoice.customer?.name || 'Walk-in customer'}</p>
                    {invoice.customer?.address ? <p>{invoice.customer.address}</p> : null}
                    <p>{invoice.customer?.phone || 'No phone on file'}</p>
                    {invoice.customer?.email ? <p>{invoice.customer.email}</p> : null}
                    <p className="font-mono text-xs">{invoice.customer?.gstin || 'No GSTIN'}</p>
                    <p>{invoice.branch?.name || 'Default branch'}</p>
                  </div>
                </div>
              </div>
              {invoice.notes ? (
                <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <span className="font-medium text-slate-900">Notes:</span> {invoice.notes}
                </div>
              ) : null}

              <div className="mt-6 rounded-2xl border border-slate-200 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">
                  E-way / vehicle
                </p>
                <p className="mt-1 text-sm text-slate-500">
                  Capture transport details for Tally-style print. Enable “E-way bill / vehicle” under Settings → Invoices.
                </p>
                <div className="mt-4 grid gap-3 md:grid-cols-2">
                  <label className="space-y-1 text-sm font-medium text-slate-700">
                    <span>E-way bill no.</span>
                    <input
                      className={inputClassName}
                      value={ewayBillNo}
                      onChange={(event) => setEwayBillNo(event.target.value)}
                      placeholder="Optional"
                    />
                  </label>
                  <label className="space-y-1 text-sm font-medium text-slate-700">
                    <span>Vehicle no.</span>
                    <input
                      className={inputClassName}
                      value={vehicleNo}
                      onChange={(event) => setVehicleNo(event.target.value)}
                      placeholder="e.g. UP20AB1234"
                    />
                  </label>
                </div>
                <div className="mt-3">
                  <Button type="button" variant="secondary" onClick={() => void saveTransport()} disabled={savingTransport}>
                    {savingTransport ? 'Saving...' : 'Save transport details'}
                  </Button>
                </div>
              </div>
            </Card>

            <Card className="border-slate-200">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-slate-500">Status</span>
                  <StatusBadge status={invoice.status} />
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Subtotal</span>
                  <span className="font-semibold text-slate-900">{formatINR(toNumber(invoice.subtotal))}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">Discount</span>
                  <span className="font-semibold text-slate-900">{formatINR(toNumber(invoice.totalDiscount))}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">CGST</span>
                  <span className="font-semibold text-slate-900">{formatINR(toNumber(invoice.totalCgst))}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">SGST</span>
                  <span className="font-semibold text-slate-900">{formatINR(toNumber(invoice.totalSgst))}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-500">IGST</span>
                  <span className="font-semibold text-slate-900">{formatINR(toNumber(invoice.totalIgst))}</span>
                </div>
                <div className="flex items-center justify-between border-t border-slate-200 pt-3">
                  <span className="text-sm font-medium text-slate-500">Grand total</span>
                  <span className="text-xl font-semibold text-brand">{formatINR(toNumber(invoice.grandTotal))}</span>
                </div>
                {invoice.type === 'CREDIT_NOTE' && toNumber(invoice.processingFee ?? 0) > 0 ? (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">Processing fee retained</span>
                      <span className="font-semibold text-slate-900">
                        − {formatINR(toNumber(invoice.processingFee))}
                      </span>
                    </div>
                    <div className="flex items-center justify-between border-t border-slate-200 pt-3">
                      <span className="text-sm font-medium text-slate-500">Net refund to customer</span>
                      <span className="text-lg font-semibold text-teal-700">{formatINR(netRefundAmount)}</span>
                    </div>
                  </>
                ) : null}
                {netSalesAfterReturns != null ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    <span className="font-medium">Net sales after returns:</span>{' '}
                    {formatINR(netSalesAfterReturns)}
                    {invoice.creditNotes?.length ? (
                      <span className="block text-xs text-amber-800/80">
                        {invoice.creditNotes.length} credit note(s) totalling {formatINR(totalReturned)}
                      </span>
                    ) : null}
                  </div>
                ) : null}
                {recalculated ? (
                  <div className="rounded-2xl border border-teal-200 bg-teal-50 px-4 py-3 text-sm text-teal-700">
                    Recalculated using GST engine: {formatINR(recalculated.grandTotal)}
                  </div>
                ) : null}
              </div>
            </Card>
          </section>

          {invoice.type === 'TAX_INVOICE' && invoice.creditNotes?.length ? (
            <Card className="border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">Returns &amp; credit notes</h2>
              <p className="mt-1 text-sm text-slate-500">
                These credit notes adjust GST and net turnover. The original invoice remains valid for audit.
              </p>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200 text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className={tableHeaderClassName}>Credit note</th>
                      <th className={tableHeaderClassName}>Date</th>
                      <th className={tableHeaderClassName}>Return value</th>
                      <th className={tableHeaderClassName}>Processing fee</th>
                      <th className={tableHeaderClassName}>Net refund</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {invoice.creditNotes.map((cn) => {
                      const fee = toNumber(cn.processingFee);
                      const net = toNumber(cn.grandTotal) - fee;
                      return (
                        <tr key={cn.id}>
                          <td className={tableCellClassName}>
                            <Link href={`/dashboard/invoices/${cn.id}`} className="font-medium text-brand hover:underline">
                              {cn.invoiceNumber}
                            </Link>
                          </td>
                          <td className={tableCellClassName}>{formatDate(cn.createdAt)}</td>
                          <td className={tableCellClassName}>{formatINR(toNumber(cn.grandTotal))}</td>
                          <td className={tableCellClassName}>{fee > 0 ? formatINR(fee) : '—'}</td>
                          <td className={tableCellClassName}>{formatINR(net)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {netSalesAfterReturns != null ? (
                <p className="mt-4 text-sm font-medium text-slate-700">
                  Net sales value for ITR: {formatINR(netSalesAfterReturns)}
                </p>
              ) : null}
            </Card>
          ) : null}

          {printData?.displayOptions?.showQr && printData.qrUrl ? (
            <Card className="border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">
                {printData.qrKind === 'nic' ? 'NIC e-Invoice QR' : 'Invoice QR (shop)'}
              </h2>
              <p className="mt-1 text-sm text-slate-500">
                {printData.qrKind === 'nic'
                  ? 'Signed QR from NIC / GSP (live IRN). This is not the same as a shop verification QR.'
                  : 'Shop verification QR. Enable Compliance+ and generate a live IRN for NIC SignedQR.'}
              </p>
              <p className="mt-1 text-sm text-slate-500">
                Shown because QR is enabled in Settings → Invoice content.
              </p>
              <div className="mt-4 flex flex-wrap gap-6">
                <img
                  src={printData.qrUrl}
                  alt="Invoice QR"
                  className="h-28 w-28 rounded-lg border border-slate-200 bg-white p-1"
                />
                <dl className="grid min-w-[240px] flex-1 gap-2 text-sm text-slate-700 sm:grid-cols-2">
                  {printData.qrParsed?.gstin ? (
                    <>
                      <dt className="text-slate-500">Seller GSTIN</dt>
                      <dd className="font-medium">{printData.qrParsed.gstin}</dd>
                    </>
                  ) : null}
                  {printData.qrParsed?.invoiceNumber ? (
                    <>
                      <dt className="text-slate-500">Invoice no.</dt>
                      <dd className="font-medium">{printData.qrParsed.invoiceNumber}</dd>
                    </>
                  ) : null}
                  {printData.qrParsed?.date ? (
                    <>
                      <dt className="text-slate-500">Date</dt>
                      <dd className="font-medium">{printData.qrParsed.date}</dd>
                    </>
                  ) : null}
                  {printData.qrParsed?.taxable != null ? (
                    <>
                      <dt className="text-slate-500">Taxable</dt>
                      <dd className="font-medium">{formatINR(printData.qrParsed.taxable)}</dd>
                    </>
                  ) : null}
                  {printData.qrParsed?.amount != null ? (
                    <>
                      <dt className="text-slate-500">Grand total</dt>
                      <dd className="font-medium">{formatINR(printData.qrParsed.amount)}</dd>
                    </>
                  ) : null}
                  {printData.qrParsed?.cgst != null ? (
                    <>
                      <dt className="text-slate-500">CGST</dt>
                      <dd className="font-medium">{formatINR(printData.qrParsed.cgst)}</dd>
                    </>
                  ) : null}
                  {printData.qrParsed?.sgst != null ? (
                    <>
                      <dt className="text-slate-500">SGST</dt>
                      <dd className="font-medium">{formatINR(printData.qrParsed.sgst)}</dd>
                    </>
                  ) : null}
                  {printData.qrParsed?.buyer ? (
                    <>
                      <dt className="text-slate-500">Buyer</dt>
                      <dd className="font-medium">{printData.qrParsed.buyer}</dd>
                    </>
                  ) : null}
                  {printData.qrParsed?.pay ? (
                    <>
                      <dt className="text-slate-500">Payment</dt>
                      <dd className="font-medium">{printData.qrParsed.pay}</dd>
                    </>
                  ) : null}
                  {printData.qrParsed?.irn ? (
                    <>
                      <dt className="text-slate-500">IRN</dt>
                      <dd className="break-all font-mono text-xs">{printData.qrParsed.irn}</dd>
                    </>
                  ) : null}
                </dl>
              </div>
              {printData.qrPayload ? (
                <p className="mt-4 break-all rounded-lg bg-slate-50 px-3 py-2 font-mono text-xs text-slate-600">
                  {printData.qrPayload}
                </p>
              ) : null}
            </Card>
          ) : null}

          <Card className="border-slate-200">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Invoice lines</h2>
                <p className="text-sm text-slate-500">
                  Each line shows taxable value and the exact CGST, SGST, or IGST recorded.
                </p>
              </div>
              <Link href="/dashboard/invoices" className="text-sm font-medium text-brand hover:underline">
                Back to invoice list
              </Link>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className={tableHeaderClassName}>Item</th>
                    <th className={tableHeaderClassName}>Qty</th>
                    <th className={tableHeaderClassName}>Rate</th>
                    <th className={tableHeaderClassName}>Taxable</th>
                    <th className={tableHeaderClassName}>CGST</th>
                    <th className={tableHeaderClassName}>SGST</th>
                    <th className={tableHeaderClassName}>IGST</th>
                    <th className={tableHeaderClassName}>Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {invoice.lines.map((line) => (
                    <tr key={line.id} className="hover:bg-slate-50">
                      <td className={tableCellClassName}>
                        <div className="space-y-1">
                          <p className="font-medium text-slate-900">{line.productName}</p>
                          <p className="text-xs text-slate-500">
                            HSN {line.hsnCode}
                            {line.productSku ? ` · SKU ${line.productSku}` : ''}
                            {line.productBarcode ? ` · ${line.productBarcode}` : ''}
                          </p>
                          {line.serialNumbers?.length ? (
                            <p className="text-xs text-slate-500">
                              Serial(s): {line.serialNumbers.join(', ')}
                            </p>
                          ) : null}
                        </div>
                      </td>
                      <td className={tableCellClassName}>{toNumber(line.quantity)}</td>
                      <td className={tableCellClassName}>{formatINR(toNumber(line.unitPrice))}</td>
                      <td className={tableCellClassName}>{formatINR(toNumber(line.taxableAmount))}</td>
                      <td className={tableCellClassName}>{formatINR(toNumber(line.cgst))}</td>
                      <td className={tableCellClassName}>{formatINR(toNumber(line.sgst))}</td>
                      <td className={tableCellClassName}>{formatINR(toNumber(line.igst))}</td>
                      <td className={cn(tableCellClassName, 'font-semibold text-slate-900')}>
                        {formatINR(toNumber(line.total))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <section className="grid gap-4 xl:grid-cols-[0.9fr,1.1fr]">
            <Card className="border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">Payments</h2>
              <div className="mt-4 space-y-3">
                {invoice.payments.length ? (
                  invoice.payments.map((payment) => (
                    <div
                      key={payment.id}
                      className="flex items-start justify-between rounded-2xl border border-slate-200 px-4 py-3"
                    >
                      <div>
                        <p className="font-medium text-slate-900">{payment.method.replace(/_/g, ' ')}</p>
                        <p className="text-xs text-slate-500">{formatDateTime(payment.createdAt)}</p>
                        {payment.reference ? (
                          <p className="text-xs text-slate-500">Ref: {payment.reference}</p>
                        ) : null}
                      </div>
                      <div className="font-semibold text-slate-900">{formatINR(toNumber(payment.amount))}</div>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-500">No payment rows recorded for this invoice.</p>
                )}
              </div>
            </Card>

            <Card className="border-slate-200">
              <h2 className="text-lg font-semibold text-slate-900">GST summary</h2>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-slate-200 px-4 py-3">
                  <p className="text-sm text-slate-500">Invoice date</p>
                  <p className="mt-1 font-semibold text-slate-900">{formatDate(invoice.createdAt)}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 px-4 py-3">
                  <p className="text-sm text-slate-500">Supply type</p>
                  <p className="mt-1 font-semibold text-slate-900">{invoice.supplyType.replace(/_/g, ' ')}</p>
                </div>
                <div className="rounded-2xl border border-slate-200 px-4 py-3">
                  <p className="text-sm text-slate-500">Computed CGST</p>
                  <p className="mt-1 font-semibold text-slate-900">
                    {formatINR(recalculated?.totalCgst ?? 0)}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 px-4 py-3">
                  <p className="text-sm text-slate-500">Computed SGST</p>
                  <p className="mt-1 font-semibold text-slate-900">
                    {formatINR(recalculated?.totalSgst ?? 0)}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 px-4 py-3">
                  <p className="text-sm text-slate-500">Computed IGST</p>
                  <p className="mt-1 font-semibold text-slate-900">
                    {formatINR(recalculated?.totalIgst ?? 0)}
                  </p>
                </div>
                <div className="rounded-2xl border border-slate-200 px-4 py-3">
                  <p className="text-sm text-slate-500">Computed grand total</p>
                  <p className="mt-1 font-semibold text-brand">
                    {formatINR(recalculated?.grandTotal ?? 0)}
                  </p>
                </div>
              </div>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
