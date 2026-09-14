import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import type { ApiFetch } from './api';
import { CustomerFormModal } from './CustomerFormModal';
import { applyExportDownload, ExportMenu, type ExportFormat, type ExportPayload } from './exportDownload';
import { useToastMessage } from './toast';

type CustomerAgingRow = {
  customerId: string;
  name: string;
  phone: string | null;
  email?: string | null;
  gstin?: string | null;
  address?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  pincode?: string | null;
  stateCode?: string | null;
  segment?: string | null;
  outstanding: number;
  creditLimit: number;
  advanceBalance?: number;
  loyaltyPoints?: number;
  whatsappOptIn?: boolean;
};

type SupplierAgingRow = {
  supplierId: string | null;
  name: string;
  phone: string | null;
  email?: string | null;
  gstin: string | null;
  address?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  pincode?: string | null;
  stateCode?: string | null;
  isMsme?: boolean;
  paymentTermsDays?: number | null;
  bankName?: string | null;
  ifsc?: string | null;
  advanceBalance?: number;
  outstanding: number;
  billCount?: number;
  overdueCount?: number;
};

type PartyHit = {
  id: string;
  type: 'CUSTOMER' | 'SUPPLIER';
  name: string;
  phone: string | null;
  gstin?: string | null;
  email?: string | null;
  city?: string | null;
  address?: string | null;
  pincode?: string | null;
  stateCode?: string | null;
  balance: number;
  isMsme?: boolean;
  segment?: string | null;
};

type LedgerLine = {
  id: string;
  entryDate: string;
  entryType: string;
  description: string | null;
  debit: number | string;
  credit: number | string;
  balanceAfter: number | string | null;
  invoice?: { invoiceNumber?: string | null } | null;
  bill?: { invoiceNumber?: string | null } | null;
  payment?: { referenceNo?: string | null; method?: string | null } | null;
};

type OpenInvoice = {
  id: string;
  invoiceNumber: string;
  createdAt: string;
  dueAmount: number;
};

type OpenBill = {
  id: string;
  invoiceNumber?: string | null;
  invoiceDate?: string | null;
  dueAmount: number;
};

type DetailState =
  | { kind: 'customer'; id: string; name: string }
  | { kind: 'supplier'; id: string; name: string }
  | null;

