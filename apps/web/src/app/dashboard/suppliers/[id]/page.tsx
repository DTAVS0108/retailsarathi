'use client';
import { AppLoader } from '@/app/_components/app-loader';
import { DocumentViewerLink } from '@/app/_components/document-viewer';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, formatINR } from '@retail-sarathi/ui';
import { apiWithAuth, getToken } from '@/lib/helpers';
import {
  pageShellClassName,
  MessageBanner,
  PageHeader,
  cn,
  inputClassName,
  parseError,
  selectClassName,
  tableCellClassName,
  tableHeaderClassName,
  textareaClassName,
  toNumber,
} from '../../_components/dashboard-ui';

const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? 'http://localhost:4000';

type OpenBill = {
  id: string;
  invoiceNumber: string;
  invoiceDate: string | null;
  dueDate?: string | null;
  totalAmount: number | string;
  paidAmount: number | string;
  dueAmount?: number;
  overdueDays?: number;
  agingBucket?: string;
  status: string;
  billImageName?: string | null;
  billImagePath?: string | null;
  billImageMime?: string | null;
  _count?: { lines: number };
};

type Detail = {
  supplier: {
    id: string;
    name: string;
    phone?: string | null;
    gstin?: string | null;
    address?: string | null;
    bankName?: string | null;
    bankAccount?: string | null;
    ifsc?: string | null;
    bankBranch?: string | null;
    outstandingBalance: number | string;
  };
  summary?: {
    pendingPayable: number;
    clearedPayments: number;
    totalBilled: number;
    openBillCount: number;
    paidBillCount: number;
    billCount: number;
    paymentCount: number;
    advanceBalance?: number;
  };
  bills: OpenBill[];
  payments: Array<{
    id: string;
    amount: number | string;
    tdsAmount?: number | string | null;
    method: string;
    status?: string;
    paymentDate: string;
    referenceNo?: string | null;
    notes?: string | null;
    attachmentName?: string | null;
    attachmentPath?: string | null;
    attachmentMime?: string | null;
    allocations: Array<{
      amount: number | string;
      billId?: string;
      bill: { id?: string; invoiceNumber: string; totalAmount?: number | string; paidAmount?: number | string };
    }>;
  }>;
  ledger: Array<{
    id: string;
    type: string;
    amount: number | string;
    balanceAfter: number | string;
    notes?: string | null;
    entryDate: string;
  }>;
  reminders?: Array<{
    id: string;
    createdAt?: string;
    sentAt?: string;
    channel: string;
    body?: string | null;
    waUrl?: string | null;
    notes?: string | null;
  }>;
};

function agingLabel(bucket?: string) {
  switch (bucket) {
    case 'CURRENT':
      return 'Not due';
    case 'DUE_0_30':
      return '1–30d';
    case 'DUE_31_60':
      return '31–60d';
    case 'DUE_61_90':
      return '61–90d';
    case 'DUE_90_PLUS':
      return '90d+';
    case 'PAID':
      return 'Settled';
    default:
      return '—';
  }
}

function agingTone(bucket?: string) {
  switch (bucket) {
    case 'DUE_90_PLUS':
      return 'bg-rose-100 text-rose-800';
    case 'DUE_61_90':
      return 'bg-amber-100 text-amber-900';
    case 'DUE_31_60':
      return 'bg-orange-50 text-orange-800';
    case 'DUE_0_30':
      return 'bg-yellow-50 text-yellow-900';
    case 'CURRENT':
      return 'bg-slate-100 text-slate-700';
    default:
      return 'bg-teal-50 text-teal-800';
  }
}

