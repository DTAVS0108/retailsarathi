'use client';

import { AppLoader } from '@/app/_components/app-loader';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Button, Card, formatINR } from '@retail-sarathi/ui';
import { apiWithAuth } from '@/lib/helpers';
import {
  assertGstinOptional,
  assertIndianPhone,
  INDIAN_STATE_OPTIONS,
  normalizeGstin,
  parseAddressPayload,
  stateCodeFromGstin,
} from '@/lib/validators';
import {
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
} from '../../_components/dashboard-ui';

type Segment = 'RETAIL' | 'DEALER' | 'DISTRIBUTOR' | 'CORPORATE';

interface CustomerProfile {
  id: string;
  name: string;
  phone: string;
  email?: string | null;
  gstin?: string | null;
  address?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  pincode?: string | null;
  country?: string | null;
  stateCode?: string | null;
  segment: Segment;
  creditLimit: number;
  outstandingBalance: number;
  loyaltyPoints: number;
  whatsappOptIn?: boolean;
  tags?: string[];
}

interface AgingRow {
  customerId: string;
  outstanding: number;
  creditLimit: number;
  aging: { current: number; days30: number; days60: number; days90plus: number };
}

interface StatementInvoice {
  id: string;
  invoiceNumber: string;
  status: string;
  type?: string;
  grandTotal: number;
  createdAt: string;
  payments: Array<{ method: string; amount: number }>;
}

interface RepairJob {
  id: string;
  jobNumber: string;
  status: string;
  deviceModel?: string | null;
  issue?: string | null;
  createdAt: string;
  receivedAt?: string;
}

interface CustomerDevice {
  id: string;
  brand?: string | null;
  model: string;
  imei?: string | null;
  createdAt: string;
  repairJobs: Array<{ id: string; jobNumber: string; status: string; receivedAt: string }>;
}

interface LoyaltyTxn {
  id: string;
  points: number;
  type: string;
  createdAt: string;
  notes?: string | null;
}

interface OpenInvoice {
  id: string;
  invoiceNumber: string;
  createdAt: string;
  creditAmt: number;
  allocated: number;
  dueAmount: number;
}

interface LedgerEntry {
  id: string;
  type: string;
  amount: number;
  balanceAfter: number;
  entryDate: string;
  notes?: string | null;
  invoice?: { invoiceNumber: string } | null;
  payment?: { referenceNo?: string | null; method: string } | null;
}

interface CustomerPaymentRow {
  id: string;
  amount: number;
  method: string;
  status?: string;
  paymentDate: string;
  referenceNo?: string | null;
  notes?: string | null;
  allocations: Array<{ amount: number; invoiceId?: string }>;
}

type TabId = 'profile' | 'udhaar' | 'bills' | 'repairs';
type AllocateMode = 'fifo' | 'manual';

const SEGMENTS: Segment[] = ['RETAIL', 'DEALER', 'DISTRIBUTOR', 'CORPORATE'];
const PAYMENT_METHODS = ['CASH', 'UPI', 'CARD', 'CHEQUE', 'BANK_TRANSFER'] as const;

const EMPTY_FORM = {
  name: '',
  phone: '',
  email: '',
  gstin: '',
  address: '',
  addressLine2: '',
  city: '',
  pincode: '',
  country: 'IN',
  stateCode: '',
  segment: 'RETAIL' as Segment,
  creditLimit: '0',
  whatsappOptIn: false,
};

function callLink(phone: string) {
  const digits = phone.replace(/\D/g, '');
  return digits ? `tel:+91${digits.slice(-10)}` : null;
}

