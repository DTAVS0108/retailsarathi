'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, Card } from '@retail-sarathi/ui';
import { apiWithAuth } from '@/lib/helpers';
import { pageShellClassName,
  MessageBanner,
  PageHeader,
  formatDateTime,
  inputClassName,
  parseError,
  selectClassName,
  tableCellClassName,
  tableHeaderClassName,
} from '../_components/dashboard-ui';

type InvoiceOption = {
  id: string;
  invoiceNumber: string;
  grandTotal?: number | string;
  createdAt?: string;
  status?: string;
};

type InvoiceListResponse =
  | InvoiceOption[]
  | { items?: InvoiceOption[]; data?: InvoiceOption[]; invoices?: InvoiceOption[] };

function unwrapInvoices(response: InvoiceListResponse): InvoiceOption[] {
  if (Array.isArray(response)) return response;
  if (Array.isArray(response.items)) return response.items;
  if (Array.isArray(response.data)) return response.data;
  if (Array.isArray(response.invoices)) return response.invoices;
  return [];
}

export default function CompliancePage() {
  const [logs, setLogs] = useState<Array<Record<string, unknown>>>([]);
  const [invoices, setInvoices] = useState<InvoiceOption[]>([]);
  const [gspStatus, setGspStatus] = useState<{
    configured?: boolean;
    mode?: string;
    hint?: string;
    gstin?: string | null;
    host?: string;
  } | null>(null);
  const [invoiceId, setInvoiceId] = useState('');
  const [qrResult, setQrResult] = useState<Record<string, unknown> | null>(null);
  const [ewayResult, setEwayResult] = useState<{
    ewayBillNo?: string;
    invoiceNumber?: string;
    ewayBillRequired?: boolean;
    value?: number;
    distanceKm?: number;
    checklist?: string[];
    note?: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        const [audit, invoiceResponse, status] = await Promise.all([
          apiWithAuth<Array<Record<string, unknown>>>('/compliance/audit-log'),
          apiWithAuth<InvoiceListResponse>('/invoices'),
          apiWithAuth<{
            configured?: boolean;
            mode?: string;
            hint?: string;
            gstin?: string | null;
            host?: string;
          }>('/compliance/einvoice/status').catch(() => null),
        ]);
        setLogs(audit);
        const list = unwrapInvoices(invoiceResponse);
        setInvoices(list);
        if (list[0]?.id) setInvoiceId(list[0].id);
        if (status) setGspStatus(status);
      } catch (e) {
        setError(parseError(e));
      }
    })();
  }, []);

  const requireInvoiceId = useCallback(() => {
    const id = invoiceId.trim();
    if (!id) {
      setError('Select an invoice first (or paste a valid invoice ID).');
      setSuccess('');
      return null;
    }
    return id;
  }, [invoiceId]);

  async function runAction(action: 'qr' | 'einvoice' | 'eway') {
    const id = requireInvoiceId();
    if (!id) return;

    setBusy(true);
    setError('');
    setSuccess('');
    try {
      if (action === 'qr') {
        const result = await apiWithAuth<Record<string, unknown>>(`/compliance/invoices/${id}/qr`);
        setQrResult(result);
        setSuccess('Invoice QR generated — shown below.');
        return;
      }
      if (action === 'einvoice') {
        await apiWithAuth(`/compliance/invoices/${id}/einvoice`, { method: 'POST' });
        setSuccess('Demo e-invoice IRN saved on the invoice. Open the invoice print view to see IRN + QR.');
        return;
      }
      const result = await apiWithAuth<{
        ewayBillNo?: string;
        invoiceNumber?: string;
        ewayBillRequired?: boolean;
        value?: number;
        distanceKm?: number;
        checklist?: string[];
        note?: string;
      }>(`/compliance/invoices/${id}/eway-bill`, {
        method: 'POST',
        body: JSON.stringify({ distanceKm: 100 }),
      });
      setEwayResult(result);
      setSuccess(result.note ?? `E-way bill ${result.ewayBillNo} saved.`);
      const audit = await apiWithAuth<Array<Record<string, unknown>>>('/compliance/audit-log');
      setLogs(audit);
    } catch (e) {
      setError(parseError(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={pageShellClassName}>
      <PageHeader
        title="Compliance+"
        description="Audit trail, invoice QR, e-invoice IRN (live GSP when configured), and e-way helper."
      />
      {error ? <MessageBanner tone="error">{error}</MessageBanner> : null}
      {success ? <MessageBanner tone="success">{success}</MessageBanner> : null}

      <MessageBanner tone={gspStatus?.configured ? 'success' : 'info'}>
        {gspStatus?.configured ? (
          <>
            <strong>Live GSP mode</strong> — {gspStatus.hint} Host: {gspStatus.host}
            {gspStatus.gstin ? ` · GSTIN ${gspStatus.gstin}` : ''}.
          </>
        ) : (
          <>
            E-invoice runs in <strong>demo mode</strong> until you set{' '}
            <code className="rounded bg-slate-100 px-1">EINVOICE_GSP_AUTH_TOKEN</code> and{' '}
            <code className="rounded bg-slate-100 px-1">EINVOICE_GSP_GSTIN</code> in the API{' '}
            <code className="rounded bg-slate-100 px-1">.env</code>, then restart the API. Live e-way bill remains
            Coming soon.
          </>
        )}
      </MessageBanner>

      <Card className="space-y-3 border-slate-200">
        <h3 className="text-lg font-semibold">Invoice compliance tools</h3>
        <p className="text-sm text-slate-600">
          Pick a saved invoice below. QR / e-invoice / e-way bill need a real invoice ID — an empty field caused the
          earlier <code className="rounded bg-slate-100 px-1">invoices//…</code> errors.
        </p>

        {invoices.length > 0 ? (
          <label className="block space-y-1 text-sm font-medium text-slate-700">
            <span>Invoice</span>
            <select
              className={selectClassName}
              value={invoiceId}
              onChange={(e) => {
                setInvoiceId(e.target.value);
                setQrResult(null);
                setError('');
                setSuccess('');
              }}
            >
              {invoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.invoiceNumber}
                  {inv.status ? ` · ${inv.status}` : ''}
                  {inv.grandTotal != null ? ` · ₹${Number(inv.grandTotal).toLocaleString('en-IN')}` : ''}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <p className="text-sm text-amber-700">
            No invoices found yet. Create one from POS, then return here.
          </p>
        )}

        <label className="block space-y-1 text-sm font-medium text-slate-700">
          <span>Or paste invoice ID</span>
          <input
            className={inputClassName}
            placeholder="Invoice UUID"
            value={invoiceId}
            onChange={(e) => setInvoiceId(e.target.value)}
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" disabled={busy || !invoiceId.trim()} onClick={() => void runAction('qr')}>
            Generate QR
          </Button>
          <Button type="button" disabled={busy || !invoiceId.trim()} onClick={() => void runAction('einvoice')}>
            Request e-invoice
          </Button>
          <Button
            type="button"
            variant="secondary"
            disabled={busy || !invoiceId.trim()}
            onClick={() => void runAction('eway')}
          >
            Generate e-way bill (demo)
          </Button>
        </div>

        {ewayResult ? (
          <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
            <p className="font-semibold">E-way bill saved on invoice</p>
            <p>
              <span className="text-emerald-800">Number:</span>{' '}
              <strong className="font-mono">{ewayResult.ewayBillNo}</strong>
            </p>
            <p>
              Invoice <strong>{ewayResult.invoiceNumber}</strong>
              {ewayResult.value != null ? ` · ₹${Number(ewayResult.value).toLocaleString('en-IN')}` : ''}
              {ewayResult.distanceKm != null ? ` · ${ewayResult.distanceKm} km` : ''}
            </p>
            <p>
              {ewayResult.ewayBillRequired
                ? 'Likely required for this consignment (demo number only).'
                : 'May not be mandatory; demo number still saved for testing.'}
            </p>
            {ewayResult.checklist?.length ? (
              <ul className="list-disc space-y-1 pl-5 text-emerald-900">
                {ewayResult.checklist.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : null}
            <p className="text-emerald-800">
              Also shown on the invoice print under <strong>E-way bill no.</strong> — open Invoices → this bill →
              Print.
            </p>
          </div>
        ) : null}

        {qrResult ? (
          <div className="rounded-xl border border-slate-200 p-4 text-sm">
            <p className="break-all font-mono text-xs">{String(qrResult.qrPayload)}</p>
            {qrResult.qrUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={String(qrResult.qrUrl)} alt="Invoice QR" className="mt-3 h-40 w-40" />
            ) : null}
          </div>
        ) : null}
      </Card>

      <Card className="overflow-x-auto border-slate-200">
        <h3 className="mb-3 text-lg font-semibold">Audit log</h3>
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              <th className={tableHeaderClassName}>When</th>
              <th className={tableHeaderClassName}>Action</th>
              <th className={tableHeaderClassName}>Entity</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((l) => (
              <tr key={String(l.id)}>
                <td className={tableCellClassName}>{formatDateTime(String(l.createdAt))}</td>
                <td className={tableCellClassName}>{String(l.action)}</td>
                <td className={tableCellClassName}>
                  {String(l.entityType)}
                  {l.entityId ? ` · ${String(l.entityId).slice(0, 8)}` : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
