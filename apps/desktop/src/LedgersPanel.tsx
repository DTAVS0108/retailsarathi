import { useCallback, useEffect, useMemo, useState } from 'react';
import { getIndianFinancialYear } from '@retail-sarathi/gst-engine';
import {
  generateCreditAcknowledgementBothCopiesHtml,
  type InvoiceCopyKind,
  type PrintInvoiceData,
} from '@retail-sarathi/ui';
import type { ApiFetch } from './api';
import { applyExportDownload, ExportMenu, type ExportFormat, type ExportPayload } from './exportDownload';
import { buildA4Html, openSystemPrint } from './pos/invoicePrint';
import { ThemedSelect } from './ThemedSelect';
import { useToastMessage } from './toast';
import { documentKind, resolveUploadUrl } from './uploadUrl';

type LedgerTab = 'customers' | 'sell' | 'buy';

type PeriodPreset =
  | 'this_week'
  | 'last_week'
  | 'this_month'
  | 'last_month'
  | 'q1'
  | 'q2'
  | 'q3'
  | 'q4'
  | 'this_fy'
  | 'last_fy';

type PreviewMode = InvoiceCopyKind | 'acknowledgement';

const COPY_OPTIONS: Array<{ kind: InvoiceCopyKind; label: string }> = [
  { kind: 'original', label: 'Original' },
  { kind: 'duplicate', label: 'Duplicate' },
  { kind: 'triplicate', label: 'Triplicate' },
];

type CustomerAgingRow = {
  customerId: string | null;
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
  creditLimit?: number;
  advanceBalance?: number;
  loyaltyPoints?: number;
  whatsappOptIn?: boolean;
};

type RegisterRow = {
  id: string;
  sn: number;
  date: string;
  name: string;
  gstin: string | null;
  qty: number;
  invoiceNumber: string;
  taxAmount: number;
  cgst: number;
  sgst: number;
  totalTax: number;
  totalAmount: number;
  documentType?: string;
  customerId?: string | null;
  supplierId?: string | null;
};

type InvoiceDetail = {
  id: string;
  invoiceNumber: string;
  status?: string;
  notes?: string | null;
  grandTotal: number | string;
  createdAt?: string;
  payments?: Array<{ method: string; amount: number; reference?: string | null }>;
  lines?: Array<{
    productName: string;
    quantity: number | string;
    total: number | string;
    serialNumbers?: string[];
  }>;
  customer?: {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    gstin?: string | null;
    address?: string | null;
  } | null;
};

