import { useCallback, useEffect, useMemo, useState } from 'react';
import type { InvoiceCopyKind, PrintInvoiceData } from '@retail-sarathi/ui';
import { buildA4Html, openSystemPrint } from './pos/invoicePrint';
import { useToastMessage } from './toast';

type ApiFetch = <T>(token: string, path: string, init?: RequestInit) => Promise<T>;

type InvoiceRow = {
  id: string;
  invoiceNumber: string;
  type?: string;
  grandTotal: number;
  status: string;
  createdAt: string;
  updatedAt?: string;
  customer?: {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    gstin?: string | null;
  } | null;
  payments?: Array<{ method: string; amount: number }>;
  lines?: Array<{ quantity: number }>;
};

type InvoiceResponse = {
  items: InvoiceRow[];
  total?: number;
  page?: number;
  pageSize?: number;
};

const STATUS_OPTIONS = ['ALL', 'FINALIZED', 'DRAFT', 'CANCELLED'] as const;
const TYPE_OPTIONS = [
  { value: '', label: 'All types' },
  { value: 'TAX_INVOICE', label: 'Tax invoice' },
  { value: 'CREDIT_NOTE', label: 'Credit note' },
  { value: 'BILL_OF_SUPPLY', label: 'Bill of supply' },
  { value: 'DELIVERY_CHALLAN', label: 'Delivery challan' },
] as const;
const PAYMENT_OPTIONS = [
  { value: '', label: 'All modes' },
  { value: 'CASH', label: 'Cash' },
  { value: 'UPI', label: 'UPI' },
  { value: 'CARD', label: 'Card' },
  { value: 'CREDIT', label: 'Credit' },
  { value: 'BANK_TRANSFER', label: 'Bank' },
] as const;
const PAGE_SIZES = [10, 25, 50, 100] as const;

const COPY_OPTIONS: Array<{ kind: InvoiceCopyKind; label: string }> = [
  { kind: 'original', label: 'Original' },
  { kind: 'duplicate', label: 'Duplicate' },
  { kind: 'triplicate', label: 'Triplicate' },
];

function inr(n: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(n);
}