export default function CustomerDetailPage() {
  const params = useParams();
  const customerId = String(params.id ?? '');

  const [tab, setTab] = useState<TabId>('profile');
  const [customer, setCustomer] = useState<CustomerProfile | null>(null);
  const [invoices, setInvoices] = useState<StatementInvoice[]>([]);
  const [openInvoices, setOpenInvoices] = useState<OpenInvoice[]>([]);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [payments, setPayments] = useState<CustomerPaymentRow[]>([]);
  const [repairs, setRepairs] = useState<RepairJob[]>([]);
  const [devices, setDevices] = useState<CustomerDevice[]>([]);
  const [loyalty, setLoyalty] = useState<LoyaltyTxn[]>([]);
  const [aging, setAging] = useState<AgingRow | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editing, setEditing] = useState(false);
  const [collectAmount, setCollectAmount] = useState('');
  const [collectMethod, setCollectMethod] = useState<(typeof PAYMENT_METHODS)[number]>('CASH');
  const [collectRef, setCollectRef] = useState('');
  const [collectNotes, setCollectNotes] = useState('');
  const [allocateMode, setAllocateMode] = useState<AllocateMode>('manual');
  const [allocAmounts, setAllocAmounts] = useState<Record<string, string>>({});
  const [waReminding, setWaReminding] = useState(false);
  const [redeemPts, setRedeemPts] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  function syncForm(c: CustomerProfile) {
    setForm({
      name: c.name,
      phone: c.phone,
      email: c.email ?? '',
      gstin: c.gstin ?? '',
      address: c.address ?? '',
      addressLine2: c.addressLine2 ?? '',
      city: c.city ?? '',
      pincode: c.pincode ?? '',
      country: c.country ?? 'IN',
      stateCode: c.stateCode ?? stateCodeFromGstin(c.gstin) ?? '',
      segment: c.segment,
      creditLimit: String(toNumber(c.creditLimit)),
      whatsappOptIn: Boolean(c.whatsappOptIn),
    });
  }

  async function load() {
    try {
      setError('');
      const [detail, stmt, agingReport, openInv, deviceList] = await Promise.all([
        apiWithAuth<
          CustomerProfile & {
            invoices?: StatementInvoice[];
            repairJobs?: RepairJob[];
            loyaltyTransactions?: LoyaltyTxn[];
          }
        >(`/customers/${customerId}`),
        apiWithAuth<{
          customer: CustomerProfile;
          invoices: StatementInvoice[];
          ledger?: LedgerEntry[];
          payments?: CustomerPaymentRow[];
        }>(`/customers/${customerId}/statement`),
        apiWithAuth<AgingRow[]>(`/customers/aging/report?customerId=${customerId}`),
        apiWithAuth<OpenInvoice[]>(`/customers/${customerId}/open-invoices`),
        apiWithAuth<CustomerDevice[]>(`/customers/${customerId}/devices`),
      ]);

      const profile = stmt.customer ?? detail;
      setCustomer(profile);
      syncForm(profile);
      setInvoices(stmt.invoices ?? detail.invoices ?? []);
      setLedger(stmt.ledger ?? []);
      setPayments(stmt.payments ?? []);
      setOpenInvoices(openInv ?? []);
      setRepairs(detail.repairJobs ?? []);
      setDevices(deviceList ?? []);
      setLoyalty(detail.loyaltyTransactions ?? []);
      setAging(agingReport[0] ?? null);
    } catch (e) {
      setError(parseError(e));
      setCustomer(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (customerId) void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

  const atRisk = useMemo(() => {
    if (!customer) return false;
    const limit = toNumber(customer.creditLimit);
    return limit > 0 && toNumber(customer.outstandingBalance) > limit;
  }, [customer]);

  const creditLeft = useMemo(() => {
    if (!customer) return 0;
    const limit = toNumber(customer.creditLimit);
    if (limit <= 0) return null;
    return Math.max(0, limit - toNumber(customer.outstandingBalance));
  }, [customer]);

  const allocTotal = useMemo(
    () => Object.values(allocAmounts).reduce((s, v) => s + (toNumber(v) || 0), 0),
    [allocAmounts],
  );

  function fillFullInvoiceAmount(inv: OpenInvoice) {
    setAllocAmounts((prev) => ({ ...prev, [inv.id]: String(toNumber(inv.dueAmount)) }));
  }

  async function sendCustomerReminder() {
    try {
      setWaReminding(true);
      setError('');
      const res = await apiWithAuth<{ waUrl?: string | null }>(`/customers/${customerId}/reminders`, {
        method: 'POST',
      });
      if (res.waUrl) window.open(res.waUrl, '_blank', 'noopener,noreferrer');
      setSuccess('Reminder sent.');
    } catch (e) {
      setError(parseError(e));
    } finally {
      setWaReminding(false);
    }
  }

  async function sendStatementMedia() {
    try {
      setWaReminding(true);
      setError('');
      const res = await apiWithAuth<{
        shareUrl?: string | null;
        mediaUrl?: string | null;
        sent?: boolean;
        note?: string;
      }>(`/customers/${customerId}/whatsapp-statement`, { method: 'POST' });
      if (res.shareUrl) window.open(res.shareUrl, '_blank', 'noopener,noreferrer');
      if (res.mediaUrl) window.open(res.mediaUrl, '_blank', 'noopener,noreferrer');
      setSuccess(
        res.sent
          ? 'Statement sent on WhatsApp with media.'
          : res.note || 'WhatsApp link opened; statement HTML ready to attach.',
      );
    } catch (e) {
      setError(parseError(e));
    } finally {
      setWaReminding(false);
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    try {
      if (!form.name.trim()) throw new Error('Customer name is required.');
      const phone = assertIndianPhone(form.phone, true)!;
      const gstin = assertGstinOptional(form.gstin);
      const addr = parseAddressPayload({
        address: form.address,
        addressLine2: form.addressLine2,
        city: form.city,
        stateCode: form.stateCode || stateCodeFromGstin(gstin),
        pincode: form.pincode,
        country: form.country || 'IN',
      });
      if (toNumber(form.creditLimit) < 0) throw new Error('Credit limit cannot be negative.');

      setSaving(true);
      setError('');
      setSuccess('');
      const updated = await apiWithAuth<CustomerProfile>(`/customers/${customerId}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: form.name.trim(),
          phone,
          email: form.email.trim() || null,
          gstin: gstin ?? null,
          address: addr.address,
          addressLine2: addr.addressLine2,
          city: addr.city,
          pincode: addr.pincode,
          country: addr.country,
          stateCode: addr.stateCode || stateCodeFromGstin(gstin),
          segment: form.segment,
          creditLimit: toNumber(form.creditLimit),
          whatsappOptIn: form.whatsappOptIn,
        }),
      });
      setCustomer((prev) => ({ ...prev!, ...updated }));
      syncForm({ ...customer!, ...updated });
      setEditing(false);
      setSuccess('Customer details saved.');
      await load();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setSaving(false);
    }
  }

  async function voidCollection(paymentId: string) {
    if (!window.confirm('Void this collection? Open invoices will be reopened.')) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      await apiWithAuth(`/customers/payments/${paymentId}/void`, {
        method: 'POST',
        body: JSON.stringify({ reason: 'Voided from customer detail' }),
      });
      setSuccess('Collection voided.');
      await load();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleCollect(e: React.FormEvent) {
    e.preventDefault();
    const amount = toNumber(collectAmount);
    if (amount <= 0) {
      setError('Enter a positive collection amount.');
      return;
    }
    if (allocateMode === 'manual') {
      if (allocTotal <= 0) {
        setError('Enter at least one invoice allocation, or switch to FIFO.');
        return;
      }
      if (Math.abs(allocTotal - amount) > 0.05) {
        setError(
          `Allocation total ${formatINR(allocTotal)} must match collection ${formatINR(amount)} (±₹0.05).`,
        );
        return;
      }
    }
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const body: Record<string, unknown> = {
        amount,
        method: collectMethod,
        reference: collectRef.trim() || undefined,
        notes: collectNotes.trim() || undefined,
      };
      if (allocateMode === 'manual') {
        const allocations = Object.entries(allocAmounts)
          .map(([invoiceId, raw]) => ({ invoiceId, amount: toNumber(raw) }))
          .filter((a) => a.amount > 0);
        body.allocationsJson = JSON.stringify(allocations);
      }
      await apiWithAuth(`/customers/${customerId}/collect`, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setCollectAmount('');
      setCollectRef('');
      setCollectNotes('');
      setAllocAmounts({});
      setSuccess(
        allocateMode === 'manual'
          ? `Collected ${formatINR(amount)} against selected invoices.`
          : `Collected ${formatINR(amount)} (FIFO).`,
      );
      await load();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleRedeem() {
    const points = toNumber(redeemPts);
    if (points <= 0) {
      setError('Enter loyalty points to redeem.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await apiWithAuth(`/customers/${customerId}/loyalty/redeem`, {
        method: 'POST',
        body: JSON.stringify({ points }),
      });
      setRedeemPts('');
      setSuccess(`Redeemed ${points} loyalty points.`);
      await load();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <AppLoader label="Loading customer…" />;
  }

  if (!customer) {
    return (
      <div className="space-y-4 p-6 lg:p-8">
        <MessageBanner tone="error">{error || 'Customer not found.'}</MessageBanner>
        <Link href="/dashboard/customers" className="text-sm text-brand hover:underline">
          ← Back to customers
        </Link>
      </div>
    );
  }

  const phoneCall = callLink(customer.phone);
  const canWhatsApp =
    customer.phone.replace(/\D/g, '').slice(-10).length === 10 && Boolean(customer.whatsappOptIn);

  const tabs: Array<{ id: TabId; label: string }> = [
    { id: 'profile', label: 'Profile' },
    { id: 'udhaar', label: 'Udhaar' },
    { id: 'bills', label: `Bills (${invoices.length})` },
    { id: 'repairs', label: `Repairs (${repairs.length})` },
  ];

  return (
    <div className="space-y-5 p-4 pb-28 sm:p-6 lg:p-8 lg:pb-8">
      <PageHeader
        title={customer.name}
        description={`${customer.phone}${customer.gstin ? ` · ${customer.gstin}` : ''}`}
        breadcrumbLabel={customer.name}
        actions={
          <div className="flex flex-wrap gap-2">
            {!editing ? (
              <Button type="button" size="sm" onClick={() => setEditing(true)}>
                Edit
              </Button>
            ) : null}
          </div>
        }
      />

      {error ? <MessageBanner tone="error">{error}</MessageBanner> : null}
      {success ? <MessageBanner tone="success">{success}</MessageBanner> : null}

      {/* Summary strip */}
      <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <Card className={cn('border-slate-200', atRisk && 'border-red-200 bg-red-50/50')}>
          <p className="text-xs text-slate-500">Outstanding</p>
          <p className={cn('mt-1 text-xl font-semibold sm:text-2xl', atRisk ? 'text-red-700' : 'text-amber-700')}>
            {formatINR(toNumber(customer.outstandingBalance))}
          </p>
          {atRisk ? <p className="mt-1 text-[11px] text-red-600">Over credit limit</p> : null}
        </Card>
        <Card className="border-slate-200">
          <p className="text-xs text-slate-500">Credit left</p>
          <p className="mt-1 text-xl font-semibold sm:text-2xl">
            {creditLeft == null ? 'No limit' : formatINR(creditLeft)}
          </p>
        </Card>
        <Card className="border-slate-200">
          <p className="text-xs text-slate-500">Loyalty</p>
          <p className="mt-1 text-xl font-semibold sm:text-2xl">{toNumber(customer.loyaltyPoints)} pts</p>
        </Card>
        <Card className="border-slate-200">
          <p className="text-xs text-slate-500">Segment</p>
          <p className="mt-2">
            <StatusBadge status={customer.segment} />
          </p>
        </Card>
      </section>

      {/* Quick actions — mobile sticky bar mirrors these */}
      <div className="hidden flex-wrap gap-2 sm:flex">
        {phoneCall ? (
          <a href={phoneCall}>
            <Button type="button" variant="secondary" size="sm">
              Call
            </Button>
          </a>
        ) : null}
        {canWhatsApp ? (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            disabled={waReminding}
            onClick={() => void sendCustomerReminder()}
          >
            {waReminding ? 'Sending…' : 'WhatsApp reminder'}
          </Button>
        ) : null}
        <Button type="button" size="sm" variant="secondary" onClick={() => setTab('udhaar')}>
          Collect udhaar
        </Button>
        <Link href={`/dashboard/pos`}>
          <Button type="button" size="sm">
            New bill
          </Button>
        </Link>
      </div>

      {/* Tabs */}
      <div className="-mx-4 flex gap-1 overflow-x-auto border-b border-slate-200 px-4 sm:mx-0 sm:px-0">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              'shrink-0 border-b-2 px-3 py-2.5 text-sm font-medium transition',
              tab === t.id
                ? 'border-brand text-brand'
                : 'border-transparent text-slate-500 hover:text-slate-800',
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'profile' ? (
        <Card className="border-slate-200">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">Customer details</h2>
              <p className="text-sm text-slate-500">
                {editing ? 'Update and save changes.' : 'Tap Edit to change profile, address, or credit.'}
              </p>
            </div>
            {!editing ? (
              <Button type="button" size="sm" onClick={() => setEditing(true)}>
                Edit
              </Button>
            ) : null}
          </div>

          <form className="space-y-4" onSubmit={handleSaveProfile}>
            <fieldset disabled={!editing} className="grid gap-4 sm:grid-cols-2 disabled:opacity-90">
              <label className="space-y-1.5 text-sm font-medium text-slate-700">
                <span>Name</span>
                <input
                  className={inputClassName}
                  value={form.name}
                  onChange={(e) => setForm((c) => ({ ...c, name: e.target.value }))}
                  required
                />
              </label>
              <label className="space-y-1.5 text-sm font-medium text-slate-700">
                <span>Phone</span>
                <input
                  className={inputClassName}
                  value={form.phone}
                  onChange={(e) => setForm((c) => ({ ...c, phone: e.target.value }))}
                  inputMode="tel"
                  required
                />
              </label>
              <label className="space-y-1.5 text-sm font-medium text-slate-700">
                <span>Email</span>
                <input
                  className={inputClassName}
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((c) => ({ ...c, email: e.target.value }))}
                />
              </label>
              <label className="space-y-1.5 text-sm font-medium text-slate-700">
                <span>GSTIN</span>
                <input
                  className={inputClassName}
                  value={form.gstin}
                  maxLength={15}
                  onChange={(e) => {
                    const gstin = normalizeGstin(e.target.value);
                    const stateCode = stateCodeFromGstin(gstin);
                    setForm((c) => ({ ...c, gstin, ...(stateCode ? { stateCode } : {}) }));
                  }}
                />
              </label>
              <label className="space-y-1.5 text-sm font-medium text-slate-700 sm:col-span-2">
                <span>Address line 1</span>
                <input
                  className={inputClassName}
                  value={form.address}
                  onChange={(e) => setForm((c) => ({ ...c, address: e.target.value }))}
                />
              </label>
              <label className="space-y-1.5 text-sm font-medium text-slate-700 sm:col-span-2">
                <span>Address line 2</span>
                <input
                  className={inputClassName}
                  value={form.addressLine2}
                  onChange={(e) => setForm((c) => ({ ...c, addressLine2: e.target.value }))}
                />
              </label>
              <label className="space-y-1.5 text-sm font-medium text-slate-700">
                <span>City</span>
                <input
                  className={inputClassName}
                  value={form.city}
                  onChange={(e) => setForm((c) => ({ ...c, city: e.target.value }))}
                />
              </label>
              <label className="space-y-1.5 text-sm font-medium text-slate-700">
                <span>State</span>
                <select
                  className={selectClassName}
                  value={form.stateCode}
                  onChange={(e) => setForm((c) => ({ ...c, stateCode: e.target.value }))}
                >
                  <option value="">Select state</option>
                  {INDIAN_STATE_OPTIONS.map((s) => (
                    <option key={s.code} value={s.code}>
                      {s.name} ({s.code})
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5 text-sm font-medium text-slate-700">
                <span>PIN code</span>
                <input
                  className={inputClassName}
                  value={form.pincode}
                  maxLength={6}
                  inputMode="numeric"
                  onChange={(e) =>
                    setForm((c) => ({ ...c, pincode: e.target.value.replace(/\D/g, '').slice(0, 6) }))
                  }
                />
              </label>
              <label className="space-y-1.5 text-sm font-medium text-slate-700">
                <span>Segment</span>
                <select
                  className={selectClassName}
                  value={form.segment}
                  onChange={(e) => setForm((c) => ({ ...c, segment: e.target.value as Segment }))}
                >
                  {SEGMENTS.map((s) => (
                    <option key={s} value={s}>
                      {s.replace('_', ' ')}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1.5 text-sm font-medium text-slate-700">
                <span>Credit limit (0 = none)</span>
                <input
                  className={inputClassName}
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.creditLimit}
                  onChange={(e) => setForm((c) => ({ ...c, creditLimit: e.target.value }))}
                />
              </label>
              <label className="flex items-center gap-2 text-sm font-medium text-slate-700 sm:col-span-2">
                <input
                  type="checkbox"
                  checked={form.whatsappOptIn}
                  onChange={(e) => setForm((c) => ({ ...c, whatsappOptIn: e.target.checked }))}
                />
                WhatsApp bill opt-in
              </label>
            </fieldset>

            {editing ? (
              <div className="flex flex-wrap gap-2 pt-1">
                <Button type="submit" disabled={saving}>
                  {saving ? 'Saving…' : 'Save changes'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  disabled={saving}
                  onClick={() => {
                    syncForm(customer);
                    setEditing(false);
                  }}
                >
                  Cancel
                </Button>
              </div>
            ) : null}
          </form>

          <div className="mt-6 border-t border-slate-100 pt-4">
            <h3 className="text-sm font-semibold text-slate-900">Loyalty</h3>
            <p className="mt-1 text-sm text-slate-500">{toNumber(customer.loyaltyPoints)} points available</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <input
                className={`${inputClassName} max-w-[8rem]`}
                type="number"
                min="1"
                placeholder="Points"
                value={redeemPts}
                onChange={(e) => setRedeemPts(e.target.value)}
              />
              <Button type="button" variant="secondary" size="sm" disabled={saving} onClick={() => void handleRedeem()}>
                Redeem
              </Button>
            </div>
            {loyalty.length ? (
              <ul className="mt-4 max-h-40 space-y-2 overflow-y-auto text-sm">
                {loyalty.slice(0, 8).map((t) => (
                  <li key={t.id} className="flex justify-between gap-2 text-slate-600">
                    <span>
                      {t.type} · {formatDate(t.createdAt)}
                    </span>
                    <span className="font-medium">{t.points > 0 ? `+${t.points}` : t.points}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </Card>
      ) : null}

      {tab === 'udhaar' ? (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <Link href={`/dashboard/reports?tab=customer&customerId=${customerId}`}>
              <Button type="button" variant="secondary" size="sm">
                Statement PDF / Excel
              </Button>
            </Link>
            {canWhatsApp ? (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={waReminding}
                  onClick={() => void sendCustomerReminder()}
                >
                  {waReminding ? 'Sending…' : 'WhatsApp reminder'}
                </Button>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  disabled={waReminding}
                  onClick={() => void sendStatementMedia()}
                >
                  WA statement + media
                </Button>
              </>
            ) : null}
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {aging ? (
              <Card className="border-slate-200">
                <h2 className="mb-3 text-lg font-semibold">Aging</h2>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl border border-slate-200 px-3 py-2">
                    <p className="text-xs text-slate-500">0–30 days</p>
                    <p className="font-semibold">{formatINR(toNumber(aging.aging.current))}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 px-3 py-2">
                    <p className="text-xs text-slate-500">31–60 days</p>
                    <p className="font-semibold">{formatINR(toNumber(aging.aging.days30))}</p>
                  </div>
                  <div className="rounded-xl border border-slate-200 px-3 py-2">
                    <p className="text-xs text-slate-500">61–90 days</p>
                    <p className="font-semibold">{formatINR(toNumber(aging.aging.days60))}</p>
                  </div>
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2">
                    <p className="text-xs text-amber-700">90+ days</p>
                    <p className="font-semibold text-amber-800">
                      {formatINR(toNumber(aging.aging.days90plus))}
                    </p>
                  </div>
                </div>
              </Card>
            ) : (
              <Card className="border-slate-200">
                <h2 className="text-lg font-semibold">Aging</h2>
                <p className="mt-2 text-sm text-slate-500">No outstanding udhaar.</p>
              </Card>
            )}

            <Card className="border-slate-200">
              <h2 className="mb-1 text-lg font-semibold">Collect payment</h2>
              <p className="mb-3 text-xs text-slate-500">
                Pending invoices only — pick which bill this collection settles, or use FIFO for oldest first.
              </p>
              <form className="space-y-3" onSubmit={handleCollect}>
                <input
                  className={inputClassName}
                  type="number"
                  min="0.01"
                  step="0.01"
                  placeholder="Amount"
                  value={collectAmount}
                  onChange={(e) => setCollectAmount(e.target.value)}
                  required
                />
                <select
                  className={selectClassName}
                  value={collectMethod}
                  onChange={(e) => setCollectMethod(e.target.value as typeof collectMethod)}
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {m.replace('_', ' ')}
                    </option>
                  ))}
                </select>
                <input
                  className={inputClassName}
                  placeholder="Reference (optional)"
                  value={collectRef}
                  onChange={(e) => setCollectRef(e.target.value)}
                />
                <input
                  className={inputClassName}
                  placeholder="Notes (optional)"
                  value={collectNotes}
                  onChange={(e) => setCollectNotes(e.target.value)}
                />

                <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3">
                  <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Pending invoices ({openInvoices.length})
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={cn(
                          'rounded-lg border px-3 py-1.5 text-xs font-semibold',
                          allocateMode === 'manual'
                            ? 'border-brand bg-brand/10 text-brand'
                            : 'border-slate-200 bg-white',
                        )}
                        onClick={() => setAllocateMode('manual')}
                      >
                        Pick invoices
                      </button>
                      <button
                        type="button"
                        className={cn(
                          'rounded-lg border px-3 py-1.5 text-xs font-semibold',
                          allocateMode === 'fifo'
                            ? 'border-brand bg-brand/10 text-brand'
                            : 'border-slate-200 bg-white',
                        )}
                        onClick={() => setAllocateMode('fifo')}
                      >
                        FIFO (oldest first)
                      </button>
                    </div>
                  </div>
                  {!openInvoices.length ? (
                    <p className="text-xs text-slate-500">No pending invoices — nothing to collect.</p>
                  ) : (
                    <div className="space-y-2">
                      {allocateMode === 'fifo' ? (
                        <p className="text-xs text-slate-500">
                          Collection will clear these oldest-first until the amount is used up.
                        </p>
                      ) : (
                        <p className="text-xs text-slate-500">Enter how much of this collection goes to each invoice.</p>
                      )}
                      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                        <table className="min-w-full text-xs">
                          <thead className="bg-slate-50 text-left text-slate-500">
                            <tr>
                              <th className="px-2.5 py-2 font-semibold">Invoice</th>
                              <th className="px-2.5 py-2 font-semibold">Date</th>
                              <th className="px-2.5 py-2 text-right font-semibold">Due ₹</th>
                              <th className="px-2.5 py-2 text-right font-semibold">
                                {allocateMode === 'manual' ? 'Allocate ₹' : 'Status'}
                              </th>
                            </tr>
                          </thead>
                          <tbody>
                            {openInvoices.map((inv) => (
                              <tr key={inv.id} className="border-t border-slate-100">
                                <td className="px-2.5 py-2 font-semibold text-slate-800">
                                  {inv.invoiceNumber}
                                </td>
                                <td className="px-2.5 py-2 text-slate-500">{formatDate(inv.createdAt)}</td>
                                <td className="px-2.5 py-2 text-right tabular-nums text-rose-700">
                                  {formatINR(toNumber(inv.dueAmount))}
                                </td>
                                <td className="px-2.5 py-2">
                                  {allocateMode === 'manual' ? (
                                    <div className="flex items-center justify-end gap-1.5">
                                      <button
                                        type="button"
                                        className="rounded border border-slate-200 px-1.5 py-0.5 font-medium text-brand"
                                        onClick={() => fillFullInvoiceAmount(inv)}
                                      >
                                        Full
                                      </button>
                                      <input
                                        className={`${inputClassName} !mt-0 h-8 w-24 py-1 text-right text-xs`}
                                        type="number"
                                        step="0.01"
                                        placeholder="0"
                                        value={allocAmounts[inv.id] || ''}
                                        onChange={(e) =>
                                          setAllocAmounts((prev) => ({ ...prev, [inv.id]: e.target.value }))
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
                            ))}
                          </tbody>
                        </table>
                      </div>
                      {allocateMode === 'manual' ? (
                        <p className="text-xs text-slate-600">
                          Allocated {formatINR(allocTotal)}
                          {collectAmount ? ` / collection ${formatINR(toNumber(collectAmount) || 0)}` : ''}
                        </p>
                      ) : null}
                    </div>
                  )}
                </div>

                <Button type="submit" disabled={saving || toNumber(customer.outstandingBalance) <= 0}>
                  {saving ? 'Collecting…' : 'Record collection'}
                </Button>
              </form>
            </Card>
          </div>

          <Card className="border-slate-200">
            <h2 className="mb-3 text-lg font-semibold">Khata ledger</h2>
            {!ledger.length ? (
              <p className="text-sm text-slate-500">No ledger entries yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className={tableHeaderClassName}>Date</th>
                      <th className={tableHeaderClassName}>Type</th>
                      <th className={tableHeaderClassName}>Amount</th>
                      <th className={tableHeaderClassName}>Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ledger.map((row) => (
                      <tr key={row.id} className="border-t border-slate-100">
                        <td className={tableCellClassName}>
                          {formatDate(row.entryDate)}
                          {row.notes || row.invoice?.invoiceNumber ? (
                            <div className="text-xs text-slate-500">
                              {row.invoice?.invoiceNumber ? `Inv ${row.invoice.invoiceNumber}` : null}
                              {row.notes ? (row.invoice?.invoiceNumber ? ` · ${row.notes}` : row.notes) : null}
                            </div>
                          ) : null}
                        </td>
                        <td className={tableCellClassName}>{row.type.replace('_', ' ')}</td>
                        <td className={tableCellClassName}>
                          {row.type === 'COLLECTION' || row.type === 'CREDIT_NOTE' ? '−' : '+'}
                          {formatINR(toNumber(row.amount))}
                        </td>
                        <td className={tableCellClassName}>{formatINR(toNumber(row.balanceAfter))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card className="border-slate-200">
            <h2 className="mb-3 text-lg font-semibold">Collections</h2>
            {!payments.length ? (
              <p className="text-sm text-slate-500">No collections recorded.</p>
            ) : (
              <ul className="space-y-3">
                {payments.map((p) => (
                  <li key={p.id} className="rounded-xl border border-slate-200 p-3 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">
                        {formatINR(toNumber(p.amount))} · {p.method.replace('_', ' ')} ·{' '}
                        {formatDate(p.paymentDate)}
                      </p>
                      {p.status && p.status !== 'POSTED' ? (
                        <StatusBadge status={p.status} />
                      ) : null}
                    </div>
                    <p className="mt-1 text-slate-500">
                      {p.referenceNo ? `Ref ${p.referenceNo} · ` : ''}
                      {p.allocations.length
                        ? p.allocations
                            .map((a) => {
                              const invNum =
                                invoices.find((i) => i.id === a.invoiceId)?.invoiceNumber ??
                                openInvoices.find((i) => i.id === a.invoiceId)?.invoiceNumber;
                              return invNum
                                ? `${invNum} (${formatINR(toNumber(a.amount))})`
                                : formatINR(toNumber(a.amount));
                            })
                            .join(', ')
                        : 'Unallocated remainder'}
                    </p>
                    {(!p.status || p.status === 'POSTED') ? (
                      <button
                        type="button"
                        disabled={saving}
                        className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
                        onClick={() => void voidCollection(p.id)}
                      >
                        Void collection
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      ) : null}

      {tab === 'bills' ? (
        <Card className="border-slate-200">
          <h2 className="mb-3 text-lg font-semibold">Bills & statements</h2>
          {!invoices.length ? (
            <p className="py-8 text-center text-sm text-slate-500">No bills yet for this customer.</p>
          ) : (
            <>
              {/* Mobile cards */}
              <ul className="space-y-3 md:hidden">
                {invoices.map((inv) => (
                  <li key={inv.id}>
                    <Link
                      href={`/dashboard/invoices/${inv.id}`}
                      className="block rounded-xl border border-slate-200 bg-white p-3 active:bg-slate-50"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="font-semibold text-slate-900">{inv.invoiceNumber}</p>
                          <p className="mt-0.5 text-xs text-slate-500">{formatDate(inv.createdAt)}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold">{formatINR(toNumber(inv.grandTotal))}</p>
                          <StatusBadge status={inv.status} />
                        </div>
                      </div>
                      <p className="mt-2 truncate text-xs text-slate-500">
                        {inv.payments.map((p) => `${p.method} ₹${toNumber(p.amount)}`).join(' · ') ||
                          'No payments'}
                      </p>
                    </Link>
                  </li>
                ))}
              </ul>
              {/* Desktop table */}
              <div className="hidden overflow-x-auto md:block">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-xs uppercase tracking-wide text-slate-500">
                      <th className="px-2 py-2">Date</th>
                      <th className="px-2 py-2">Invoice</th>
                      <th className="px-2 py-2">Amount</th>
                      <th className="px-2 py-2">Payment</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invoices.map((inv) => (
                      <tr key={inv.id} className="border-t border-slate-100">
                        <td className="px-2 py-3">{formatDate(inv.createdAt)}</td>
                        <td className="px-2 py-3">
                          <Link href={`/dashboard/invoices/${inv.id}`} className="font-medium text-brand hover:underline">
                            {inv.invoiceNumber}
                          </Link>{' '}
                          <StatusBadge status={inv.status} />
                        </td>
                        <td className="px-2 py-3">{formatINR(toNumber(inv.grandTotal))}</td>
                        <td className="px-2 py-3 text-slate-600">
                          {inv.payments.map((p) => `${p.method} ₹${toNumber(p.amount)}`).join(', ') || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </Card>
      ) : null}

      {tab === 'repairs' ? (
        <>
        {devices.length ? (
          <Card className="border-slate-200">
            <h2 className="mb-3 text-lg font-semibold">Devices on file</h2>
            <ul className="space-y-3">
              {devices.map((device) => (
                <li key={device.id} className="rounded-xl border border-slate-200 px-3 py-3">
                  <p className="font-medium text-slate-900">
                    {device.brand ? `${device.brand} ` : ''}
                    {device.model}
                  </p>
                  <p className="text-xs text-slate-500">
                    {device.imei ? `IMEI ${device.imei} · ` : ''}
                    {device.repairJobs.length} repair{device.repairJobs.length === 1 ? '' : 's'} on record
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {device.repairJobs.map((job) => (
                      <Link
                        key={job.id}
                        href={`/dashboard/repairs/${job.id}`}
                        className="rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                      >
                        {job.jobNumber} · <StatusBadge status={job.status} />
                      </Link>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        ) : null}
        <Card className="border-slate-200">
          <h2 className="mb-3 text-lg font-semibold">Repair jobs</h2>
          {!repairs.length ? (
            <p className="py-8 text-center text-sm text-slate-500">No repairs linked yet.</p>
          ) : (
            <ul className="space-y-3">
              {repairs.map((job) => (
                <li key={job.id}>
                  <Link
                    href={`/dashboard/repairs/${job.id}`}
                    className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-3 hover:bg-slate-50"
                  >
                    <div>
                      <p className="font-medium text-slate-900">{job.jobNumber}</p>
                      <p className="text-xs text-slate-500">
                        {job.deviceModel || job.issue || 'Repair'} ·{' '}
                        {formatDate(job.receivedAt || job.createdAt)}
                      </p>
                    </div>
                    <StatusBadge status={job.status} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Card>
        </>
      ) : null}

      {/* Mobile sticky actions — above bottom nav */}
      <div
        className="fixed inset-x-0 bottom-[4.5rem] z-30 border-t border-slate-200 bg-white/95 px-3 py-2 backdrop-blur md:hidden"
      >
        <div className="mx-auto grid max-w-lg grid-cols-4 gap-2">
          {phoneCall ? (
            <a
              href={phoneCall}
              className="rounded-xl bg-slate-100 py-2.5 text-center text-xs font-semibold text-slate-800"
            >
              Call
            </a>
          ) : (
            <span className="rounded-xl bg-slate-50 py-2.5 text-center text-xs text-slate-400">Call</span>
          )}
          {canWhatsApp ? (
            <button
              type="button"
              disabled={waReminding}
              onClick={() => void sendCustomerReminder()}
              className="rounded-xl bg-emerald-50 py-2.5 text-center text-xs font-semibold text-emerald-800 disabled:opacity-50"
            >
              {waReminding ? '…' : 'WhatsApp'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setTab('profile')}
              className="rounded-xl bg-slate-100 py-2.5 text-xs font-semibold text-slate-800"
            >
              Edit
            </button>
          )}
          <button
            type="button"
            onClick={() => setTab('udhaar')}
            className="rounded-xl bg-amber-50 py-2.5 text-xs font-semibold text-amber-900"
          >
            Collect
          </button>
          <Link
            href="/dashboard/pos"
            className="rounded-xl bg-teal-600 py-2.5 text-center text-xs font-semibold text-white"
          >
            New bill
          </Link>
        </div>
      </div>
    </div>
  );
}