type PurchaseBillDetail = {
  id: string;
  invoiceNumber: string;
  status?: string;
  invoiceDate?: string | null;
  dueDate?: string | null;
  gstin?: string | null;
  placeOfSupply?: string | null;
  irn?: string | null;
  subtotal?: number | string;
  taxAmount?: number | string;
  cgstAmount?: number | string;
  sgstAmount?: number | string;
  igstAmount?: number | string;
  totalAmount?: number | string;
  paidAmount?: number | string;
  dueAmount?: number | string;
  balanceDue?: number | string;
  overdueDays?: number;
  agingBucket?: string;
  billImagePath?: string | null;
  billImageName?: string | null;
  billImageMime?: string | null;
  freeNotes?: string | null;
  supplierName?: string | null;
  supplier?: {
    id?: string;
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    gstin?: string | null;
    address?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    stateCode?: string | null;
    pincode?: string | null;
  } | null;
  createdBy?: { name?: string | null } | null;
  lines?: Array<{
    id: string;
    productName?: string | null;
    description?: string | null;
    sku?: string | null;
    quantity: number | string;
    unitCost?: number | string;
    unitPrice?: number | string;
    lineTotal?: number | string;
    hsnCode?: string | null;
    gstRate?: number | string | null;
    product?: { barcode?: string | null } | null;
  }>;
  allocations?: Array<{
    id: string;
    amount: number | string;
    payment?: {
      method?: string;
      paymentDate?: string;
      referenceNo?: string | null;
      amount?: number | string;
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
};

type RegisterLedger = {
  period?: { label?: string };
  summary: {
    billCount?: number;
    invoiceCount?: number;
    creditNoteCount?: number;
    totalQty?: number;
    totalAmount?: number;
    totalSales?: number;
    taxableAmount?: number;
    totalTax?: number;
    totalCgst?: number;
    totalSgst?: number;
    gstRate?: number | null;
    byGstSlab?: Array<{ gstRate: number; taxable: number; tax: number; totalAmount: number; count: number }>;
  };
  entries: RegisterRow[];
};

const DEFAULT_GST_SLABS = [0, 5, 12, 18, 28, 40];

const TABS: Array<{ id: LedgerTab; label: string }> = [
  { id: 'customers', label: 'Customer' },
  { id: 'sell', label: 'Sell' },
  { id: 'buy', label: 'Buy' },
];

const PERIOD_CHIPS: Array<[PeriodPreset, string]> = [
  ['this_week', 'Week'],
  ['last_week', 'Last wk'],
  ['this_month', 'Month'],
  ['last_month', 'Last mo'],
  ['q1', 'Q1'],
  ['q2', 'Q2'],
  ['q3', 'Q3'],
  ['q4', 'Q4'],
  ['this_fy', 'This FY'],
  ['last_fy', 'Last FY'],
];

function money(n: number | string | null | undefined) {
  return `₹${Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
}

function moneyCompact(n: number | string | null | undefined) {
  const v = Number(n || 0);
  if (Math.abs(v) >= 1e5) {
    return `₹${(v / 1e5).toLocaleString('en-IN', { maximumFractionDigits: 2 })}L`;
  }
  return money(v);
}

function fmtDate(v?: string | null) {
  if (!v) return '—';
  const d = new Date(v.includes('T') ? v : `${v}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

function fmtRange(from: string, to: string) {
  const a = new Date(`${from}T00:00:00`);
  const b = new Date(`${to}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return `${from} – ${to}`;
  const sameYear = a.getFullYear() === b.getFullYear();
  const left = a.toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
  const right = b.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
  return `${left} – ${right}`;
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

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = (x.getDay() + 6) % 7;
  x.setDate(x.getDate() - day);
  x.setHours(0, 0, 0, 0);
  return x;
}

function isoDate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function quarterRange(startYear: number, quarter: 1 | 2 | 3 | 4): { from: string; to: string } {
  if (quarter === 1) return { from: `${startYear}-04-01`, to: `${startYear}-06-30` };
  if (quarter === 2) return { from: `${startYear}-07-01`, to: `${startYear}-09-30` };
  if (quarter === 3) return { from: `${startYear}-10-01`, to: `${startYear}-12-31` };
  return { from: `${startYear + 1}-01-01`, to: `${startYear + 1}-03-31` };
}

function resolvePreset(preset: PeriodPreset): {
  from: string;
  to: string;
  fy?: string;
  quarter?: number;
  label: string;
} {
  const now = new Date();
  const fy = getIndianFinancialYear(now);
  const label = PERIOD_CHIPS.find(([id]) => id === preset)?.[1] ?? preset;
  if (preset === 'this_fy') {
    return { from: `${fy.startYear}-04-01`, to: `${fy.endYear}-03-31`, fy: fy.key, label: 'This FY' };
  }
  if (preset === 'last_fy') {
    const start = fy.startYear - 1;
    return { from: `${start}-04-01`, to: `${start + 1}-03-31`, fy: `${start}-${start + 1}`, label: 'Last FY' };
  }
  if (preset === 'q1' || preset === 'q2' || preset === 'q3' || preset === 'q4') {
    const q = Number(preset.slice(1)) as 1 | 2 | 3 | 4;
    return { ...quarterRange(fy.startYear, q), fy: fy.key, quarter: q, label: `Q${q}` };
  }
  if (preset === 'this_month') {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { from: isoDate(from), to: isoDate(to), label: 'This month' };
  }
  if (preset === 'last_month') {
    const from = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const to = new Date(now.getFullYear(), now.getMonth(), 0);
    return { from: isoDate(from), to: isoDate(to), label: 'Last month' };
  }
  if (preset === 'this_week') {
    return { from: isoDate(startOfWeek(now)), to: isoDate(now), label: 'This week' };
  }
  const thisMon = startOfWeek(now);
  const lastMon = new Date(thisMon);
  lastMon.setDate(lastMon.getDate() - 7);
  const lastSun = new Date(thisMon);
  lastSun.setDate(lastSun.getDate() - 1);
  return { from: isoDate(lastMon), to: isoDate(lastSun), label: 'Last week' };
}

function qs(params: Record<string, string | undefined>) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) sp.set(k, v);
  }
  return sp.toString();
}

function StatTile({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: 'muted' | 'accent' | 'danger';
}) {
  const color =
    tone === 'danger'
      ? 'var(--rs-danger, #b91c1c)'
      : tone === 'accent'
        ? 'var(--rs-accent)'
        : 'var(--rs-ink)';
  return (
    <div
      className="min-w-[7.5rem] flex-1 rounded-lg px-3 py-2"
      style={{ background: 'var(--rs-surface-2)', border: '1px solid var(--rs-border)' }}
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide" style={{ color: 'var(--rs-muted)' }}>
        {label}
      </p>
      <p className="mt-0.5 text-base font-semibold tabular-nums leading-tight" style={{ color }}>
        {value}
      </p>
    </div>
  );
}

function creditSummaryFromInvoice(invoice: InvoiceDetail) {
  const payments = invoice.payments ?? [];
  const creditPending = payments
    .filter((p) => p.method === 'CREDIT')
    .reduce((s, p) => s + Number(p.amount || 0), 0);
  if (creditPending <= 0.009) return null;
  const amountPaid = payments
    .filter((p) => p.method !== 'CREDIT')
    .reduce((s, p) => s + Number(p.amount || 0), 0);
  return {
    creditPending,
    amountPaid,
    grandTotal: Number(invoice.grandTotal || 0),
  };
}

function buildAckHtml(invoice: InvoiceDetail, printData: PrintInvoiceData) {
  const credit = creditSummaryFromInvoice(invoice);
  if (!credit) return null;
  return generateCreditAcknowledgementBothCopiesHtml({
    shopName: printData.shopName,
    shopAddress: printData.shopAddress,
    gstin: printData.gstin,
    shopPhone: printData.shopPhone,
    shopEmail: printData.shopEmail,
    invoiceNumber: invoice.invoiceNumber,
    date: printData.date || fmtDate(invoice.createdAt),
    customerName: invoice.customer?.name ?? printData.customerName,
    customerPhone: invoice.customer?.phone ?? printData.customerPhone,
    customerGstin: invoice.customer?.gstin ?? undefined,
    customerAddress: invoice.customer?.address ?? printData.customerAddress,
    grandTotal: credit.grandTotal,
    amountPaid: credit.amountPaid,
    amountPending: credit.creditPending,
    payments: (invoice.payments ?? []).map((p) => ({
      method: p.method,
      amount: Number(p.amount || 0),
      reference: p.reference ?? undefined,
    })),
    lines: (invoice.lines ?? []).map((l) => ({
      name: l.productName,
      qty: Number(l.quantity || 0),
      amount: Number(l.total || 0),
      serialNumbers: l.serialNumbers,
    })),
    notes: invoice.notes ?? undefined,
  });
}

function RegisterTable({
  rows,
  onOpenDocument,
}: {
  rows: RegisterRow[];
  onOpenDocument: (row: RegisterRow) => void;
}) {
  const totals = useMemo(() => {
    return rows.reduce(
      (acc, r) => ({
        qty: acc.qty + Number(r.qty || 0),
        taxAmount: acc.taxAmount + Number(r.taxAmount || 0),
        cgst: acc.cgst + Number(r.cgst || 0),
        sgst: acc.sgst + Number(r.sgst || 0),
        totalTax: acc.totalTax + Number(r.totalTax || 0),
        totalAmount: acc.totalAmount + Number(r.totalAmount || 0),
      }),
      { qty: 0, taxAmount: 0, cgst: 0, sgst: 0, totalTax: 0, totalAmount: 0 },
    );
  }, [rows]);

  if (!rows.length) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-12 text-sm" style={{ color: 'var(--rs-muted)' }}>
        No entries in this period.
      </div>
    );
  }

  const th = 'sticky top-0 z-[1] px-2.5 py-2 text-[11px] font-semibold uppercase tracking-wide whitespace-nowrap';
  const td = 'px-2.5 py-2 align-middle';

  return (
    <div className="min-h-0 flex-1 overflow-auto">
      <table className="w-full min-w-[980px] border-collapse text-sm">
        <thead>
          <tr style={{ background: 'var(--rs-surface-2)', color: 'var(--rs-muted)', boxShadow: 'inset 0 -1px 0 var(--rs-border)' }}>
            <th className={`${th} text-left w-10`}>#</th>
            <th className={`${th} text-left`}>Date</th>
            <th className={`${th} text-left`}>Name</th>
            <th className={`${th} text-left`}>GSTIN</th>
            <th className={`${th} text-left`}>Invoice</th>
            <th className={`${th} text-right`}>Qty</th>
            <th className={`${th} text-right`}>Taxable</th>
            <th className={`${th} text-right`}>CGST</th>
            <th className={`${th} text-right`}>SGST</th>
            <th className={`${th} text-right`}>Tax</th>
            <th className={`${th} text-right`}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr
              key={row.id}
              className="border-t transition-colors hover:bg-black/[0.03]"
              style={{
                borderColor: 'var(--rs-border)',
                background: i % 2 === 1 ? 'color-mix(in srgb, var(--rs-surface-2) 55%, transparent)' : undefined,
              }}
            >
              <td className={`${td} tabular-nums text-xs`} style={{ color: 'var(--rs-muted)' }}>
                {row.sn}
              </td>
              <td className={`${td} whitespace-nowrap tabular-nums`}>{fmtDate(row.date)}</td>
              <td className={`${td} font-medium leading-snug`} style={{ color: 'var(--rs-ink)' }}>
                {row.name}
              </td>
              <td className={`${td} font-mono text-[11px]`} style={{ color: 'var(--rs-muted)' }}>
                {row.gstin || '—'}
              </td>
              <td className={`${td} whitespace-nowrap`}>
                {row.invoiceNumber ? (
                  <button
                    type="button"
                    className="font-semibold underline-offset-2 hover:underline"
                    style={{ color: 'var(--rs-accent)' }}
                    title="Open invoice"
                    onClick={() => onOpenDocument(row)}
                  >
                    {row.invoiceNumber}
                  </button>
                ) : (
                  '—'
                )}
              </td>
              <td className={`${td} text-right tabular-nums`}>{row.qty}</td>
              <td className={`${td} text-right tabular-nums`}>{money(row.taxAmount)}</td>
              <td className={`${td} text-right tabular-nums`} style={{ color: 'var(--rs-muted)' }}>
                {money(row.cgst)}
              </td>
              <td className={`${td} text-right tabular-nums`} style={{ color: 'var(--rs-muted)' }}>
                {money(row.sgst)}
              </td>
              <td className={`${td} text-right tabular-nums`}>{money(row.totalTax)}</td>
              <td
                className={`${td} text-right font-semibold tabular-nums ${row.totalAmount < 0 ? 'text-amber-700' : ''}`}
              >
                {money(row.totalAmount)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr
            className="sticky bottom-0 border-t-2 font-semibold"
            style={{
              borderColor: 'var(--rs-border)',
              background: 'var(--rs-surface)',
              boxShadow: '0 -6px 12px rgba(15, 47, 44, 0.06)',
            }}
          >
            <td className={td} colSpan={5}>
              Total · {rows.length} {rows.length === 1 ? 'entry' : 'entries'}
            </td>
            <td className={`${td} text-right tabular-nums`}>{totals.qty}</td>
            <td className={`${td} text-right tabular-nums`}>{money(totals.taxAmount)}</td>
            <td className={`${td} text-right tabular-nums`}>{money(totals.cgst)}</td>
            <td className={`${td} text-right tabular-nums`}>{money(totals.sgst)}</td>
            <td className={`${td} text-right tabular-nums`}>{money(totals.totalTax)}</td>
            <td className={`${td} text-right tabular-nums`} style={{ color: 'var(--rs-accent)' }}>
              {money(totals.totalAmount)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

export function LedgersPanel({
  token,
  apiFetch,
  onOpenKhata,
  invoiceTemplateId = 'classic',
  apiUrl = 'http://localhost:4000/api/v1',
}: {
  token: string;
  apiFetch: ApiFetch;
  onOpenKhata?: () => void;
  invoiceTemplateId?: string;
  apiUrl?: string;
}) {
  const [tab, setTab] = useState<LedgerTab>('customers');
  const [preset, setPreset] = useState<PeriodPreset>('this_month');
  const [period, setPeriod] = useState(() => resolvePreset('this_month'));
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState('');
  const [okMsg, setOkMsg] = useState('');
  useToastMessage(error, 'error', setError);
  useToastMessage(okMsg, 'success', setOkMsg);
  const [customers, setCustomers] = useState<CustomerAgingRow[]>([]);
  const [sell, setSell] = useState<RegisterLedger | null>(null);
  const [buy, setBuy] = useState<RegisterLedger | null>(null);
  const [gstRate, setGstRate] = useState<string>('all');

  const [docKind, setDocKind] = useState<'sell' | 'buy' | null>(null);
  const [docLoading, setDocLoading] = useState(false);
  const [invoiceDetail, setInvoiceDetail] = useState<InvoiceDetail | null>(null);
  const [printData, setPrintData] = useState<PrintInvoiceData | null>(null);
  const [previewMode, setPreviewMode] = useState<PreviewMode>('original');
  const [purchaseDetail, setPurchaseDetail] = useState<PurchaseBillDetail | null>(null);
  const [printBusy, setPrintBusy] = useState(false);
  const [attachmentOpen, setAttachmentOpen] = useState(false);

  const applyPreset = useCallback((id: PeriodPreset) => {
    setPreset(id);
    setPeriod(resolvePreset(id));
  }, []);

  const periodQuery = useMemo(() => {
    if (period.fy && period.quarter) return qs({ fy: period.fy, quarter: String(period.quarter) });
    if (period.fy) return qs({ fy: period.fy });
    return qs({ from: period.from, to: period.to });
  }, [period]);

  const ledgerQuery = useMemo(() => {
    if (gstRate === 'all') return periodQuery;
    return `${periodQuery}&gstRate=${encodeURIComponent(gstRate)}`;
  }, [periodQuery, gstRate]);

  const exportCurrent = useCallback(
    async (format: ExportFormat) => {
      setExporting(true);
      setError('');
      setOkMsg('');
      try {
        let path = '';
        if (tab === 'customers') path = `/reports/receivables?format=${format}`;
        else if (tab === 'sell') {
          path = `/reports/sell?${periodQuery}&format=${format}`;
          if (gstRate !== 'all') path += `&gstRate=${encodeURIComponent(gstRate)}`;
        } else {
          path = `/reports/buy?${periodQuery}&format=${format}`;
          if (gstRate !== 'all') path += `&gstRate=${encodeURIComponent(gstRate)}`;
        }

        const data = await apiFetch<ExportPayload>(token, path);
        const msg = await applyExportDownload(format, data);
        setOkMsg(msg);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Export failed');
      } finally {
        setExporting(false);
      }
    },
    [apiFetch, token, tab, periodQuery, gstRate],
  );

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError('');
      try {
        const [cust, sale, buyRes] = await Promise.all([
          apiFetch<CustomerAgingRow[]>(token, '/customers/aging/report').catch(() => [] as CustomerAgingRow[]),
          apiFetch<RegisterLedger>(token, `/analytics/sale-ledger?${ledgerQuery}`).catch(() => null),
          apiFetch<RegisterLedger>(token, `/analytics/buy-ledger?${ledgerQuery}`).catch(() => null),
        ]);
        setCustomers(Array.isArray(cust) ? cust.filter((r) => Number(r.outstanding) > 0.009) : []);
        setSell(sale);
        setBuy(buyRes);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load ledgers');
      } finally {
        setLoading(false);
      }
    })();
  }, [apiFetch, token, ledgerQuery]);

  const closeDocument = useCallback(() => {
    setDocKind(null);
    setInvoiceDetail(null);
    setPrintData(null);
    setPurchaseDetail(null);
    setPreviewMode('original');
    setDocLoading(false);
    setAttachmentOpen(false);
  }, []);

  const openDocument = useCallback(
    async (row: RegisterRow) => {
      if (!row.id) return;
      setDocLoading(true);
      setError('');
      setPreviewMode('original');
      setInvoiceDetail(null);
      setPrintData(null);
      setPurchaseDetail(null);

      if (tab === 'buy') {
        setDocKind('buy');
        try {
          const bill = await apiFetch<PurchaseBillDetail>(token, `/purchase-bills/${row.id}`);
          setPurchaseDetail(bill);
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Failed to open purchase bill');
          closeDocument();
        } finally {
          setDocLoading(false);
        }
        return;
      }

      setDocKind('sell');
      try {
        const [detail, pd] = await Promise.all([
          apiFetch<InvoiceDetail>(token, `/invoices/${row.id}`),
          apiFetch<PrintInvoiceData>(
            token,
            `/invoices/${row.id}/print?copy=original&channel=desktop`,
          ),
        ]);
        setInvoiceDetail(detail);
        setPrintData(pd);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to open invoice');
        closeDocument();
      } finally {
        setDocLoading(false);
      }
    },
    [apiFetch, token, tab, closeDocument],
  );

  useEffect(() => {
    if (!docKind && !attachmentOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (attachmentOpen) {
        setAttachmentOpen(false);
        return;
      }
      closeDocument();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [docKind, attachmentOpen, closeDocument]);

  const attachmentUrl = useMemo(
    () => resolveUploadUrl(apiUrl, purchaseDetail?.billImagePath),
    [apiUrl, purchaseDetail?.billImagePath],
  );
  const attachmentKind = useMemo(
    () =>
      attachmentUrl
        ? documentKind(attachmentUrl, purchaseDetail?.billImageMime, purchaseDetail?.billImageName)
        : 'other',
    [attachmentUrl, purchaseDetail?.billImageMime, purchaseDetail?.billImageName],
  );

  const hasAcknowledgement = Boolean(invoiceDetail && creditSummaryFromInvoice(invoiceDetail));

  const previewHtml = useMemo(() => {
    if (!printData || !invoiceDetail) return '';
    if (previewMode === 'acknowledgement') {
      return buildAckHtml(invoiceDetail, printData) ?? '';
    }
    return buildA4Html(printData, invoiceTemplateId, previewMode);
  }, [printData, invoiceDetail, previewMode, invoiceTemplateId]);

  async function handlePrintPreview() {
    if (!previewHtml) return;
    setPrintBusy(true);
    try {
      const err = await openSystemPrint(previewHtml);
      if (err) setError(err);
    } finally {
      setPrintBusy(false);
    }
  }

  const customerTotal = useMemo(
    () => customers.reduce((s, r) => s + Number(r.outstanding || 0), 0),
    [customers],
  );

  const active = tab === 'sell' ? sell : buy;
  const rangeLabel = fmtRange(period.from, period.to);
  const gstSlabOptions = useMemo(() => {
    const fromData = [
      ...(sell?.summary?.byGstSlab?.map((s) => s.gstRate) ?? []),
      ...(buy?.summary?.byGstSlab?.map((s) => s.gstRate) ?? []),
    ];
    const rates = Array.from(new Set([...DEFAULT_GST_SLABS, ...fromData])).sort((a, b) => a - b);
    return [
      { value: 'all', label: 'All slabs' },
      ...rates.map((rate) => ({ value: String(rate), label: `${rate}%` })),
    ];
  }, [sell, buy]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-3" style={{ background: 'var(--rs-bg-deep)' }}>
      {/* Top bar: title + module tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-semibold leading-tight" style={{ color: 'var(--rs-ink)' }}>
            Ledgers
          </h1>
          <p className="text-[11px]" style={{ color: 'var(--rs-muted)' }}>
            Udhaar · sell register · buy register
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportMenu exporting={exporting} onExport={(f) => void exportCurrent(f)} />
          <div
            className="inline-flex rounded-xl p-1"
            style={{ background: 'var(--rs-surface)', border: '1px solid var(--rs-border)' }}
            role="tablist"
          >
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className="rounded-lg px-3.5 py-1.5 text-sm font-semibold transition"
                style={
                  tab === t.id
                    ? { background: 'var(--rs-accent)', color: 'var(--rs-on-accent, #fff)' }
                    : { color: 'var(--rs-muted)' }
                }
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Period + GST slab toolbar (sell / buy only) */}
      {(tab === 'sell' || tab === 'buy') && (
        <div
          className="flex flex-wrap items-center gap-2 rounded-xl px-3 py-2"
          style={{ background: 'var(--rs-surface)', border: '1px solid var(--rs-border)' }}
        >
          <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--rs-muted)' }}>
            Period
          </span>
          <div className="flex min-w-0 flex-1 flex-wrap gap-1">
            {PERIOD_CHIPS.map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => applyPreset(id)}
                className="rounded-full px-2.5 py-1 text-xs font-semibold transition"
                style={
                  preset === id
                    ? {
                        background: 'color-mix(in srgb, var(--rs-accent) 18%, transparent)',
                        color: 'var(--rs-accent)',
                        boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--rs-accent) 45%, transparent)',
                      }
                    : { color: 'var(--rs-muted)' }
                }
              >
                {label}
              </button>
            ))}
          </div>
          <span
            className="rounded-full px-2.5 py-1 text-[11px] font-medium tabular-nums"
            style={{ background: 'var(--rs-surface-2)', color: 'var(--rs-ink)' }}
            title={`${period.from} → ${period.to}`}
          >
            {rangeLabel}
          </span>
          <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: 'var(--rs-muted)' }}>
            GST
          </span>
          <ThemedSelect
            aria-label="GST slab"
            className="min-w-[7.5rem]"
            triggerClassName="text-xs py-1.5"
            value={gstRate}
            options={gstSlabOptions}
            onChange={setGstRate}
          />
        </div>
      )}

      {loading ? (
        <div className="flex flex-1 items-center justify-center text-sm" style={{ color: 'var(--rs-muted)' }}>
          Loading ledgers…
        </div>
      ) : tab === 'customers' ? (
        <section className="rs-card flex min-h-0 flex-1 flex-col overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: 'var(--rs-border)' }}>
            <div>
              <h2 className="text-sm font-semibold" style={{ color: 'var(--rs-ink)' }}>
                Customer udhaar
              </h2>
              <p className="text-[11px]" style={{ color: 'var(--rs-muted)' }}>
                Open balances — collect from Khata
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatTile label="Receivable" value={moneyCompact(customerTotal)} tone="danger" />
              <StatTile label="Parties" value={String(customers.length)} />
              {onOpenKhata ? (
                <button type="button" className="rs-btn-secondary text-sm" onClick={onOpenKhata}>
                  Open Khata
                </button>
              ) : null}
            </div>
          </div>
          {!customers.length ? (
            <p className="px-4 py-10 text-center text-sm" style={{ color: 'var(--rs-muted)' }}>
              No open customer dues.
            </p>
          ) : (
            <div className="min-h-0 flex-1 overflow-auto">
              <table className="w-full min-w-[860px] text-left text-sm">
                <thead>
                  <tr
                    className="sticky top-0 z-[1] text-[11px] font-semibold uppercase tracking-wide"
                    style={{ background: 'var(--rs-surface-2)', color: 'var(--rs-muted)', boxShadow: 'inset 0 -1px 0 var(--rs-border)' }}
                  >
                    <th className="px-3 py-2">Customer</th>
                    <th className="px-2 py-2">Contact</th>
                    <th className="px-2 py-2">Address</th>
                    <th className="px-2 py-2 text-right">Limit</th>
                    <th className="px-3 py-2 text-right">Outstanding</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.slice(0, 50).map((row, i) => {
                    const addr = formatAddress(row);
                    return (
                      <tr
                        key={row.customerId || row.name}
                        className="border-t"
                        style={{
                          borderColor: 'var(--rs-border)',
                          background: i % 2 === 1 ? 'color-mix(in srgb, var(--rs-surface-2) 55%, transparent)' : undefined,
                        }}
                      >
                        <td className="px-3 py-2 align-top">
                          <div className="font-medium" style={{ color: 'var(--rs-ink)' }}>
                            {row.name}
                          </div>
                          <div className="mt-0.5 flex flex-wrap gap-1 text-[10px]">
                            {row.gstin ? (
                              <span className="font-mono" style={{ color: 'var(--rs-muted)' }}>
                                {row.gstin}
                              </span>
                            ) : null}
                            {row.segment ? (
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-600">
                                {row.segment}
                              </span>
                            ) : null}
                            {row.whatsappOptIn ? (
                              <span className="rounded bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-700">
                                WA
                              </span>
                            ) : null}
                          </div>
                        </td>
                        <td className="px-2 py-2 align-top">
                          <div>{row.phone || '—'}</div>
                          {row.email ? (
                            <div className="text-xs" style={{ color: 'var(--rs-muted)' }}>
                              {row.email}
                            </div>
                          ) : null}
                        </td>
                        <td className="max-w-[240px] px-2 py-2 align-top text-xs" style={{ color: 'var(--rs-muted)' }}>
                          {addr || '—'}
                        </td>
                        <td className="px-2 py-2 align-top text-right tabular-nums">
                          <div>{money(row.creditLimit)}</div>
                          {Number(row.advanceBalance) > 0.009 ? (
                            <div className="text-[10px] text-teal-700">Adv {money(row.advanceBalance)}</div>
                          ) : null}
                        </td>
                        <td className="px-3 py-2 align-top text-right font-semibold tabular-nums text-rose-700">
                          {money(row.outstanding)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      ) : (
        <section className="rs-card flex min-h-0 flex-1 flex-col overflow-hidden p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3" style={{ borderColor: 'var(--rs-border)' }}>
            <div>
              <h2 className="text-sm font-semibold" style={{ color: 'var(--rs-ink)' }}>
                {tab === 'sell' ? 'Sell register' : 'Buy register'}
              </h2>
              <p className="text-[11px]" style={{ color: 'var(--rs-muted)' }}>
                {period.label} · {rangeLabel}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <StatTile
                label="Total"
                value={moneyCompact(active?.summary.totalAmount ?? active?.summary.totalSales ?? 0)}
                tone="accent"
              />
              <StatTile
                label={tab === 'sell' ? 'Invoices' : 'Bills'}
                value={String(
                  tab === 'sell'
                    ? (active?.summary.invoiceCount ?? active?.entries?.length ?? 0)
                    : (active?.summary.billCount ?? active?.entries?.length ?? 0),
                )}
              />
              <StatTile
                label={tab === 'sell' ? 'Returns' : 'Qty'}
                value={
                  tab === 'sell'
                    ? String(active?.summary.creditNoteCount ?? 0)
                    : String(active?.summary.totalQty ?? 0)
                }
              />
              {tab === 'buy' && onOpenKhata ? (
                <button type="button" className="rs-btn-secondary text-sm" onClick={onOpenKhata}>
                  Khata
                </button>
              ) : null}
            </div>
          </div>
          <RegisterTable rows={active?.entries ?? []} onOpenDocument={(row) => void openDocument(row)} />
        </section>
      )}

      {docKind === 'sell' ? (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'rgba(15,23,42,0.72)' }}>
          <div
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
            style={{ background: 'var(--rs-surface)', color: 'var(--rs-ink)' }}
          >
            <div
              className="shrink-0 border-b px-3 py-2"
              style={{ borderColor: 'var(--rs-border)', background: 'var(--rs-surface-2)' }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="rs-btn-secondary inline-flex shrink-0 items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold"
                  onClick={closeDocument}
                  title="Back to ledgers (Esc)"
                >
                  ← Back
                </button>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <h3 className="truncate text-base font-semibold">
                      {docLoading
                        ? 'Loading invoice…'
                        : invoiceDetail?.invoiceNumber ?? 'Invoice preview'}
                    </h3>
                    {!docLoading && invoiceDetail ? (
                      <span className="truncate text-xs" style={{ color: 'var(--rs-muted)' }}>
                        {invoiceDetail.status ?? ''} · {money(invoiceDetail.grandTotal)} ·{' '}
                        {invoiceDetail.customer?.name || 'Walk-in'}
                        {invoiceDetail.customer?.phone ? ` · ${invoiceDetail.customer.phone}` : ''}
                        {invoiceDetail.customer?.email ? ` · ${invoiceDetail.customer.email}` : ''}
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
                      disabled={docLoading || !printData}
                      className="rounded-md px-2.5 py-1 text-xs font-medium disabled:opacity-40"
                      style={
                        previewMode === opt.kind
                          ? { background: 'var(--rs-accent)', color: 'var(--rs-on-accent)' }
                          : { color: 'var(--rs-muted)' }
                      }
                      onClick={() => setPreviewMode(opt.kind)}
                    >
                      {opt.label}
                    </button>
                  ))}
                  {hasAcknowledgement ? (
                    <button
                      type="button"
                      disabled={docLoading || !printData}
                      className="rounded-md px-2.5 py-1 text-xs font-medium disabled:opacity-40"
                      style={
                        previewMode === 'acknowledgement'
                          ? { background: 'var(--rs-accent)', color: 'var(--rs-on-accent)' }
                          : { color: 'var(--rs-muted)' }
                      }
                      onClick={() => setPreviewMode('acknowledgement')}
                    >
                      Acknowledgement
                    </button>
                  ) : null}
                </div>

                <button
                  type="button"
                  className="rs-btn-primary px-3 py-1.5 text-xs"
                  disabled={docLoading || !previewHtml || printBusy}
                  onClick={() => void handlePrintPreview()}
                >
                  Print / PDF
                </button>
              </div>
            </div>

            <div className="relative min-h-0 flex-1" style={{ background: '#3f4450' }}>
              {docLoading || !previewHtml ? (
                <p className="p-8 text-center text-sm text-slate-200">
                  {docLoading ? 'Loading A4 preview…' : 'Preview unavailable'}
                </p>
              ) : (
                <iframe
                  title={`Invoice ${invoiceDetail?.invoiceNumber ?? ''} preview`}
                  className="absolute inset-0 h-full w-full border-0 bg-white"
                  srcDoc={previewHtml}
                  sandbox="allow-same-origin"
                />
              )}
            </div>
          </div>
        </div>
      ) : null}

      {docKind === 'buy' ? (
        <div className="fixed inset-0 z-50 flex flex-col" style={{ background: 'rgba(15,23,42,0.72)' }}>
          <div
            className="flex min-h-0 flex-1 flex-col overflow-hidden"
            style={{ background: 'var(--rs-surface)', color: 'var(--rs-ink)' }}
          >
            <div
              className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2"
              style={{ borderColor: 'var(--rs-border)', background: 'var(--rs-surface-2)' }}
            >
              <button
                type="button"
                className="rs-btn-secondary inline-flex shrink-0 items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold"
                onClick={closeDocument}
                title="Back to ledgers (Esc)"
              >
                ← Back
              </button>
              <div className="min-w-0 flex-1">
                <h3 className="truncate text-base font-semibold">
                  {docLoading ? 'Loading…' : purchaseDetail?.invoiceNumber ?? 'Purchase bill'}
                </h3>
                <p className="truncate text-xs" style={{ color: 'var(--rs-muted)' }}>
                  {[
                    purchaseDetail?.supplier?.name || purchaseDetail?.supplierName,
                    purchaseDetail?.status,
                    purchaseDetail ? money(purchaseDetail.totalAmount) : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
              {attachmentUrl ? (
                <>
                  <button
                    type="button"
                    className="rs-btn-primary px-3 py-1.5 text-xs"
                    onClick={() => setAttachmentOpen(true)}
                  >
                    View attachment
                  </button>
                  <a
                    className="rs-btn-secondary px-3 py-1.5 text-xs"
                    href={attachmentUrl}
                    download={purchaseDetail?.billImageName || 'purchase-bill'}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Download
                  </a>
                </>
              ) : null}
            </div>

            <div className="min-h-0 flex-1 overflow-auto p-4">
              {docLoading ? (
                <p className="text-sm" style={{ color: 'var(--rs-muted)' }}>
                  Loading purchase bill…
                </p>
              ) : purchaseDetail ? (
                <div className="mx-auto grid max-w-6xl gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                  <div className="space-y-4">
                    <section className="rounded-xl border p-4" style={{ borderColor: 'var(--rs-border)' }}>
                      <h4
                        className="mb-3 text-[10px] font-bold uppercase tracking-wider"
                        style={{ color: 'var(--rs-muted)' }}
                      >
                        Supplier details
                      </h4>
                      <dl className="grid gap-2 sm:grid-cols-2 text-sm">
                        <div>
                          <dt className="text-[10px] uppercase" style={{ color: 'var(--rs-muted)' }}>
                            Name
                          </dt>
                          <dd className="font-semibold">
                            {purchaseDetail.supplier?.name || purchaseDetail.supplierName || '—'}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-[10px] uppercase" style={{ color: 'var(--rs-muted)' }}>
                            Phone
                          </dt>
                          <dd>{purchaseDetail.supplier?.phone || '—'}</dd>
                        </div>
                        <div>
                          <dt className="text-[10px] uppercase" style={{ color: 'var(--rs-muted)' }}>
                            Email
                          </dt>
                          <dd className="break-all">{purchaseDetail.supplier?.email || '—'}</dd>
                        </div>
                        <div>
                          <dt className="text-[10px] uppercase" style={{ color: 'var(--rs-muted)' }}>
                            GSTIN
                          </dt>
                          <dd className="font-mono text-xs">
                            {purchaseDetail.gstin || purchaseDetail.supplier?.gstin || '—'}
                          </dd>
                        </div>
                        <div className="sm:col-span-2">
                          <dt className="text-[10px] uppercase" style={{ color: 'var(--rs-muted)' }}>
                            Address
                          </dt>
                          <dd>
                            {formatAddress(purchaseDetail.supplier ?? {}) || '—'}
                          </dd>
                        </div>
                      </dl>
                    </section>

                    <section className="rounded-xl border p-4" style={{ borderColor: 'var(--rs-border)' }}>
                      <h4
                        className="mb-3 text-[10px] font-bold uppercase tracking-wider"
                        style={{ color: 'var(--rs-muted)' }}
                      >
                        Invoice details
                      </h4>
                      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <div className="rounded-lg p-2.5" style={{ background: 'var(--rs-surface-2)' }}>
                          <p className="text-[10px] uppercase" style={{ color: 'var(--rs-muted)' }}>
                            Total
                          </p>
                          <p className="text-base font-bold" style={{ color: 'var(--rs-accent)' }}>
                            {money(purchaseDetail.totalAmount)}
                          </p>
                        </div>
                        <div className="rounded-lg p-2.5" style={{ background: 'var(--rs-surface-2)' }}>
                          <p className="text-[10px] uppercase" style={{ color: 'var(--rs-muted)' }}>
                            Paid
                          </p>
                          <p className="text-base font-bold">{money(purchaseDetail.paidAmount)}</p>
                        </div>
                        <div className="rounded-lg p-2.5" style={{ background: 'var(--rs-surface-2)' }}>
                          <p className="text-[10px] uppercase" style={{ color: 'var(--rs-muted)' }}>
                            Balance due
                          </p>
                          <p className="text-base font-bold">
                            {money(purchaseDetail.dueAmount ?? purchaseDetail.balanceDue)}
                          </p>
                        </div>
                        <div className="rounded-lg p-2.5" style={{ background: 'var(--rs-surface-2)' }}>
                          <p className="text-[10px] uppercase" style={{ color: 'var(--rs-muted)' }}>
                            Status
                          </p>
                          <p className="text-base font-bold">{purchaseDetail.status || '—'}</p>
                        </div>
                      </div>
                      <dl className="grid gap-2 sm:grid-cols-2 text-sm">
                        <div className="flex justify-between gap-2 border-b py-1.5" style={{ borderColor: 'var(--rs-border)' }}>
                          <dt style={{ color: 'var(--rs-muted)' }}>Invoice date</dt>
                          <dd>{fmtDate(purchaseDetail.invoiceDate)}</dd>
                        </div>
                        <div className="flex justify-between gap-2 border-b py-1.5" style={{ borderColor: 'var(--rs-border)' }}>
                          <dt style={{ color: 'var(--rs-muted)' }}>Due date</dt>
                          <dd>{fmtDate(purchaseDetail.dueDate)}</dd>
                        </div>
                        <div className="flex justify-between gap-2 border-b py-1.5" style={{ borderColor: 'var(--rs-border)' }}>
                          <dt style={{ color: 'var(--rs-muted)' }}>Taxable</dt>
                          <dd>{money(purchaseDetail.subtotal)}</dd>
                        </div>
                        <div className="flex justify-between gap-2 border-b py-1.5" style={{ borderColor: 'var(--rs-border)' }}>
                          <dt style={{ color: 'var(--rs-muted)' }}>CGST / SGST</dt>
                          <dd>
                            {money(purchaseDetail.cgstAmount)} / {money(purchaseDetail.sgstAmount)}
                          </dd>
                        </div>
                        <div className="flex justify-between gap-2 border-b py-1.5" style={{ borderColor: 'var(--rs-border)' }}>
                          <dt style={{ color: 'var(--rs-muted)' }}>IGST</dt>
                          <dd>{money(purchaseDetail.igstAmount)}</dd>
                        </div>
                        <div className="flex justify-between gap-2 border-b py-1.5" style={{ borderColor: 'var(--rs-border)' }}>
                          <dt style={{ color: 'var(--rs-muted)' }}>Total tax</dt>
                          <dd>{money(purchaseDetail.taxAmount)}</dd>
                        </div>
                        <div className="flex justify-between gap-2 border-b py-1.5" style={{ borderColor: 'var(--rs-border)' }}>
                          <dt style={{ color: 'var(--rs-muted)' }}>Place of supply</dt>
                          <dd>{purchaseDetail.placeOfSupply || '—'}</dd>
                        </div>
                        <div className="flex justify-between gap-2 border-b py-1.5" style={{ borderColor: 'var(--rs-border)' }}>
                          <dt style={{ color: 'var(--rs-muted)' }}>Created by</dt>
                          <dd>{purchaseDetail.createdBy?.name || '—'}</dd>
                        </div>
                        {purchaseDetail.irn ? (
                          <div className="sm:col-span-2 border-b py-1.5" style={{ borderColor: 'var(--rs-border)' }}>
                            <dt className="text-[10px] uppercase" style={{ color: 'var(--rs-muted)' }}>
                              IRN
                            </dt>
                            <dd className="break-all font-mono text-xs">{purchaseDetail.irn}</dd>
                          </div>
                        ) : null}
                      </dl>
                      {purchaseDetail.freeNotes ? (
                        <p className="mt-3 rounded-lg p-2 text-xs" style={{ background: 'var(--rs-surface-2)' }}>
                          {purchaseDetail.freeNotes}
                        </p>
                      ) : null}
                    </section>

                    <section className="rounded-xl border p-4" style={{ borderColor: 'var(--rs-border)' }}>
                      <h4
                        className="mb-3 text-[10px] font-bold uppercase tracking-wider"
                        style={{ color: 'var(--rs-muted)' }}
                      >
                        Line items · {(purchaseDetail.lines ?? []).length}
                      </h4>
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-xs">
                          <thead>
                            <tr style={{ color: 'var(--rs-muted)' }}>
                              <th className="px-2 py-1.5 text-left font-semibold">Product</th>
                              <th className="px-2 py-1.5 text-left font-semibold">HSN</th>
                              <th className="px-2 py-1.5 text-right font-semibold">GST</th>
                              <th className="px-2 py-1.5 text-right font-semibold">Qty</th>
                              <th className="px-2 py-1.5 text-right font-semibold">Rate</th>
                              <th className="px-2 py-1.5 text-right font-semibold">Total</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(purchaseDetail.lines ?? []).map((line) => (
                              <tr key={line.id} className="border-t" style={{ borderColor: 'var(--rs-border)' }}>
                                <td className="px-2 py-2">
                                  <div className="font-medium">
                                    {line.productName || line.description || 'Item'}
                                  </div>
                                  <div style={{ color: 'var(--rs-muted)' }}>
                                    {[line.sku, line.product?.barcode].filter(Boolean).join(' · ') || '—'}
                                  </div>
                                </td>
                                <td className="px-2 py-2">{line.hsnCode || '—'}</td>
                                <td className="px-2 py-2 text-right tabular-nums">
                                  {line.gstRate != null ? `${Number(line.gstRate)}%` : '—'}
                                </td>
                                <td className="px-2 py-2 text-right tabular-nums">{Number(line.quantity || 0)}</td>
                                <td className="px-2 py-2 text-right tabular-nums">
                                  {money(line.unitCost ?? line.unitPrice)}
                                </td>
                                <td className="px-2 py-2 text-right font-semibold tabular-nums">
                                  {money(line.lineTotal)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </section>

                    {(purchaseDetail.allocations?.length || purchaseDetail.ledgerEntries?.length) ? (
                      <section className="rounded-xl border p-4" style={{ borderColor: 'var(--rs-border)' }}>
                        <h4
                          className="mb-3 text-[10px] font-bold uppercase tracking-wider"
                          style={{ color: 'var(--rs-muted)' }}
                        >
                          Payments & ledger
                        </h4>
                        {(purchaseDetail.allocations ?? []).length ? (
                          <ul className="mb-3 space-y-1.5 text-xs">
                            {purchaseDetail.allocations!.map((a) => (
                              <li
                                key={a.id}
                                className="flex justify-between gap-2 rounded-lg px-2.5 py-2"
                                style={{ background: 'var(--rs-surface-2)' }}
                              >
                                <span>
                                  {a.payment?.method?.replace(/_/g, ' ') || 'Payment'}
                                  {a.payment?.referenceNo ? ` · ${a.payment.referenceNo}` : ''}
                                  {a.payment?.paymentDate ? ` · ${fmtDate(a.payment.paymentDate)}` : ''}
                                </span>
                                <span className="font-semibold tabular-nums">{money(a.amount)}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mb-3 text-xs" style={{ color: 'var(--rs-muted)' }}>
                            No payments allocated yet.
                          </p>
                        )}
                        {(purchaseDetail.ledgerEntries ?? []).slice(0, 8).map((e) => (
                          <div
                            key={e.id}
                            className="flex justify-between gap-2 border-t py-1.5 text-xs"
                            style={{ borderColor: 'var(--rs-border)' }}
                          >
                            <span>
                              {e.type.replace(/_/g, ' ')} · {fmtDate(e.entryDate)}
                              {e.notes ? ` · ${e.notes}` : ''}
                            </span>
                            <span className="tabular-nums">{money(e.amount)}</span>
                          </div>
                        ))}
                      </section>
                    ) : null}
                  </div>

                  <aside className="space-y-4">
                    <section className="rounded-xl border p-4" style={{ borderColor: 'var(--rs-border)' }}>
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                        <h4
                          className="text-[10px] font-bold uppercase tracking-wider"
                          style={{ color: 'var(--rs-muted)' }}
                        >
                          Attached bill / scan
                        </h4>
                        {attachmentUrl ? (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              className="rs-btn-secondary text-xs"
                              style={{ minHeight: 28 }}
                              onClick={() => setAttachmentOpen(true)}
                            >
                              Full view
                            </button>
                            <a
                              className="rs-btn-secondary text-xs inline-flex items-center"
                              style={{ minHeight: 28 }}
                              href={attachmentUrl}
                              download={purchaseDetail.billImageName || 'purchase-bill'}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Download
                            </a>
                          </div>
                        ) : null}
                      </div>
                      {!attachmentUrl ? (
                        <p className="text-xs" style={{ color: 'var(--rs-muted)' }}>
                          No attachment on this bill.
                        </p>
                      ) : attachmentKind === 'image' ? (
                        <button
                          type="button"
                          className="block w-full overflow-hidden rounded-lg border"
                          style={{ borderColor: 'var(--rs-border)' }}
                          onClick={() => setAttachmentOpen(true)}
                          title="Open full view"
                        >
                          <img
                            src={attachmentUrl}
                            alt={purchaseDetail.billImageName || 'Bill attachment'}
                            className="max-h-[420px] w-full object-contain bg-black/5"
                          />
                        </button>
                      ) : attachmentKind === 'pdf' ? (
                        <iframe
                          title={purchaseDetail.billImageName || 'PDF attachment'}
                          src={attachmentUrl}
                          className="h-[420px] w-full rounded-lg border bg-white"
                          style={{ borderColor: 'var(--rs-border)' }}
                        />
                      ) : (
                        <a
                          href={attachmentUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-semibold underline"
                          style={{ color: 'var(--rs-accent)' }}
                        >
                          {purchaseDetail.billImageName || 'Open attachment'}
                        </a>
                      )}
                      {purchaseDetail.billImageName ? (
                        <p className="mt-2 truncate text-[11px]" style={{ color: 'var(--rs-muted)' }}>
                          {purchaseDetail.billImageName}
                          {purchaseDetail.billImageMime ? ` · ${purchaseDetail.billImageMime}` : ''}
                        </p>
                      ) : null}
                    </section>
                  </aside>
                </div>
              ) : (
                <p className="text-sm" style={{ color: 'var(--rs-danger)' }}>
                  Purchase bill not found.
                </p>
              )}
            </div>
          </div>
        </div>
      ) : null}

      {attachmentOpen && attachmentUrl ? (
        <div
          className="fixed inset-0 z-[70] flex flex-col bg-black/90"
          role="dialog"
          aria-modal="true"
          onClick={() => setAttachmentOpen(false)}
        >
          <div
            className="flex shrink-0 items-center justify-between gap-3 px-4 py-3 text-white"
            onClick={(e) => e.stopPropagation()}
          >
            <p className="truncate text-sm font-medium">
              {purchaseDetail?.billImageName || 'Attachment'}
            </p>
            <div className="flex shrink-0 gap-2">
              <a
                href={attachmentUrl}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg bg-white/15 px-3 py-1.5 text-xs font-medium hover:bg-white/25"
              >
                Open in tab
              </a>
              <a
                href={attachmentUrl}
                download={purchaseDetail?.billImageName || 'purchase-bill'}
                className="rounded-lg bg-white/15 px-3 py-1.5 text-xs font-medium hover:bg-white/25"
              >
                Download
              </a>
              <button
                type="button"
                className="rounded-lg bg-white/15 px-3 py-1.5 text-xs font-medium hover:bg-white/25"
                onClick={() => setAttachmentOpen(false)}
              >
                Close
              </button>
            </div>
          </div>
          <div
            className="flex min-h-0 flex-1 items-center justify-center p-4"
            onClick={(e) => e.stopPropagation()}
          >
            {attachmentKind === 'image' ? (
              <img
                src={attachmentUrl}
                alt={purchaseDetail?.billImageName || 'Attachment'}
                className="max-h-full max-w-full object-contain"
              />
            ) : attachmentKind === 'pdf' ? (
              <iframe
                title={purchaseDetail?.billImageName || 'PDF'}
                src={attachmentUrl}
                className="h-full w-full max-w-5xl rounded-lg bg-white"
              />
            ) : (
              <a href={attachmentUrl} className="text-white underline" target="_blank" rel="noreferrer">
                Open file
              </a>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