export default function SupplierDetailPage() {
  const params = useParams();
  const id = String(params.id || '');
  const [data, setData] = useState<Detail | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [saving, setSaving] = useState(false);
  const [pay, setPay] = useState({
    amount: '',
    tdsAmount: '',
    method: 'CHEQUE',
    paymentDate: new Date().toISOString().slice(0, 10),
    referenceNo: '',
    bankName: '',
    notes: '',
  });
  const [chequeFile, setChequeFile] = useState<File | null>(null);
  const [allocateMode, setAllocateMode] = useState<'fifo' | 'manual'>('manual');
  const [allocAmounts, setAllocAmounts] = useState<Record<string, string>>({});
  const [adj, setAdj] = useState({ type: 'DEBIT_NOTE' as 'DEBIT_NOTE' | 'CREDIT_NOTE', amount: '', notes: '' });
  const [adjSaving, setAdjSaving] = useState(false);
  const [applyingAdvance, setApplyingAdvance] = useState(false);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [paymentActions, setPaymentActions] = useState<Record<string, boolean>>({});
  const [reallocId, setReallocId] = useState<string | null>(null);
  const [reallocAmounts, setReallocAmounts] = useState<Record<string, string>>({});
  const [reallocSaving, setReallocSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      setError('');
      const detail = await apiWithAuth<Detail>(`/suppliers/${id}`);
      setData(detail);
      setPay((p) =>
        !p.bankName && detail.supplier.bankName
          ? { ...p, bankName: detail.supplier.bankName || '' }
          : p,
      );
    } catch (err) {
      setError(parseError(err));
    }
  }, [id]);

  useEffect(() => {
    if (id) void load();
  }, [id, load]);

  const openBills = useMemo(() => {
    return (data?.bills || []).filter((b) => {
      const due =
        b.dueAmount != null
          ? Number(b.dueAmount)
          : Math.max(0, Number(b.totalAmount) - Number(b.paidAmount));
      return due > 0.009 && b.status !== 'CANCELLED' && b.status !== 'PAID';
    });
  }, [data?.bills]);

  const allocTotal = useMemo(() => {
    return Object.values(allocAmounts).reduce((s, v) => s + (toNumber(v) || 0), 0);
  }, [allocAmounts]);

  function fillFullAmount(bill: OpenBill) {
    const due =
      bill.dueAmount != null
        ? Number(bill.dueAmount)
        : Math.max(0, Number(bill.totalAmount) - Number(bill.paidAmount));
    setAllocAmounts((prev) => ({ ...prev, [bill.id]: String(due) }));
  }

  async function submitPayment(e: React.FormEvent) {
    e.preventDefault();
    const amount = toNumber(pay.amount);
    if (!amount || amount <= 0) {
      setError('Enter a valid payment amount.');
      return;
    }
    if (allocateMode === 'manual') {
      if (allocTotal <= 0) {
        setError('Enter at least one bill allocation, or switch to FIFO.');
        return;
      }
      if (Math.abs(allocTotal - amount) > 0.05) {
        setError(
          `Allocation total ${formatINR(allocTotal)} must match payment ${formatINR(amount)} (±₹0.05).`,
        );
        return;
      }
    }
    try {
      setSaving(true);
      setError('');
      setSuccess('');
      const token = getToken();
      if (!token) throw new Error('Not signed in');
      const form = new FormData();
      form.append('supplierId', id);
      form.append('amount', String(amount));
      form.append('method', pay.method);
      form.append('paymentDate', pay.paymentDate);
      if (pay.referenceNo) form.append('referenceNo', pay.referenceNo);
      if (pay.bankName) form.append('bankName', pay.bankName);
      if (pay.notes) form.append('notes', pay.notes);
      if (chequeFile) form.append('file', chequeFile);
      if (pay.tdsAmount && toNumber(pay.tdsAmount) > 0) {
        form.append('tdsAmount', String(toNumber(pay.tdsAmount)));
      }
      if (allocateMode === 'manual') {
        const allocations = Object.entries(allocAmounts)
          .map(([billId, raw]) => ({ billId, amount: toNumber(raw) }))
          .filter((a) => a.amount > 0);
        form.append('allocationsJson', JSON.stringify(allocations));
      }
      const res = await fetch(`${API_ORIGIN}/api/v1/supplier-payments`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || res.statusText);
      }
      setSuccess(
        allocateMode === 'manual'
          ? 'Payment recorded against selected bills.'
          : 'Payment recorded and allocated FIFO to oldest open bills.',
      );
      setPay((p) => ({ ...p, amount: '', tdsAmount: '', referenceNo: '', notes: '' }));
      setAllocAmounts({});
      setChequeFile(null);
      await load();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setSaving(false);
    }
  }

  async function sendReminder() {
    if (!data) return;
    try {
      setSendingReminder(true);
      setError('');
      const res = await apiWithAuth<{ waUrl?: string | null }>(`/suppliers/${id}/reminders`, { method: 'POST' });
      if (res.waUrl) window.open(res.waUrl, '_blank', 'noopener,noreferrer');
      setSuccess('Reminder sent and logged.');
      await load();
    } catch (e) {
      setError(parseError(e));
    } finally {
      setSendingReminder(false);
    }
  }

  async function applyAdvance() {
    try {
      setApplyingAdvance(true);
      setError('');
      await apiWithAuth(`/suppliers/${id}/apply-advance`, { method: 'POST' });
      setSuccess('Advance applied to open bills.');
      await load();
    } catch (e) {
      setError(parseError(e));
    } finally {
      setApplyingAdvance(false);
    }
  }

  async function submitAdjustment(e: React.FormEvent) {
    e.preventDefault();
    const amount = toNumber(adj.amount);
    if (!amount || amount <= 0) {
      setError('Enter a valid adjustment amount.');
      return;
    }
    try {
      setAdjSaving(true);
      setError('');
      await apiWithAuth(`/suppliers/${id}/adjustments`, {
        method: 'POST',
        body: JSON.stringify({ type: adj.type, amount, notes: adj.notes.trim() || undefined }),
      });
      setAdj({ type: 'DEBIT_NOTE', amount: '', notes: '' });
      setSuccess('Adjustment posted to ledger.');
      await load();
    } catch (e) {
      setError(parseError(e));
    } finally {
      setAdjSaving(false);
    }
  }

  async function voidPayment(paymentId: string) {
    try {
      setPaymentActions((prev) => ({ ...prev, [paymentId]: true }));
      setError('');
      await apiWithAuth(`/supplier-payments/${paymentId}/void`, { method: 'POST' });
      setSuccess('Payment voided.');
      await load();
    } catch (e) {
      setError(parseError(e));
    } finally {
      setPaymentActions((prev) => ({ ...prev, [paymentId]: false }));
    }
  }

  async function bouncePayment(paymentId: string) {
    try {
      setPaymentActions((prev) => ({ ...prev, [paymentId]: true }));
      setError('');
      await apiWithAuth(`/supplier-payments/${paymentId}/bounce`, { method: 'POST' });
      setSuccess('Payment marked as bounced.');
      await load();
    } catch (e) {
      setError(parseError(e));
    } finally {
      setPaymentActions((prev) => ({ ...prev, [paymentId]: false }));
    }
  }

  async function openReceipt(paymentId: string) {
    try {
      const token = getToken();
      if (!token) throw new Error('Not signed in');
      const res = await fetch(`${API_ORIGIN}/api/v1/supplier-payments/${paymentId}/receipt`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error(res.statusText);
      const payload = (await res.json()) as { html?: string };
      if (!payload.html) throw new Error('Receipt HTML missing');
      const blob = new Blob([payload.html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      const win = window.open(url, '_blank', 'noopener,noreferrer');
      if (win) win.onload = () => URL.revokeObjectURL(url);
    } catch (e) {
      setError(parseError(e));
    }
  }

  function startReallocate(p: Detail['payments'][number]) {
    const next: Record<string, string> = {};
    for (const a of p.allocations) {
      const billId = a.billId || a.bill.id;
      if (billId) next[billId] = String(Number(a.amount));
    }
    for (const b of openBills) {
      if (next[b.id] == null) next[b.id] = '';
    }
    setReallocId(p.id);
    setReallocAmounts(next);
  }

  async function saveReallocate() {
    if (!reallocId) return;
    const allocations = Object.entries(reallocAmounts)
      .map(([billId, raw]) => ({ billId, amount: toNumber(raw) }))
      .filter((a) => a.amount > 0);
    try {
      setReallocSaving(true);
      setError('');
      await apiWithAuth(`/supplier-payments/${reallocId}/allocations`, {
        method: 'PATCH',
        body: JSON.stringify({ allocations }),
      });
      setReallocId(null);
      setReallocAmounts({});
      setSuccess('Payment allocations updated.');
      await load();
    } catch (e) {
      setError(parseError(e));
    } finally {
      setReallocSaving(false);
    }
  }

  async function sharePaymentWA(p: { id: string; amount: number | string; method: string; paymentDate: string }) {
    try {
      setPaymentActions((prev) => ({ ...prev, [p.id]: true }));
      const res = await apiWithAuth<{
        shareUrl?: string | null;
        mediaUrl?: string | null;
        sent?: boolean;
        note?: string;
      }>(`/supplier-payments/${p.id}/whatsapp`, { method: 'POST' });
      if (res.shareUrl) window.open(res.shareUrl, '_blank', 'noopener,noreferrer');
      setSuccess(
        res.sent
          ? 'Receipt sent on WhatsApp (with media when API configured).'
          : res.note || 'WhatsApp link opened — attach media from receipt if needed.',
      );
      if (res.mediaUrl) {
        // Also open HTML receipt for save/share
        window.open(res.mediaUrl, '_blank', 'noopener,noreferrer');
      }
      await load();
    } catch (e) {
      setError(parseError(e));
    } finally {
      setPaymentActions((prev) => ({ ...prev, [p.id]: false }));
    }
  }

  if (!data && !error) {
    return <AppLoader label="Loading supplier…" />;
  }

  const pending = Number(data?.summary?.pendingPayable ?? data?.supplier.outstandingBalance ?? 0);
  const cleared = Number(data?.summary?.clearedPayments ?? 0);
  const totalBilled = Number(data?.summary?.totalBilled ?? 0);

  return (
    <div className={pageShellClassName}>
      <PageHeader
        title={data?.supplier.name || 'Supplier'}
        description={`GSTIN ${data?.supplier.gstin || '—'} · ${data?.supplier.phone || 'No phone'}${
          data?.supplier.bankName ? ` · ${data.supplier.bankName}` : ''
        }${data?.supplier.ifsc ? ` · ${data.supplier.ifsc}` : ''}`}
        breadcrumbLabel={data?.supplier.name || 'Supplier'}
      />

      {error ? <MessageBanner tone="error">{error}</MessageBanner> : null}
      {success ? <MessageBanner tone="success">{success}</MessageBanner> : null}

      <div className="flex flex-wrap gap-2">
        <Link href={`/dashboard/reports?tab=supplier&supplierId=${id}`}>
          <Button type="button" variant="secondary">
            Statement PDF / Excel
          </Button>
        </Link>
        <Link href={`/dashboard/purchase-bills?supplierId=${id}&unpaidOnly=1`}>
          <Button type="button" variant="secondary">
            Unpaid bills
          </Button>
        </Link>
        <Button type="button" variant="secondary" disabled={sendingReminder} onClick={() => void sendReminder()}>
          {sendingReminder ? 'Sending…' : 'WhatsApp reminder'}
        </Button>
        <Link href="/dashboard/stock-in">
          <Button type="button" variant="secondary">
            Stock-in
          </Button>
        </Link>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="border-rose-200 bg-rose-50/30 p-4">
          <p className="text-xs font-medium text-slate-500">Pending payable</p>
          <p className="mt-1 text-xl font-semibold text-rose-700">{formatINR(pending)}</p>
        </Card>
        <Card className="border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-500">Cleared payments</p>
          <p className="mt-1 text-xl font-semibold text-teal-800">{formatINR(cleared)}</p>
          <p className="mt-1 text-xs text-slate-500">{data?.summary?.paymentCount ?? 0} payments</p>
        </Card>
        <Card className="border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-500">Total billed</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">{formatINR(totalBilled)}</p>
        </Card>
        <Card className="border-slate-200 p-4">
          <p className="text-xs font-medium text-slate-500">Bills</p>
          <p className="mt-1 text-xl font-semibold text-slate-900">
            {data?.summary?.openBillCount ?? 0} open
          </p>
          <p className="mt-1 text-xs text-slate-500">{data?.summary?.paidBillCount ?? 0} paid</p>
        </Card>
        {(data?.summary?.advanceBalance ?? 0) > 0 ? (
          <Card className="border-blue-100 bg-blue-50/40 p-4 sm:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-medium text-slate-500">Advance balance</p>
                <p className="mt-1 text-xl font-semibold text-blue-800">
                  {formatINR(data?.summary?.advanceBalance ?? 0)}
                </p>
                <p className="mt-1 text-xs text-slate-500">Apply to open bills</p>
              </div>
              <Button
                type="button"
                variant="secondary"
                disabled={applyingAdvance}
                onClick={() => void applyAdvance()}
              >
                {applyingAdvance ? 'Applying…' : 'Apply advance'}
              </Button>
            </div>
          </Card>
        ) : null}
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="border-slate-200 p-4 sm:p-5">
          <h2 className="mb-1 text-lg font-semibold text-slate-900">Record payment</h2>
          <p className="mb-4 text-xs text-slate-500">
            Pending bills only — pick which invoice this payment settles, or use FIFO for oldest first.
          </p>
          <form className="space-y-4" onSubmit={(e) => void submitPayment(e)}>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-1 text-xs font-medium text-slate-600">
                Amount *
                <input
                  className={inputClassName}
                  type="number"
                  step="0.01"
                  value={pay.amount}
                  onChange={(e) => setPay({ ...pay, amount: e.target.value })}
                />
              </label>
              <label className="space-y-1 text-xs font-medium text-slate-600">
                Method
                <select
                  className={selectClassName}
                  value={pay.method}
                  onChange={(e) => setPay({ ...pay, method: e.target.value })}
                >
                  <option value="CASH">Cash</option>
                  <option value="UPI">UPI</option>
                  <option value="NEFT">NEFT</option>
                  <option value="RTGS">RTGS</option>
                  <option value="CHEQUE">Cheque</option>
                  <option value="BANK_TRANSFER">Bank transfer</option>
                  <option value="OTHER">Other</option>
                </select>
              </label>
              <label className="space-y-1 text-xs font-medium text-slate-600">
                Date
                <input
                  className={inputClassName}
                  type="date"
                  value={pay.paymentDate}
                  onChange={(e) => setPay({ ...pay, paymentDate: e.target.value })}
                />
              </label>
              <label className="space-y-1 text-xs font-medium text-slate-600">
                Cheque / UTR no.
                <input
                  className={inputClassName}
                  value={pay.referenceNo}
                  onChange={(e) => setPay({ ...pay, referenceNo: e.target.value })}
                />
              </label>
              <label className="space-y-1 text-xs font-medium text-slate-600">
                TDS deducted
                <input
                  className={inputClassName}
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0"
                  value={pay.tdsAmount}
                  onChange={(e) => setPay({ ...pay, tdsAmount: e.target.value })}
                />
              </label>
              <label className="space-y-1 text-xs font-medium text-slate-600 sm:col-span-2">
                Bank
                <input
                  className={inputClassName}
                  value={pay.bankName}
                  onChange={(e) => setPay({ ...pay, bankName: e.target.value })}
                  placeholder={data?.supplier.bankName || 'Bank name'}
                />
              </label>
              <label className="space-y-1 text-xs font-medium text-slate-600 sm:col-span-2">
                Notes
                <textarea
                  className={textareaClassName}
                  value={pay.notes}
                  onChange={(e) => setPay({ ...pay, notes: e.target.value })}
                />
              </label>
              <label className="space-y-1 text-xs font-medium text-slate-600 sm:col-span-2">
                Attach cheque / receipt image
                <input
                  type="file"
                  accept="image/*,.pdf"
                  onChange={(e) => setChequeFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Pending bills ({openBills.length})
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={cn(
                      'rounded-lg border px-3 py-1.5 text-xs font-semibold',
                      allocateMode === 'manual' ? 'border-teal-500 bg-teal-50 text-teal-900' : 'border-slate-200 bg-white',
                    )}
                    onClick={() => setAllocateMode('manual')}
                  >
                    Pick bills
                  </button>
                  <button
                    type="button"
                    className={cn(
                      'rounded-lg border px-3 py-1.5 text-xs font-semibold',
                      allocateMode === 'fifo' ? 'border-teal-500 bg-teal-50 text-teal-900' : 'border-slate-200 bg-white',
                    )}
                    onClick={() => setAllocateMode('fifo')}
                  >
                    FIFO (oldest first)
                  </button>
                </div>
              </div>
              {!openBills.length ? (
                <p className="text-xs text-slate-500">No pending bills — nothing to settle.</p>
              ) : (
                <div className="space-y-2">
                  {allocateMode === 'fifo' ? (
                    <p className="text-xs text-slate-500">
                      Payment will clear these oldest-first until the amount is used up.
                    </p>
                  ) : (
                    <p className="text-xs text-slate-500">Enter how much of this payment goes to each bill.</p>
                  )}
                  <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                    <table className="min-w-full text-xs">
                      <thead className="bg-slate-50 text-left text-slate-500">
                        <tr>
                          <th className="px-2.5 py-2 font-semibold">Invoice</th>
                          <th className="px-2.5 py-2 font-semibold">Due date</th>
                          <th className="px-2.5 py-2 text-right font-semibold">Due ₹</th>
                          <th className="px-2.5 py-2 text-right font-semibold">
                            {allocateMode === 'manual' ? 'Allocate ₹' : 'Status'}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {openBills.map((b) => {
                          const due =
                            b.dueAmount != null
                              ? Number(b.dueAmount)
                              : Math.max(0, Number(b.totalAmount) - Number(b.paidAmount));
                          return (
                            <tr key={b.id} className="border-t border-slate-100">
                              <td className="px-2.5 py-2 font-semibold text-slate-800">
                                {b.invoiceNumber}
                              </td>
                              <td className="px-2.5 py-2 text-slate-500">
                                {b.dueDate ? new Date(b.dueDate).toLocaleDateString('en-IN') : '—'}
                              </td>
                              <td className="px-2.5 py-2 text-right tabular-nums text-rose-700">
                                {formatINR(due)}
                              </td>
                              <td className="px-2.5 py-2">
                                {allocateMode === 'manual' ? (
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      type="button"
                                      className="rounded border border-slate-200 px-1.5 py-0.5 font-medium text-teal-800"
                                      onClick={() => fillFullAmount(b)}
                                    >
                                      Full
                                    </button>
                                    <input
                                      className={`${inputClassName} !mt-0 h-8 w-24 py-1 text-right text-xs`}
                                      type="number"
                                      step="0.01"
                                      placeholder="0"
                                      value={allocAmounts[b.id] || ''}
                                      onChange={(e) =>
                                        setAllocAmounts((prev) => ({ ...prev, [b.id]: e.target.value }))
                                      }
                                    />
                                  </div>
                                ) : (
                                  <span className="float-right rounded bg-amber-50 px-2 py-0.5 font-semibold text-amber-800">
                                    Pending
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {allocateMode === 'manual' ? (
                    <p className="text-xs text-slate-600">
                      Allocated {formatINR(allocTotal)}
                      {pay.amount ? ` / payment ${formatINR(toNumber(pay.amount) || 0)}` : ''}
                    </p>
                  ) : null}
                </div>
              )}
            </div>

            <Button type="submit" disabled={saving || pending <= 0}>
              {saving ? 'Saving…' : 'Save payment'}
            </Button>
          </form>
        </Card>

        <div className="space-y-6">
          <Card className="border-slate-200 p-4 sm:p-5">
            <h2 className="mb-1 text-lg font-semibold text-slate-900">Post adjustment</h2>
            <p className="mb-4 text-xs text-slate-500">Debit note increases payable; credit note reduces it.</p>
            <form className="space-y-3" onSubmit={(e) => void submitAdjustment(e)}>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="space-y-1 text-xs font-medium text-slate-600">
                  Type
                  <select
                    className={selectClassName}
                    value={adj.type}
                    onChange={(e) => setAdj({ ...adj, type: e.target.value as 'DEBIT_NOTE' | 'CREDIT_NOTE' })}
                  >
                    <option value="DEBIT_NOTE">Debit note (↑ payable)</option>
                    <option value="CREDIT_NOTE">Credit note (↓ payable)</option>
                  </select>
                </label>
                <label className="space-y-1 text-xs font-medium text-slate-600">
                  Amount *
                  <input
                    className={inputClassName}
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={adj.amount}
                    onChange={(e) => setAdj({ ...adj, amount: e.target.value })}
                  />
                </label>
                <label className="space-y-1 text-xs font-medium text-slate-600">
                  Notes
                  <input
                    className={inputClassName}
                    value={adj.notes}
                    onChange={(e) => setAdj({ ...adj, notes: e.target.value })}
                    placeholder="e.g. rate diff, shortage"
                  />
                </label>
              </div>
              <Button type="submit" disabled={adjSaving}>
                {adjSaving ? 'Posting…' : 'Post adjustment'}
              </Button>
            </form>
          </Card>

          <Card className="border-slate-200 p-4">
            <h2 className="mb-3 text-lg font-semibold text-slate-900">Ledger</h2>
          {!data?.ledger.length ? (
            <p className="text-sm text-slate-500">No ledger entries yet. Stock-in with invoice # creates BILL rows.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50">
                  <tr>
                    <th className={tableHeaderClassName}>Date</th>
                    <th className={tableHeaderClassName}>Type</th>
                    <th className={tableHeaderClassName}>Amount</th>
                    <th className={tableHeaderClassName}>Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {data.ledger.map((row) => (
                    <tr key={row.id} className="border-t border-slate-100">
                      <td className={tableCellClassName}>
                        {new Date(row.entryDate).toLocaleDateString('en-IN')}
                        <div className="text-xs text-slate-500">{row.notes}</div>
                      </td>
                      <td className={tableCellClassName}>{row.type}</td>
                      <td className={tableCellClassName}>
                        {row.type === 'PAYMENT' ? '−' : '+'}
                        {formatINR(Number(row.amount))}
                      </td>
                      <td className={tableCellClassName}>{formatINR(Number(row.balanceAfter))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          </Card>
        </div>
      </div>

      <Card className="border-slate-200 p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold text-slate-900">Purchase bills</h2>
          <span className="text-xs text-slate-500">{openBills.length} with due balance</span>
        </div>
        {!data?.bills.length ? (
          <p className="text-sm text-slate-500">No bills. Confirm stock-in with the same invoice number to group products.</p>
        ) : (
          <div className="space-y-3">
            {data.bills.map((b) => {
              const due =
                b.dueAmount != null
                  ? Number(b.dueAmount)
                  : Math.max(0, Number(b.totalAmount) - Number(b.paidAmount));
              return (
                <div key={b.id} className="rounded-xl border border-slate-200 p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <Link
                          href={`/dashboard/purchase-bills/${b.id}`}
                          className="font-medium text-teal-700 underline"
                        >
                          Inv {b.invoiceNumber}
                        </Link>
                        <span className={cn('rounded-full px-2 py-0.5 text-[11px] font-semibold', agingTone(b.agingBucket))}>
                          {agingLabel(b.agingBucket)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-500">
                        {b._count?.lines ?? 0} products · {b.status} · due {formatINR(due)} · paid{' '}
                        {formatINR(Number(b.paidAmount))} / {formatINR(Number(b.totalAmount))}
                      </p>
                      <p className="text-xs text-slate-400">
                        Invoice{' '}
                        {b.invoiceDate ? new Date(b.invoiceDate).toLocaleDateString('en-IN') : '—'}
                        {b.dueDate ? ` · Due ${new Date(b.dueDate).toLocaleDateString('en-IN')}` : ''}
                        {b.overdueDays && b.overdueDays > 0 ? ` · ${b.overdueDays}d overdue` : ''}
                      </p>
                    </div>
                    {b.billImagePath ? (
                      <DocumentViewerLink
                        path={b.billImagePath}
                        mimeType={b.billImageMime}
                        fileName={b.billImageName || 'bill'}
                      >
                        View bill image
                      </DocumentViewerLink>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="border-slate-200 p-4 sm:p-5">
        <h2 className="mb-3 text-lg font-semibold text-slate-900">Cleared payments</h2>
        {!data?.payments.length ? (
          <p className="text-sm text-slate-500">No payments recorded.</p>
        ) : (
          <div className="space-y-3">
            {data.payments.map((p) => {
              const isPosted = !p.status || p.status === 'POSTED';
              const isBusy = paymentActions[p.id] ?? false;
              return (
                <div key={p.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">
                          {formatINR(Number(p.amount))} · {p.method} ·{' '}
                          {new Date(p.paymentDate).toLocaleDateString('en-IN')}
                        </p>
                        {p.status && p.status !== 'POSTED' ? (
                          <span
                            className={cn(
                              'rounded-full px-2 py-0.5 text-[11px] font-semibold',
                              p.status === 'VOID' ? 'bg-red-100 text-red-800' : 'bg-amber-100 text-amber-900',
                            )}
                          >
                            {p.status}
                          </span>
                        ) : null}
                        {p.tdsAmount && Number(p.tdsAmount) > 0 ? (
                          <span className="text-xs text-slate-500">TDS {formatINR(Number(p.tdsAmount))}</span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-slate-500">
                        {p.referenceNo ? `Ref ${p.referenceNo} · ` : ''}
                        {p.allocations.map((a) => `${a.bill.invoiceNumber} (${formatINR(Number(a.amount))})`).join(', ') ||
                          'Unallocated remainder'}
                      </p>
                      {p.attachmentPath ? (
                        <DocumentViewerLink
                          path={p.attachmentPath}
                          mimeType={p.attachmentMime}
                          fileName={p.attachmentName || 'attachment'}
                          className="mt-1 text-teal-700 underline"
                        />
                      ) : null}
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      <button
                        type="button"
                        className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-teal-700 hover:bg-slate-50"
                        onClick={() => void openReceipt(p.id)}
                      >
                        Receipt
                      </button>
                      <button
                        type="button"
                        className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-teal-700 hover:bg-slate-50"
                        onClick={() => void sharePaymentWA(p)}
                        disabled={isBusy}
                      >
                        WA media
                      </button>
                      {isPosted ? (
                        <>
                          <button
                            type="button"
                            disabled={isBusy}
                            className="rounded border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            onClick={() => startReallocate(p)}
                          >
                            Edit alloc
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            className="rounded border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                            onClick={() => void voidPayment(p.id)}
                          >
                            Void
                          </button>
                          {p.method === 'CHEQUE' ? (
                            <button
                              type="button"
                              disabled={isBusy}
                              className="rounded border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                              onClick={() => void bouncePayment(p.id)}
                            >
                              Bounce
                            </button>
                          ) : null}
                        </>
                      ) : null}
                    </div>
                  </div>
                  {reallocId === p.id ? (
                    <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
                      <p className="text-xs font-semibold text-slate-600">
                        Reallocate (budget {formatINR(Number(p.amount) + Number(p.tdsAmount || 0))})
                      </p>
                      {(openBills.length
                        ? openBills
                        : p.allocations.map((a) => ({
                            id: a.billId || a.bill.id || '',
                            invoiceNumber: a.bill.invoiceNumber,
                            dueAmount: Number(a.amount),
                          }))
                      ).map((b) => (
                        <label key={b.id} className="flex items-center gap-2 text-xs">
                          <span className="min-w-[8rem] font-medium text-slate-700">{b.invoiceNumber}</span>
                          <input
                            className={cn(inputClassName, 'max-w-[8rem]')}
                            type="number"
                            min="0"
                            step="0.01"
                            value={reallocAmounts[b.id] ?? ''}
                            onChange={(e) =>
                              setReallocAmounts((prev) => ({ ...prev, [b.id]: e.target.value }))
                            }
                            placeholder="0"
                          />
                        </label>
                      ))}
                      <div className="flex gap-2">
                        <Button type="button" size="sm" disabled={reallocSaving} onClick={() => void saveReallocate()}>
                          {reallocSaving ? 'Saving…' : 'Save allocations'}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            setReallocId(null);
                            setReallocAmounts({});
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {data?.reminders && data.reminders.length > 0 ? (
        <Card className="border-slate-200 p-4">
          <h2 className="mb-3 text-lg font-semibold text-slate-900">Reminder history</h2>
          <div className="space-y-2">
            {data.reminders.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-xs">
                <div>
                  <span className="font-medium text-slate-800">{r.channel}</span>
                  <span className="ml-2 text-slate-500">
                    {new Date(r.createdAt || r.sentAt || '').toLocaleDateString('en-IN')}
                  </span>
                  {r.body || r.notes ? (
                    <span className="ml-2 text-slate-500 line-clamp-1">{r.body || r.notes}</span>
                  ) : null}
                </div>
                {r.waUrl ? (
                  <a href={r.waUrl} target="_blank" rel="noopener noreferrer" className="font-medium text-teal-700 underline">
                    Open WA
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        </Card>
      ) : null}
    </div>
  );
}
