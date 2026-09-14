'use client';
import { AppLoader } from '@/app/_components/app-loader';
import { DocumentViewer } from '@/app/_components/document-viewer';
import { confirmDialog } from '@/app/_components/confirm-dialog';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button, Card, formatINR } from '@retail-sarathi/ui';
import { apiWithAuth, getToken } from '@/lib/helpers';
import {
  pageShellClassName,
  MessageBanner,
  PageHeader,
  cn,
  formatDate,
  parseError,
  tableCellClassName,
  tableHeaderClassName,
} from '../../_components/dashboard-ui';

const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? 'http://localhost:4000';

type BillDetail = {
  id: string;
  invoiceNumber: string;
  invoiceDate: string | null;
  dueDate?: string | null;
  paymentTermsDays?: number;
  gstin?: string | null;
  placeOfSupply?: string | null;
  irn?: string | null;
  subtotal?: number | string;
  taxAmount?: number | string;
  cgstAmount?: number | string;
  sgstAmount?: number | string;
  igstAmount?: number | string;
  totalAmount: number | string;
  paidAmount: number | string;
  dueAmount?: number;
  overdueDays?: number;
  agingBucket?: string;
  missingFields?: string[];
  status: string;
  billImagePath?: string | null;
  billImageName?: string | null;
  billImageMime?: string | null;
  freeNotes?: string | null;
  meta?: Record<string, unknown> | null;
  supplier?: { id: string; name: string; gstin?: string | null; phone?: string | null } | null;
  supplierName?: string | null;
  createdBy?: { id: string; name: string } | null;
  allocations?: Array<{
    id: string;
    amount: number | string;
    payment?: {
      id: string;
      amount: number | string;
      method: string;
      paymentDate: string;
      referenceNo?: string | null;
    } | null;
  }>;
  ledgerEntries?: Array<{
    id: string;
    type: string;
    amount: number | string;
    balanceAfter: number | string;
    notes?: string | null;
    entryDate: string;
  }>;
  lines: Array<{
    id: string;
    productName: string;
    sku?: string | null;
    quantity: number | string;
    unitCost: number | string;
    lineTotal: number | string;
    hsnCode?: string | null;
    gstRate?: number | string | null;
    product?: { id: string; barcode?: string | null } | null;
  }>;
};

const FIELD_LABELS: Record<string, string> = {
  invoiceNumber: 'Invoice #',
  invoiceDate: 'Date',
  supplier: 'Supplier',
  gstin: 'GSTIN',
  totalAmount: 'Total',
  items: 'Items',
  totalsMismatch: 'Totals check',
};

function agingLabel(bucket?: string) {
  switch (bucket) {
    case 'CURRENT':
      return 'Not yet due';
    case 'DUE_0_30':
      return '1–30 days overdue';
    case 'DUE_31_60':
      return '31–60 days overdue';
    case 'DUE_61_90':
      return '61–90 days overdue';
    case 'DUE_90_PLUS':
      return '90+ days overdue';
    case 'PAID':
      return 'Settled';
    default:
      return '—';
  }
}