function money(n: number | string | null | undefined) {
  return `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function fmtDate(v?: string | null) {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-IN');
}

function formatAddress(p: {
  address?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  stateCode?: string | null;
  pincode?: string | null;
}) {
  return [p.address, p.addressLine2, p.city, p.stateCode, p.pincode].filter(Boolean).join(', ');
}

function haystack(...parts: Array<string | null | undefined>) {
  return parts.filter(Boolean).join(' ').toLowerCase();
}

export function PartiesPanel({
  token,
  apiFetch,
}: {
  token: string;
  apiFetch: ApiFetch;
}) {
  const [tab, setTab] = useState<'customers' | 'suppliers'>('customers');
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  useToastMessage(error, 'error', setError);
  useToastMessage(okMsg, 'success', setOkMsg);
  const [customers, setCustomers] = useState<CustomerAgingRow[]>([]);
  const [suppliers, setSuppliers] = useState<SupplierAgingRow[]>([]);
  const [searchHits, setSearchHits] = useState<PartyHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [detail, setDetail] = useState<DetailState>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [exporting, setExporting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      if (tab === 'customers') {
        const data = await apiFetch<CustomerAgingRow[]>(token, '/customers/aging/report');
        setCustomers(Array.isArray(data) ? data : []);
      } else {
        const data = await apiFetch<SupplierAgingRow[]>(token, '/suppliers/aging/report');
        setSuppliers(Array.isArray(data) ? data.filter((s) => s.supplierId) : []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load khata');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, token, tab]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setSearchHits([]);
      return;
    }
    const t = window.setTimeout(() => {
      void (async () => {
        setSearching(true);
        try {
          const data = await apiFetch<{ parties: PartyHit[] }>(
            token,
            `/parties/search?q=${encodeURIComponent(term)}&limit=20`,
          );
          setSearchHits(data.parties || []);
        } catch {
          setSearchHits([]);
        } finally {
          setSearching(false);
        }
      })();
    }, 280);
    return () => window.clearTimeout(t);
  }, [q, apiFetch, token]);

  const filteredCustomers = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term || searchHits.length) return customers;
    return customers.filter((c) =>
      haystack(
        c.name,
        c.phone,
        c.email,
        c.gstin,
        c.address,
        c.addressLine2,
        c.city,
        c.pincode,
        c.stateCode,
        c.segment,
      ).includes(term),
    );
  }, [customers, q, searchHits.length]);

  const filteredSuppliers = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term || searchHits.length) return suppliers;
    return suppliers.filter((s) =>
      haystack(
        s.name,
        s.phone,
        s.email,
        s.gstin,
        s.address,
        s.addressLine2,
        s.city,
        s.pincode,
        s.stateCode,
        s.bankName,
        s.ifsc,
      ).includes(term),
    );
  }, [suppliers, q, searchHits.length]);

  const openParty = (kind: 'customer' | 'supplier', id: string, name: string) => {
    setOkMsg('');
    setDetail({ kind, id, name });
  };

  const exportList = useCallback(
    async (format: ExportFormat) => {
      setExporting(true);
      setError('');
      setOkMsg('');
      try {
        const path =
          tab === 'customers'
            ? `/reports/receivables?format=${format}`
            : `/reports/payables?format=${format}`;
        const data = await apiFetch<ExportPayload>(token, path);
        const msg = await applyExportDownload(format, data);
        setOkMsg(msg);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Export failed');
      } finally {
        setExporting(false);
      }
    },
    [apiFetch, token, tab],
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3" style={{ background: 'var(--rs-bg-deep)' }}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={tab === 'customers' ? 'rs-btn-primary text-sm' : 'rs-btn-secondary text-sm'}
          onClick={() => setTab('customers')}
        >
          Customers (receivable)
        </button>
        <button
          type="button"
          className={tab === 'suppliers' ? 'rs-btn-primary text-sm' : 'rs-btn-secondary text-sm'}
          onClick={() => setTab('suppliers')}
        >
          Suppliers (payable)
        </button>
        <input
          className="rs-input min-w-[200px] flex-1 text-sm"
          placeholder="Search name / phone / GSTIN / city / address…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <button type="button" className="rs-btn-secondary text-sm" onClick={() => void load()} disabled={loading}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
        <ExportMenu exporting={exporting} onExport={(f) => void exportList(f)} compact />
        {tab === 'customers' ? (
          <button type="button" className="rs-btn-primary text-sm" onClick={() => setShowCreate(true)}>
            + Add customer
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-md px-3 py-2 text-sm" style={{ background: '#fef2f2', color: '#991b1b' }}>
          {error}
        </div>
      ) : null}
      {okMsg ? (
        <div className="rounded-md px-3 py-2 text-sm" style={{ background: '#ecfdf5', color: '#065f46' }}>
          {okMsg}
        </div>
      ) : null}

      {q.trim().length >= 2 && (
        <div className="rs-card p-3">
          <div className="mb-2 text-xs" style={{ color: 'var(--rs-muted)' }}>
            {searching ? 'Searching…' : `Party search · ${searchHits.length} hit(s) — open in desktop`}
          </div>
          {searchHits.length === 0 && !searching ? (
            <div className="text-sm" style={{ color: 'var(--rs-muted)' }}>
              No matching parties.
            </div>
          ) : (
            <div className="grid max-h-40 gap-1 overflow-auto">
              {searchHits.map((h) => (
                <button
                  key={`${h.type}-${h.id}`}
                  type="button"
                  className="rs-btn-ghost flex items-center justify-between text-left text-sm"
                  onClick={() =>
                    openParty(h.type === 'CUSTOMER' ? 'customer' : 'supplier', h.id, h.name)
                  }
                >
                  <span>
                    <strong>{h.name}</strong>
                    <span className="ml-2" style={{ color: 'var(--rs-muted)' }}>
                      {h.type === 'CUSTOMER' ? 'Customer' : 'Supplier'}
                      {h.phone ? ` · ${h.phone}` : ''}
                      {h.gstin ? ` · ${h.gstin}` : ''}
                      {h.city ? ` · ${h.city}` : ''}
                      {h.isMsme ? ' · MSME' : ''}
                    </span>
                    {formatAddress(h) ? (
                      <div className="text-xs" style={{ color: 'var(--rs-muted)' }}>
                        {formatAddress(h)}
                      </div>
                    ) : null}
                  </span>
                  <span className="font-semibold tabular-nums">{money(h.balance)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="rs-card min-h-0 flex-1 overflow-auto p-0">
        {tab === 'customers' ? (
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className="sticky top-0" style={{ background: 'var(--rs-surface, #fff)' }}>
              <tr className="border-b text-xs" style={{ color: 'var(--rs-muted)' }}>
                <th className="px-3 py-2 font-medium">Customer</th>
                <th className="px-2 py-2 font-medium">Contact</th>
                <th className="px-2 py-2 font-medium">GSTIN</th>
                <th className="px-2 py-2 font-medium">Address</th>
                <th className="px-2 py-2 text-right font-medium">Limit</th>
                <th className="px-3 py-2 text-right font-medium">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-4" style={{ color: 'var(--rs-muted)' }}>
                    {loading ? 'Loading…' : 'No customer balances.'}
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((c) => {
                  const addr = formatAddress(c);
                  return (
                    <tr
                      key={c.customerId}
                      className="cursor-pointer border-b hover:bg-black/[0.03]"
                      onClick={() => openParty('customer', c.customerId, c.name)}
                    >
                      <td className="px-3 py-2 align-top">
                        <div className="font-medium">{c.name}</div>
                        <div className="mt-0.5 flex flex-wrap gap-1 text-[10px]">
                          {c.segment ? (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-600">
                              {c.segment}
                            </span>
                          ) : null}
                          {c.whatsappOptIn ? (
                            <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-700">
                              WA
                            </span>
                          ) : null}
                          {Number(c.loyaltyPoints) > 0 ? (
                            <span className="rounded bg-amber-50 px-1.5 py-0.5 font-semibold text-amber-800">
                              {c.loyaltyPoints} pts
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-2 py-2 align-top">
                        <div>{c.phone || '—'}</div>
                        {c.email ? (
                          <div className="text-xs" style={{ color: 'var(--rs-muted)' }}>
                            {c.email}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-2 py-2 align-top font-mono text-xs">{c.gstin || '—'}</td>
                      <td className="max-w-[220px] px-2 py-2 align-top text-xs" style={{ color: 'var(--rs-muted)' }}>
                        {addr || '—'}
                      </td>
                      <td className="px-2 py-2 align-top text-right tabular-nums">
                        <div>{money(c.creditLimit)}</div>
                        {Number(c.advanceBalance) > 0.009 ? (
                          <div className="text-[10px] text-teal-700">Adv {money(c.advanceBalance)}</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 align-top text-right font-semibold tabular-nums text-rose-700">
                        {money(c.outstanding)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        ) : (
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="sticky top-0" style={{ background: 'var(--rs-surface, #fff)' }}>
              <tr className="border-b text-xs" style={{ color: 'var(--rs-muted)' }}>
                <th className="px-3 py-2 font-medium">Supplier</th>
                <th className="px-2 py-2 font-medium">Contact</th>
                <th className="px-2 py-2 font-medium">GSTIN</th>
                <th className="px-2 py-2 font-medium">Address</th>
                <th className="px-2 py-2 font-medium">Terms / Bank</th>
                <th className="px-2 py-2 text-right font-medium">Bills</th>
                <th className="px-3 py-2 text-right font-medium">Outstanding</th>
              </tr>
            </thead>
            <tbody>
              {filteredSuppliers.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-3 py-4" style={{ color: 'var(--rs-muted)' }}>
                    {loading ? 'Loading…' : 'No supplier balances.'}
                  </td>
                </tr>
              ) : (
                filteredSuppliers.map((s) => {
                  const addr = formatAddress(s);
                  return (
                    <tr
                      key={s.supplierId || s.name}
                      className="cursor-pointer border-b hover:bg-black/[0.03]"
                      onClick={() => s.supplierId && openParty('supplier', s.supplierId, s.name)}
                    >
                      <td className="px-3 py-2 align-top">
                        <div className="font-medium">{s.name}</div>
                        {s.isMsme ? (
                          <span className="mt-0.5 inline-flex rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold text-violet-800">
                            MSME
                          </span>
                        ) : null}
                      </td>
                      <td className="px-2 py-2 align-top">
                        <div>{s.phone || '—'}</div>
                        {s.email ? (
                          <div className="text-xs" style={{ color: 'var(--rs-muted)' }}>
                            {s.email}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-2 py-2 align-top font-mono text-xs">{s.gstin || '—'}</td>
                      <td className="max-w-[220px] px-2 py-2 align-top text-xs" style={{ color: 'var(--rs-muted)' }}>
                        {addr || '—'}
                      </td>
                      <td className="px-2 py-2 align-top text-xs">
                        {s.paymentTermsDays != null ? (
                          <div>{s.paymentTermsDays}d credit</div>
                        ) : (
                          <div style={{ color: 'var(--rs-muted)' }}>—</div>
                        )}
                        {s.bankName || s.ifsc ? (
                          <div style={{ color: 'var(--rs-muted)' }}>
                            {[s.bankName, s.ifsc].filter(Boolean).join(' · ')}
                          </div>
                        ) : null}
                        {Number(s.advanceBalance) > 0.009 ? (
                          <div className="text-teal-700">Adv {money(s.advanceBalance)}</div>
                        ) : null}
                      </td>
                      <td className="px-2 py-2 align-top text-right text-xs tabular-nums">
                        <div>{s.billCount ?? 0} open</div>
                        {(s.overdueCount ?? 0) > 0 ? (
                          <div className="font-semibold text-amber-700">{s.overdueCount} overdue</div>
                        ) : null}
                      </td>
                      <td className="px-3 py-2 align-top text-right font-semibold tabular-nums text-rose-700">
                        {money(s.outstanding)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        )}
      </div>

      {detail && (
        <PartyDetailDrawer
          token={token}
          apiFetch={apiFetch}
          detail={detail}
          onClose={() => setDetail(null)}
          onChanged={() => void load()}
          onError={setError}
          onOk={(msg) => {
            setError('');
            setOkMsg(msg);
          }}
        />
      )}

      <CustomerFormModal
        open={showCreate}
        token={token}
        apiFetch={apiFetch}
        onClose={() => setShowCreate(false)}
        onCreated={(c) => {
          setOkMsg(`Customer ${c.name} created`);
          setError('');
          setShowCreate(false);
          setDetail({ kind: 'customer', id: c.id, name: c.name });
          void load();
        }}
      />
    </div>
  );
}

function PartyDetailDrawer({
  token,
  apiFetch,
  detail,
  onClose,
  onChanged,
  onError,
  onOk,
}: {
  token: string;
  apiFetch: ApiFetch;
  detail: NonNullable<DetailState>;
  onClose: () => void;
  onChanged: () => void;
  onError: (msg: string) => void;
  onOk: (msg: string) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [localErr, setLocalErr] = useState('');
  const [ledger, setLedger] = useState<LedgerLine[]>([]);
  const [openInvoices, setOpenInvoices] = useState<OpenInvoice[]>([]);
  const [openBills, setOpenBills] = useState<OpenBill[]>([]);
  const [balance, setBalance] = useState(0);
  const [phone, setPhone] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('CASH');
  const [payRef, setPayRef] = useState('');
  const [saving, setSaving] = useState(false);
  const [pickMode, setPickMode] = useState(true);
  const [allocAmounts, setAllocAmounts] = useState<Record<string, string>>({});

  const reload = useCallback(async () => {
    setLoading(true);
    setLocalErr('');
    try {
      if (detail.kind === 'customer') {
        const [stmt, opens] = await Promise.all([
          apiFetch<{
            customer: { phone?: string | null; outstandingBalance?: number | string };
            ledger: LedgerLine[];
          }>(token, `/customers/${detail.id}/statement`),
          apiFetch<OpenInvoice[]>(token, `/customers/${detail.id}/open-invoices`),
        ]);
        setLedger(stmt.ledger || []);
        setOpenInvoices(Array.isArray(opens) ? opens : []);
        setOpenBills([]);
        setPhone(stmt.customer?.phone || null);
        setBalance(Number(stmt.customer?.outstandingBalance || 0));
      } else {
        const data = await apiFetch<{
          supplier: { phone?: string | null; outstandingBalance?: number | string };
          ledger: LedgerLine[];
          bills: Array<{
            id: string;
            invoiceNumber?: string | null;
            invoiceDate?: string | null;
            dueAmount?: number;
            totalAmount?: number | string;
            paidAmount?: number | string;
          }>;
          summary?: { pendingPayable?: number };
        }>(token, `/suppliers/${detail.id}`);
        setLedger(data.ledger || []);
        setOpenInvoices([]);
        const bills = (data.bills || [])
          .map((b) => ({
            id: b.id,
            invoiceNumber: b.invoiceNumber,
            invoiceDate: b.invoiceDate,
            dueAmount:
              b.dueAmount != null
                ? Number(b.dueAmount)
                : Math.max(0, Number(b.totalAmount || 0) - Number(b.paidAmount || 0)),
          }))
          .filter((b) => b.dueAmount > 0.01);
        setOpenBills(bills);
        setPhone(data.supplier?.phone || null);
        setBalance(
          Number(
            data.summary?.pendingPayable ??
              data.supplier?.outstandingBalance ??
              bills.reduce((s, b) => s + b.dueAmount, 0),
          ),
        );
      }
    } catch (e) {
      setLocalErr(e instanceof Error ? e.message : 'Failed to load party');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, token, detail]);

  useEffect(() => {
    void reload();
    setAllocAmounts({});
    setPickMode(true);
    setPayAmount('');
    setPayRef('');
  }, [reload]);

  const submitPayment = async (e: FormEvent) => {
    e.preventDefault();
    const amount = Number(payAmount);
    if (!(amount > 0)) {
      setLocalErr('Enter a valid amount');
      return;
    }
    const pendingDocs = detail.kind === 'customer' ? openInvoices : openBills;
    const allocations = pickMode
      ? pendingDocs
          .map((doc) => {
            const id = doc.id;
            const amt = Number(allocAmounts[id] || 0);
            return detail.kind === 'customer'
              ? { invoiceId: id, amount: amt }
              : { billId: id, amount: amt };
          })
          .filter((a) => Number((a as { amount: number }).amount) > 0.009)
      : [];
    if (pickMode && allocations.length === 0) {
      setLocalErr(
        detail.kind === 'customer'
          ? 'Enter at least one invoice allocation, or switch to FIFO.'
          : 'Enter at least one bill allocation, or switch to FIFO.',
      );
      return;
    }
    setSaving(true);
    setLocalErr('');
    try {
      if (detail.kind === 'customer') {
        await apiFetch(token, `/customers/${detail.id}/collect`, {
          method: 'POST',
          body: JSON.stringify({
            amount,
            method: payMethod === 'BANK' ? 'BANK_TRANSFER' : payMethod,
            reference: payRef.trim() || undefined,
            ...(allocations.length ? { allocations } : {}),
          }),
        });
        onOk('Payment collected');
      } else {
        const method =
          payMethod === 'BANK' || payMethod === 'CARD' ? 'BANK_TRANSFER' : payMethod;
        await apiFetch(token, '/supplier-payments', {
          method: 'POST',
          body: JSON.stringify({
            supplierId: detail.id,
            amount,
            method,
            referenceNo: payRef.trim() || undefined,
            ...(allocations.length ? { allocations } : {}),
          }),
        });
        onOk('Supplier payment recorded');
      }
      setPayAmount('');
      setPayRef('');
      setAllocAmounts({});
      await reload();
      onChanged();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Payment failed';
      setLocalErr(msg);
      onError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[80] flex justify-end"
      style={{ background: 'rgba(15,23,42,0.45)' }}
      onClick={onClose}
    >
      <div
        className="rs-card flex h-full w-full max-w-xl flex-col gap-3 overflow-hidden rounded-none p-4"
        onClick={(ev) => ev.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="text-[11px] uppercase tracking-wide" style={{ color: 'var(--rs-muted)' }}>
              {detail.kind === 'customer' ? 'Customer khata' : 'Supplier khata'}
            </div>
            <h3 className="mt-0.5 text-lg font-semibold">{detail.name}</h3>
            <div className="text-sm" style={{ color: 'var(--rs-muted)' }}>
              {phone || 'No phone'} · Balance {money(balance)}
            </div>
          </div>
          <button type="button" className="rs-btn-ghost text-sm" onClick={onClose}>
            Close
          </button>
        </div>

        {localErr ? (
          <div className="rounded-md px-3 py-2 text-sm" style={{ background: '#fef2f2', color: '#991b1b' }}>
            {localErr}
          </div>
        ) : null}

        <form
          onSubmit={(e) => void submitPayment(e)}
          className="flex flex-col gap-3 rounded-lg p-3"
          style={{ background: 'var(--rs-bg-deep, #f8fafc)' }}
        >
          <div className="grid grid-cols-[1fr_110px_1fr_auto] items-end gap-2">
            <label className="grid gap-1 text-xs">
              Amount
              <input
                className="rs-input text-sm"
                type="number"
                min={0}
                step="0.01"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                placeholder="0.00"
                required
              />
            </label>
            <label className="grid gap-1 text-xs">
              Method
              <select className="rs-input text-sm" value={payMethod} onChange={(e) => setPayMethod(e.target.value)}>
                <option value="CASH">Cash</option>
                <option value="UPI">UPI</option>
                <option value="CARD">Card</option>
                <option value="BANK">Bank</option>
                <option value="CHEQUE">Cheque</option>
              </select>
            </label>
            <label className="grid gap-1 text-xs">
              Reference
              <input
                className="rs-input text-sm"
                value={payRef}
                onChange={(e) => setPayRef(e.target.value)}
                placeholder="Optional"
              />
            </label>
            <button type="submit" className="rs-btn-primary text-sm" disabled={saving}>
              {saving ? 'Saving…' : detail.kind === 'customer' ? 'Collect' : 'Pay'}
            </button>
          </div>

          <div className="rounded-md border px-2.5 py-2" style={{ borderColor: 'var(--rs-border)' }}>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--rs-muted)' }}>
                {detail.kind === 'customer'
                  ? `Pending invoices (${openInvoices.length})`
                  : `Pending bills (${openBills.length})`}
              </span>
              <div className="flex gap-1">
                <button
                  type="button"
                  className="rounded px-2 py-1 text-[11px] font-semibold"
                  style={{
                    background: pickMode ? 'var(--rs-accent-soft)' : 'transparent',
                    color: pickMode ? 'var(--rs-accent)' : 'var(--rs-muted)',
                  }}
                  onClick={() => setPickMode(true)}
                >
                  Pick
                </button>
                <button
                  type="button"
                  className="rounded px-2 py-1 text-[11px] font-semibold"
                  style={{
                    background: !pickMode ? 'var(--rs-accent-soft)' : 'transparent',
                    color: !pickMode ? 'var(--rs-accent)' : 'var(--rs-muted)',
                  }}
                  onClick={() => setPickMode(false)}
                >
                  FIFO
                </button>
              </div>
            </div>
            {detail.kind === 'customer' ? (
              openInvoices.length === 0 ? (
                <p className="text-xs" style={{ color: 'var(--rs-muted)' }}>
                  No pending invoices.
                </p>
              ) : (
                <div className="space-y-1.5">
                  {openInvoices.map((inv) => (
                    <div key={inv.id} className="flex flex-wrap items-center gap-2 text-xs">
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold">{inv.invoiceNumber}</div>
                        <div style={{ color: 'var(--rs-muted)' }}>
                          Due {money(inv.dueAmount)} · {fmtDate(inv.createdAt)}
                        </div>
                      </div>
                      {pickMode ? (
                        <>
                          <button
                            type="button"
                            className="rs-btn-ghost text-[11px]"
                            onClick={() =>
                              setAllocAmounts((prev) => ({
                                ...prev,
                                [inv.id]: String(Number(inv.dueAmount).toFixed(2)),
                              }))
                            }
                          >
                            Full
                          </button>
                          <input
                            className="rs-input w-24 text-xs"
                            type="number"
                            step="0.01"
                            placeholder="0"
                            value={allocAmounts[inv.id] || ''}
                            onChange={(e) =>
                              setAllocAmounts((prev) => ({ ...prev, [inv.id]: e.target.value }))
                            }
                          />
                        </>
                      ) : (
                        <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                          Pending
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              )
            ) : openBills.length === 0 ? (
              <p className="text-xs" style={{ color: 'var(--rs-muted)' }}>
                No pending bills.
              </p>
            ) : (
              <div className="space-y-1.5">
                {openBills.map((b) => (
                  <div key={b.id} className="flex flex-wrap items-center gap-2 text-xs">
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold">{b.invoiceNumber || b.id.slice(0, 8)}</div>
                      <div style={{ color: 'var(--rs-muted)' }}>
                        Due {money(b.dueAmount)} · {fmtDate(b.invoiceDate)}
                      </div>
                    </div>
                    {pickMode ? (
                      <>
                        <button
                          type="button"
                          className="rs-btn-ghost text-[11px]"
                          onClick={() =>
                            setAllocAmounts((prev) => ({
                              ...prev,
                              [b.id]: String(Number(b.dueAmount).toFixed(2)),
                            }))
                          }
                        >
                          Full
                        </button>
                        <input
                          className="rs-input w-24 text-xs"
                          type="number"
                          step="0.01"
                          placeholder="0"
                          value={allocAmounts[b.id] || ''}
                          onChange={(e) =>
                            setAllocAmounts((prev) => ({ ...prev, [b.id]: e.target.value }))
                          }
                        />
                      </>
                    ) : (
                      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-800">
                        Pending
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </form>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto">
          {loading ? (
            <div className="p-2 text-sm" style={{ color: 'var(--rs-muted)' }}>
              Loading ledger…
            </div>
          ) : (
            <>
              <section>
                <h4 className="mb-2 text-sm font-semibold">Ledger</h4>
                {ledger.length === 0 ? (
                  <div className="text-sm" style={{ color: 'var(--rs-muted)' }}>
                    No ledger entries yet.
                  </div>
                ) : (
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr style={{ color: 'var(--rs-muted)' }}>
                        <th className="py-1 font-medium">Date</th>
                        <th className="py-1 font-medium">Type</th>
                        <th className="py-1 font-medium">Particulars</th>
                        <th className="py-1 text-right font-medium">Debit</th>
                        <th className="py-1 text-right font-medium">Credit</th>
                        <th className="py-1 text-right font-medium">Bal</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ledger.map((row) => (
                        <tr key={row.id} className="border-t">
                          <td className="py-1.5 whitespace-nowrap">{fmtDate(row.entryDate)}</td>
                          <td className="py-1.5">{row.entryType}</td>
                          <td className="py-1.5">
                            {row.description ||
                              row.invoice?.invoiceNumber ||
                              row.bill?.invoiceNumber ||
                              row.payment?.referenceNo ||
                              '—'}
                          </td>
                          <td className="py-1.5 text-right tabular-nums">
                            {Number(row.debit) > 0 ? money(row.debit) : '—'}
                          </td>
                          <td className="py-1.5 text-right tabular-nums">
                            {Number(row.credit) > 0 ? money(row.credit) : '—'}
                          </td>
                          <td className="py-1.5 text-right tabular-nums">
                            {row.balanceAfter != null ? money(row.balanceAfter) : '—'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