function fmt(iso?: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

function typeLabel(type?: string) {
  if (!type || type === 'TAX_INVOICE') return 'Tax invoice';
  return TYPE_OPTIONS.find((t) => t.value === type)?.label ?? type;
}

function statusClass(status: string) {
  if (status === 'CANCELLED') return 'bg-red-100 text-red-800';
  if (status === 'DRAFT') return 'bg-amber-100 text-amber-900';
  return 'bg-emerald-100 text-emerald-800';
}

export function InvoicesPanel({
  token,
  apiFetch,
  printOpts,
  invoiceTemplateId = 'classic',
}: {
  token: string;
  apiFetch: ApiFetch;
  invoiceTemplateId?: string;
  printOpts?: {
    thermalWidth?: 58 | 80;
    showShopGstin?: boolean;
    showShopAddress?: boolean;
    showCustomerOnThermal?: boolean;
    comPort?: string;
    bluetoothAddress?: string;
    kickDrawer?: boolean;
  };
}) {
  const [status, setStatus] = useState<string>('ALL');
  const [searchDraft, setSearchDraft] = useState('');
  const [search, setSearch] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [type, setType] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [view, setView] = useState<'table' | 'cards'>('table');
  const [items, setItems] = useState<InvoiceRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<Record<string, unknown> | null>(null);
  const [printData, setPrintData] = useState<PrintInvoiceData | null>(null);
  const [copyKind, setCopyKind] = useState<InvoiceCopyKind>('original');
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [actionMsg, setActionMsg] = useState('');
  useToastMessage(error, 'error', setError);
  useToastMessage(actionMsg, setActionMsg);

  const previewHtml = useMemo(() => {
    if (!printData) return '';
    return buildA4Html(printData, invoiceTemplateId, copyKind);
  }, [printData, invoiceTemplateId, copyKind]);

  function closeDetail() {
    setSelectedId(null);
    setDetail(null);
    setPrintData(null);
    setCopyKind('original');
    setActionMsg('');
  }

  useEffect(() => {
    if (!selectedId) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setSelectedId(null);
        setDetail(null);
        setPrintData(null);
        setCopyKind('original');
        setActionMsg('');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedId]);

  async function reprintThermal(invoiceId: string) {
    setActionBusy(true);
    setActionMsg('');
    try {
      const job = await apiFetch<{ text: string; escposBase64?: string; bluetoothAddress?: string | null }>(
        token,
        '/hardware/print-thermal',
        {
          method: 'POST',
          body: JSON.stringify({
            invoiceId,
            paperWidth: printOpts?.thermalWidth ?? 80,
            showShopGstin: printOpts?.showShopGstin ?? true,
            showShopAddress: printOpts?.showShopAddress ?? true,
            showCustomerOnThermal: printOpts?.showCustomerOnThermal ?? true,
          }),
        },
      );
      await window.retailSarathi.printThermal({
        text: job.text,
        escposBase64: job.escposBase64,
        comPort: printOpts?.comPort,
        bluetoothAddress: printOpts?.bluetoothAddress || job.bluetoothAddress || undefined,
        kickDrawer: printOpts?.kickDrawer,
      });
      setActionMsg('Thermal reprint sent');
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Reprint failed');
    } finally {
      setActionBusy(false);
    }
  }

  async function sendWhatsapp(invoiceId: string) {
    setActionBusy(true);
    setActionMsg('');
    try {
      const res = await apiFetch<{
        ok?: boolean;
        sent?: boolean;
        phone?: string;
        message?: string;
        reason?: string;
      }>(token, `/invoices/${invoiceId}/whatsapp`, { method: 'POST' });
      if (res.sent === false) {
        setActionMsg(res.reason || res.message || 'WhatsApp skipped');
      } else {
        setActionMsg(
          res.phone
            ? `WhatsApp sent to ${res.phone}`
            : res.message || 'WhatsApp request completed',
        );
      }
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'WhatsApp failed');
    } finally {
      setActionBusy(false);
    }
  }

  async function printWarranty(invoiceId: string) {
    setActionBusy(true);
    setActionMsg('');
    try {
      const card = await apiFetch<{ text?: string; url?: string }>(
        token,
        `/invoices/${invoiceId}/warranty-cards`,
        { method: 'POST' },
      );
      if (card.text) {
        await window.retailSarathi.printThermal({
          text: card.text,
          comPort: printOpts?.comPort,
          bluetoothAddress: printOpts?.bluetoothAddress,
        });
        setActionMsg('Warranty card printed');
      } else if (card.url && window.retailSarathi.openExternal) {
        await window.retailSarathi.openExternal(card.url);
        setActionMsg('Opened warranty card');
      } else {
        setActionMsg('Warranty card generated');
      }
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Warranty print unavailable');
    } finally {
      setActionBusy(false);
    }
  }

  async function handlePrintPdf() {
    if (!printData) return;
    setActionBusy(true);
    setActionMsg('Opening print preview…');
    try {
      const html = buildA4Html(printData, invoiceTemplateId, copyKind);
      const popupError = await openSystemPrint(html);
      if (popupError) {
        setActionMsg(popupError);
      } else {
        setActionMsg('Print preview opened — use Open PDF, Save PDF, or Print now.');
      }
    } catch (e) {
      setActionMsg(e instanceof Error ? e.message : 'Print failed');
    } finally {
      setActionBusy(false);
    }
  }

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      params.set('sortBy', sortBy);
      params.set('sortDir', sortDir);
      if (status !== 'ALL') params.set('status', status);
      if (search.trim()) params.set('search', search.trim());
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);
      if (type) params.set('type', type);
      if (paymentMethod) params.set('paymentMethod', paymentMethod);
      const res = await apiFetch<InvoiceResponse>(token, `/invoices?${params}`);
      setItems(res.items ?? []);
      setTotal(res.total ?? res.items?.length ?? 0);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load invoices');
    } finally {
      setLoading(false);
    }
  }, [
    apiFetch,
    token,
    page,
    pageSize,
    sortBy,
    sortDir,
    status,
    search,
    dateFrom,
    dateTo,
    type,
    paymentMethod,
  ]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const finalizedCount = useMemo(
    () => items.filter((i) => i.status === 'FINALIZED').length,
    [items],
  );
  const gross = useMemo(
    () =>
      items
        .filter((i) => i.status === 'FINALIZED' && i.type !== 'CREDIT_NOTE')
        .reduce((s, i) => s + Number(i.grandTotal || 0), 0),
    [items],
  );

  async function openDetail(id: string) {
    setSelectedId(id);
    setDetailLoading(true);
    setCopyKind('original');
    setActionMsg('');
    setDetail(null);
    setPrintData(null);
    try {
      const [d, pd] = await Promise.all([
        apiFetch<Record<string, unknown>>(token, `/invoices/${id}`),
        apiFetch<PrintInvoiceData>(
          token,
          `/invoices/${id}/print?copy=original&channel=desktop`,
        ),
      ]);
      setDetail(d);
      setPrintData(pd);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open invoice');
      closeDetail();
    } finally {
      setDetailLoading(false);
    }
  }

  function applySearch() {
    setPage(1);
    setSearch(searchDraft);
  }

  function clearFilters() {
    setStatus('ALL');
    setSearchDraft('');
    setSearch('');
    setDateFrom('');
    setDateTo('');
    setType('');
    setPaymentMethod('');
    setSortBy('createdAt');
    setSortDir('desc');
    setPage(1);
  }

  function applyPreset(kind: 'today' | '7d' | 'month') {
    const now = new Date();
    const to = ymd(now);
    let from = to;
    if (kind === '7d') {
      const d = new Date(now);
      d.setDate(d.getDate() - 6);
      from = ymd(d);
    } else if (kind === 'month') {
      from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    }
    setDateFrom(from);
    setDateTo(to);
    setPage(1);
  }

  const activeInvoiceId = String(detail?.id ?? selectedId ?? '');

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Billing history</h2>
          <p className="text-sm text-slate-500">
            Same filters as web — search, dates, type, payment, sort, and pagination. A4 GST
            preview matches web; Print / PDF opens a print-preview window (Print… or Save PDF).
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={`rounded px-3 py-1.5 text-sm ${view === 'table' ? 'bg-teal-700 text-white' : 'bg-slate-100'}`}
            onClick={() => setView('table')}
          >
            Table
          </button>
          <button
            type="button"
            className={`rounded px-3 py-1.5 text-sm ${view === 'cards' ? 'bg-teal-700 text-white' : 'bg-slate-100'}`}
            onClick={() => setView('cards')}
          >
            Cards
          </button>
          <button
            type="button"
            className="rounded bg-slate-100 px-3 py-1.5 text-sm"
            onClick={() => void load()}
          >
            Refresh
          </button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs text-slate-500">Matching</p>
          <p className="text-2xl font-semibold">{total}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs text-slate-500">Finalized in view</p>
          <p className="text-2xl font-semibold text-emerald-700">{finalizedCount}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3">
          <p className="text-xs text-slate-500">Gross billed (view)</p>
          <p className="text-2xl font-semibold">{inr(gross)}</p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-3">
        <div className="mb-3 flex flex-wrap gap-2">
          {STATUS_OPTIONS.map((s) => (
            <button
              key={s}
              type="button"
              className={`rounded px-3 py-1 text-sm ${status === s ? 'bg-teal-700 text-white' : 'bg-slate-100'}`}
              onClick={() => {
                setStatus(s);
                setPage(1);
              }}
            >
              {s === 'ALL' ? 'All' : s}
            </button>
          ))}
        </div>
        <div className="mb-3 flex flex-wrap gap-2">
          {PAYMENT_OPTIONS.map((p) => (
            <button
              key={p.value || 'all'}
              type="button"
              className={`rounded px-2.5 py-1 text-xs ${paymentMethod === p.value ? 'bg-teal-700 text-white' : 'bg-slate-100'}`}
              onClick={() => {
                setPaymentMethod(p.value);
                setPage(1);
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-6">
          <input
            className="rounded border border-slate-200 px-3 py-2 text-sm xl:col-span-2"
            placeholder="Invoice #, customer, phone, email, GSTIN…"
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') applySearch();
            }}
          />
          <input
            type="date"
            className="rounded border border-slate-200 px-3 py-2 text-sm"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              setPage(1);
            }}
          />
          <input
            type="date"
            className="rounded border border-slate-200 px-3 py-2 text-sm"
            value={dateTo}
            onChange={(e) => {
              setDateTo(e.target.value);
              setPage(1);
            }}
          />
          <select
            className="rounded border border-slate-200 px-3 py-2 text-sm"
            value={type}
            onChange={(e) => {
              setType(e.target.value);
              setPage(1);
            }}
          >
            {TYPE_OPTIONS.map((t) => (
              <option key={t.value || 'all'} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <select
            className="rounded border border-slate-200 px-3 py-2 text-sm"
            value={`${sortBy}:${sortDir}`}
            onChange={(e) => {
              const [by, dir] = e.target.value.split(':') as [string, 'asc' | 'desc'];
              setSortBy(by);
              setSortDir(dir);
              setPage(1);
            }}
          >
            <option value="createdAt:desc">Generated (newest)</option>
            <option value="createdAt:asc">Generated (oldest)</option>
            <option value="updatedAt:desc">Updated (newest)</option>
            <option value="updatedAt:asc">Updated (oldest)</option>
            <option value="grandTotal:desc">Amount (high)</option>
            <option value="grandTotal:asc">Amount (low)</option>
            <option value="invoiceNumber:asc">Invoice # A–Z</option>
            <option value="customer:asc">Customer A–Z</option>
          </select>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className="rounded bg-teal-700 px-3 py-1.5 text-sm text-white" onClick={applySearch}>
            Apply search
          </button>
          <button type="button" className="rounded bg-slate-100 px-3 py-1.5 text-sm" onClick={clearFilters}>
            Clear
          </button>
          <button type="button" className="rounded bg-slate-100 px-3 py-1.5 text-sm" onClick={() => applyPreset('today')}>
            Today
          </button>
          <button type="button" className="rounded bg-slate-100 px-3 py-1.5 text-sm" onClick={() => applyPreset('7d')}>
            Last 7 days
          </button>
          <button type="button" className="rounded bg-slate-100 px-3 py-1.5 text-sm" onClick={() => applyPreset('month')}>
            This month
          </button>
          <label className="ml-auto flex items-center gap-2 text-sm text-slate-600">
            Rows
            <select
              className="rounded border border-slate-200 px-2 py-1"
              value={pageSize}
              onChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(1);
              }}
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {error ? <p className="rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p> : null}

      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 bg-white">
        {loading ? (
          <p className="p-6 text-sm text-slate-500">Loading invoices…</p>
        ) : !items.length ? (
          <p className="p-6 text-sm text-slate-500">No invoices match these filters.</p>
        ) : view === 'cards' ? (
          <ul className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
            {items.map((inv) => (
              <li
                key={inv.id}
                role="button"
                tabIndex={0}
                className="cursor-pointer rounded-xl border border-slate-200 p-3 transition-colors hover:border-teal-300 hover:bg-slate-50/80"
                onClick={() => void openDetail(inv.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    void openDetail(inv.id);
                  }
                }}
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-mono text-sm font-semibold text-teal-800">{inv.invoiceNumber}</p>
                    <p className="text-xs text-slate-500">{typeLabel(inv.type)}</p>
                  </div>
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClass(inv.status)}`}>
                    {inv.status}
                  </span>
                </div>
                <p className="mt-2 font-medium">{inv.customer?.name || 'Walk-in'}</p>
                {inv.customer?.gstin ? (
                  <p className="text-xs text-slate-500">{inv.customer.gstin}</p>
                ) : null}
                <p className="text-xs text-slate-500">
                  {inv.customer?.phone || 'No phone'}
                  {inv.customer?.email ? ` · ${inv.customer.email}` : ''}
                </p>
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs text-slate-600">
                  <div>
                    <p className="text-[10px] uppercase text-slate-400">Generated</p>
                    {fmt(inv.createdAt)}
                  </div>
                  <div>
                    <p className="text-[10px] uppercase text-slate-400">Updated</p>
                    {fmt(inv.updatedAt || inv.createdAt)}
                  </div>
                </div>
                <div className="mt-3 flex items-center justify-between">
                  <p className="text-sm font-semibold">{inr(Number(inv.grandTotal))}</p>
                  <span className="rounded bg-teal-700 px-2.5 py-1 text-xs text-white">Open</span>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-2">Invoice</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Contact</th>
                <th className="px-3 py-2">Payments</th>
                <th className="px-3 py-2">Amount</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Generated</th>
                <th className="px-3 py-2">Updated</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((inv) => (
                <tr
                  key={inv.id}
                  role="button"
                  tabIndex={0}
                  className="cursor-pointer border-t border-slate-100 transition-colors hover:bg-slate-50/80"
                  onClick={() => void openDetail(inv.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      void openDetail(inv.id);
                    }
                  }}
                >
                  <td className="px-3 py-2">
                    <p className="font-mono font-medium text-teal-800">{inv.invoiceNumber}</p>
                    <p className="text-xs text-slate-500">{typeLabel(inv.type)}</p>
                  </td>
                  <td className="px-3 py-2">
                    <p>{inv.customer?.name || 'Walk-in'}</p>
                    {inv.customer?.gstin ? (
                      <p className="text-xs text-slate-500">{inv.customer.gstin}</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2">
                    <p className="text-sm">{inv.customer?.phone || '—'}</p>
                    <p className="text-xs text-slate-500">{inv.customer?.email || '—'}</p>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">
                    {inv.payments?.map((p) => p.method).join(', ') || '—'}
                  </td>
                  <td className="px-3 py-2 font-semibold">{inr(Number(inv.grandTotal))}</td>
                  <td className="px-3 py-2">
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${statusClass(inv.status)}`}>
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-slate-600">{fmt(inv.createdAt)}</td>
                  <td className="px-3 py-2 text-xs text-slate-600">{fmt(inv.updatedAt || inv.createdAt)}</td>
                  <td className="px-3 py-2">
                    <span className="rounded bg-teal-700 px-2.5 py-1 text-xs text-white">Open</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <p>
          Showing {total === 0 ? 0 : (page - 1) * pageSize + 1}–{Math.min(total, page * pageSize)} of {total}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={page <= 1}
            className="rounded bg-slate-100 px-3 py-1 disabled:opacity-40"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </button>
          <span className="px-2 py-1">
            {page} / {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages}
            className="rounded bg-slate-100 px-3 py-1 disabled:opacity-40"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          >
            Next
          </button>
        </div>
      </div>

      {selectedId ? (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'rgba(15,23,42,0.72)' }}>
          <div
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
            style={{ background: 'var(--rs-surface)', color: 'var(--rs-ink)' }}
          >
            {/* Compact toolbar — keep preview as tall as possible */}
            <div
              className="shrink-0 border-b px-3 py-2"
              style={{ borderColor: 'var(--rs-border)', background: 'var(--rs-surface-2)' }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="rs-btn-secondary inline-flex shrink-0 items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold"
                  onClick={closeDetail}
                  title="Back to invoices (Esc)"
                  aria-label="Back to invoices"
                >
                  <span aria-hidden>←</span>
                  Back
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <h3 className="truncate text-base font-semibold" style={{ color: 'var(--rs-ink)' }}>
                      {detailLoading
                        ? 'Loading invoice…'
                        : String(detail?.invoiceNumber ?? 'Invoice preview')}
                    </h3>
                    {!detailLoading && detail ? (
                      <span className="truncate text-xs" style={{ color: 'var(--rs-muted)' }}>
                        {String(detail.status ?? '')} · {inr(Number(detail.grandTotal ?? 0))} ·{' '}
                        {(detail.customer as { name?: string } | null)?.name || 'Walk-in'}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div
                  className="flex flex-wrap items-center gap-1 rounded-lg p-0.5"
                  style={{ background: 'var(--rs-bg-deep)' }}
                  role="group"
                  aria-label="Invoice copy"
                >
                  {COPY_OPTIONS.map((opt) => (
                    <button
                      key={opt.kind}
                      type="button"
                      disabled={detailLoading || !printData}
                      className="rounded-md px-2.5 py-1 text-xs font-medium disabled:opacity-40"
                      style={
                        copyKind === opt.kind
                          ? { background: 'var(--rs-accent)', color: 'var(--rs-on-accent)' }
                          : { color: 'var(--rs-muted)' }
                      }
                      onClick={() => setCopyKind(opt.kind)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>

                <button
                  type="button"
                  className="rs-btn-primary px-3 py-1.5 text-xs"
                  disabled={detailLoading || !printData || actionBusy}
                  onClick={() => void handlePrintPdf()}
                >
                  Print / PDF
                </button>
                <button
                  type="button"
                  className="rs-btn-secondary px-2.5 py-1.5 text-xs"
                  disabled={detailLoading || !activeInvoiceId || actionBusy}
                  onClick={() => void reprintThermal(activeInvoiceId)}
                >
                  Thermal
                </button>
                <button
                  type="button"
                  className="rs-btn-secondary px-2.5 py-1.5 text-xs"
                  disabled={detailLoading || !activeInvoiceId || actionBusy}
                  onClick={() => void sendWhatsapp(activeInvoiceId)}
                >
                  WhatsApp
                </button>
                <button
                  type="button"
                  className="rs-btn-secondary px-2.5 py-1.5 text-xs"
                  disabled={detailLoading || !activeInvoiceId || actionBusy}
                  onClick={() => void printWarranty(activeInvoiceId)}
                >
                  Warranty
                </button>
              </div>
              {actionMsg ? (
                <p className="mt-1.5 text-xs" style={{ color: 'var(--rs-muted)' }}>
                  {actionMsg}
                </p>
              ) : null}
            </div>

            <div
              className="relative min-h-0 flex-1"
              style={{ background: '#3f4450' }}
            >
              {detailLoading || !previewHtml ? (
                <p className="p-8 text-center text-sm text-slate-200">Loading A4 preview…</p>
              ) : (
                <iframe
                  title={`Invoice ${String(detail?.invoiceNumber ?? selectedId)} preview`}
                  className="absolute inset-0 h-full w-full border-0 bg-white"
                  srcDoc={previewHtml}
                  sandbox="allow-same-origin"
                />
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