export default function PurchaseBillDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params.id || '');
  const [bill, setBill] = useState<BillDetail | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [uploading, setUploading] = useState(false);
  const [voiding, setVoiding] = useState(false);

  async function load() {
    try {
      const data = await apiWithAuth<BillDetail>(`/purchase-bills/${id}`);
      setBill(data);
    } catch (err) {
      setError(parseError(err));
    }
  }

  useEffect(() => {
    if (id) void load();
  }, [id]);

  async function attachFile(file: File) {
    try {
      setUploading(true);
      setError('');
      const token = getToken();
      if (!token) throw new Error('Not signed in');
      const form = new FormData();
      form.append('file', file);
      const res = await fetch(`${API_ORIGIN}/api/v1/purchase-bills/${id}/attach`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).message || 'Upload failed');
      setSuccess('Bill image attached.');
      await load();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setUploading(false);
    }
  }

  async function voidBill() {
    if (!bill) return;
    const ok = await confirmDialog.confirm({
      title: 'Void this purchase bill?',
      message:
        `Reverses stock for ${bill.invoiceNumber} and unpaid supplier balance.\n` +
        `Blocked if payments exist. Use Corrections for the full cleanup workspace.`,
      confirmLabel: 'Void bill',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      setVoiding(true);
      setError('');
      await apiWithAuth(`/purchase-bills/${id}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Voided from bill detail' }),
      });
      setSuccess('Bill voided. Stock and payable reversed.');
      await load();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setVoiding(false);
    }
  }

  if (!bill && !error) return <AppLoader label="Loading bill…" />;

  const due =
    bill?.dueAmount ??
    Math.max(0, Number(bill?.totalAmount ?? 0) - Number(bill?.paidAmount ?? 0));
  const canVoid =
    bill &&
    bill.status !== 'CANCELLED' &&
    Number(bill.paidAmount ?? 0) <= 0 &&
    !(bill.allocations && bill.allocations.length > 0);

  return (
    <div className={pageShellClassName}>
      <PageHeader
        title={`Invoice ${bill?.invoiceNumber || ''}`}
        description={`${bill?.supplier?.name || bill?.supplierName || 'Supplier'} · ${bill?.status?.replace('_', ' ')} · inv ${formatDate(bill?.invoiceDate) || '—'} · due ${formatDate(bill?.dueDate) || '—'} · balance ${formatINR(due)}`}
        breadcrumbLabel={bill?.invoiceNumber ? `Bill ${bill.invoiceNumber}` : 'Purchase bill'}
        actions={
          <div className="flex flex-wrap gap-2">
            {bill?.supplier ? (
              <Button
                type="button"
                variant="secondary"
                onClick={() => router.push(`/dashboard/suppliers/${bill.supplier!.id}`)}
              >
                Pay / ledger
              </Button>
            ) : null}
            <Button type="button" variant="secondary" onClick={() => router.push('/dashboard/corrections')}>
              Corrections
            </Button>
            {canVoid ? (
              <Button type="button" variant="danger" disabled={voiding} onClick={() => void voidBill()}>
                {voiding ? 'Voiding…' : 'Void bill'}
              </Button>
            ) : null}
          </div>
        }
      />

      {error ? <MessageBanner tone="error">{error}</MessageBanner> : null}
      {success ? <MessageBanner tone="success">{success}</MessageBanner> : null}

      {bill?.missingFields?.length ? (
        <MessageBanner tone="error">
          Incomplete for tracking:{' '}
          {bill.missingFields.map((f) => FIELD_LABELS[f] || f).join(', ')}
        </MessageBanner>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="border-slate-200 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Taxable</p>
          <p className="mt-1 text-xl font-semibold">{formatINR(Number(bill?.subtotal ?? 0))}</p>
        </Card>
        <Card className="border-slate-200 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tax</p>
          <p className="mt-1 text-xl font-semibold">{formatINR(Number(bill?.taxAmount ?? 0))}</p>
          <p className="mt-1 text-xs text-slate-500">
            CGST {formatINR(Number(bill?.cgstAmount ?? 0))} · SGST{' '}
            {formatINR(Number(bill?.sgstAmount ?? 0))} · IGST {formatINR(Number(bill?.igstAmount ?? 0))}
          </p>
        </Card>
        <Card className="border-slate-200 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Grand total</p>
          <p className="mt-1 text-xl font-semibold">{formatINR(Number(bill?.totalAmount ?? 0))}</p>
          <p className="mt-1 text-xs text-slate-500">Paid {formatINR(Number(bill?.paidAmount ?? 0))}</p>
        </Card>
        <Card className="border-slate-200 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Balance / aging</p>
          <p className={cn('mt-1 text-xl font-semibold', due > 0.009 ? 'text-amber-900' : 'text-teal-800')}>
            {formatINR(due)}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {agingLabel(bill?.agingBucket)}
            {bill?.paymentTermsDays ? ` · ${bill.paymentTermsDays}d terms` : ''}
          </p>
        </Card>
      </div>

      <Card className="border-slate-200 p-4">
        <h2 className="text-base font-semibold text-slate-900">Bill header</h2>
        <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Supplier</dt>
            <dd className="mt-0.5 text-slate-900">
              {bill?.supplier ? (
                <Link href={`/dashboard/suppliers/${bill.supplier.id}`} className="text-teal-700 underline">
                  {bill.supplier.name}
                </Link>
              ) : (
                bill?.supplierName || '—'
              )}
            </dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">GSTIN</dt>
            <dd className="mt-0.5 font-mono text-slate-900">{bill?.gstin || bill?.supplier?.gstin || '—'}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Place of supply</dt>
            <dd className="mt-0.5 text-slate-900">{bill?.placeOfSupply || '—'}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">IRN</dt>
            <dd className="mt-0.5 break-all font-mono text-xs text-slate-900">{bill?.irn || '—'}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Created by</dt>
            <dd className="mt-0.5 text-slate-900">{bill?.createdBy?.name || '—'}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">Notes</dt>
            <dd className="mt-0.5 text-slate-900">{bill?.freeNotes || '—'}</dd>
          </div>
        </dl>
      </Card>

      <Card className="border-slate-200 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">Attached bill / scan</h2>
          <label className="cursor-pointer">
            <Button type="button" variant="secondary" disabled={uploading}>
              {uploading ? 'Uploading…' : 'Attach / replace bill image'}
            </Button>
            <input
              type="file"
              className="hidden"
              accept="image/*,.pdf"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void attachFile(f);
                e.target.value = '';
              }}
            />
          </label>
        </div>
        {bill?.billImagePath ? (
          <DocumentViewer
            path={bill.billImagePath}
            mimeType={bill.billImageMime}
            fileName={bill.billImageName || 'attached file'}
          />
        ) : (
          <p className="text-sm text-slate-500">No image yet — attach the supplier invoice photo/PDF here.</p>
        )}
      </Card>

      <Card className="border-slate-200 p-4">
        <h2 className="mb-3 text-lg font-semibold">Line items</h2>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className={tableHeaderClassName}>Product</th>
                <th className={tableHeaderClassName}>HSN</th>
                <th className={tableHeaderClassName}>GST%</th>
                <th className={tableHeaderClassName}>Qty</th>
                <th className={tableHeaderClassName}>Rate</th>
                <th className={tableHeaderClassName}>Line total</th>
              </tr>
            </thead>
            <tbody>
              {(bill?.lines || []).map((l) => (
                <tr key={l.id} className="border-t border-slate-100">
                  <td className={tableCellClassName}>
                    {l.productName}
                    <div className="text-xs text-slate-500">
                      {l.sku || '—'}
                      {l.product?.barcode ? ` · ${l.product.barcode}` : ''}
                    </div>
                  </td>
                  <td className={tableCellClassName}>{l.hsnCode || '—'}</td>
                  <td className={tableCellClassName}>
                    {l.gstRate != null ? `${Number(l.gstRate)}%` : '—'}
                  </td>
                  <td className={tableCellClassName}>{String(l.quantity)}</td>
                  <td className={tableCellClassName}>{formatINR(Number(l.unitCost))}</td>
                  <td className={tableCellClassName}>{formatINR(Number(l.lineTotal))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="border-slate-200 p-4">
          <h2 className="mb-3 text-lg font-semibold">Payments allocated</h2>
          {(bill?.allocations || []).length === 0 ? (
            <p className="text-sm text-slate-500">
              No payments yet.
              {bill?.supplier ? (
                <>
                  {' '}
                  <Link href={`/dashboard/suppliers/${bill.supplier.id}`} className="text-teal-700 underline">
                    Record payment on supplier
                  </Link>
                </>
              ) : null}
            </p>
          ) : (
            <ul className="space-y-2 text-sm">
              {(bill?.allocations || []).map((a) => (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2"
                >
                  <span>
                    {formatDate(a.payment?.paymentDate)} · {a.payment?.method || '—'}
                    {a.payment?.referenceNo ? ` · ${a.payment.referenceNo}` : ''}
                  </span>
                  <span className="font-semibold">{formatINR(Number(a.amount))}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="border-slate-200 p-4">
          <h2 className="mb-3 text-lg font-semibold">Ledger entries</h2>
          {(bill?.ledgerEntries || []).length === 0 ? (
            <p className="text-sm text-slate-500">No ledger rows linked to this bill.</p>
          ) : (
            <ul className="space-y-2 text-sm">
              {(bill?.ledgerEntries || []).map((e) => (
                <li
                  key={e.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2"
                >
                  <span>
                    {formatDate(e.entryDate)} · {e.type}
                    {e.notes ? ` · ${e.notes}` : ''}
                  </span>
                  <span className="font-semibold">
                    {formatINR(Number(e.amount))}
                    <span className="ml-2 text-xs font-normal text-slate-500">
                      bal {formatINR(Number(e.balanceAfter))}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
