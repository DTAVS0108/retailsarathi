'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card } from '@retail-sarathi/ui';
import { apiWithAuth } from '@/lib/helpers';
import {
  pageShellClassName,
  EmptyState,
  MessageBanner,
  PageHeader,
  StatCard,
  cn,
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

const ACTION_BADGE: Record<string, string> = {
  EINVOICE_GENERATED: 'bg-emerald-100 text-emerald-800',
  EWAY_BILL_GENERATED: 'bg-blue-100 text-blue-800',
};

export default function CompliancePage() {
  const [logs, setLogs] = useState<Array<Record<string, unknown>>>([]);
  const [invoices, setInvoices] = useState<InvoiceOption[]>([]);
  const [loading, setLoading] = useState(true);
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
        setLoading(true);
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
      } finally {
        setLoading(false);
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
        setEwayResult(null);
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
      setQrResult(null);
      setSuccess(result.note ?? `E-way bill ${result.ewayBillNo} saved.`);
      const audit = await apiWithAuth<Array<Record<string, unknown>>>('/compliance/audit-log');
      setLogs(audit);
    } catch (e) {
      setError(parseError(e));
    } finally {
      setBusy(false);
    }
  }

  const einvoiceCount = useMemo(() => logs.filter((l) => l.action === 'EINVOICE_GENERATED').length, [logs]);
  const ewayCount = useMemo(() => logs.filter((l) => l.action === 'EWAY_BILL_GENERATED').length, [logs]);

  return (
    <div className={pageShellClassName}>
      <PageHeader
        title="Compliance+"
        description="Audit trail, invoice QR, e-invoice IRN (live GSP when configured), and e-way helper."
      />
      {error ? <MessageBanner tone="error">{error}</MessageBanner> : null}
      {success ? <MessageBanner tone="success">{success}</MessageBanner> : null}

      <section className="grid gap-3 sm:gap-4 sm:grid-cols-3">
        <StatCard label="Mode" value={gspStatus?.configured ? 'Live GSP' : 'Demo'} hint={gspStatus?.configured ? gspStatus.host : 'No GSP credentials set'} />
        <StatCard label="E-invoices generated" value={String(einvoiceCount)} />
        <StatCard label="E-way bills generated" value={String(ewayCount)} />
      </section>

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
            coming soon.
          </>
        )}
      </MessageBanner>

      <Card className="border-slate-200">
        <h3 className="mb-1 text-lg font-semibold text-slate-900">Invoice compliance tools</h3>
        <p className="mb-4 text-sm text-slate-500">Pick a saved invoice, then generate its QR code, e-invoice IRN, or e-way bill.</p>

        <div className="grid gap-4 md:grid-cols-2">
          {invoices.length > 0 ? (
            <label className="space-y-1 text-sm font-medium text-slate-700">
              <span>Invoice</span>
              <select
                className={selectClassName}
                value={invoiceId}
                onChange={(e) => {
                  setInvoiceId(e.target.value);
                  setQrResult(null);
                  setEwayResult(null);
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
            <p className="text-sm text-amber-700">No invoices found yet. Create one from POS, then return here.</p>
          )}

          <label className="space-y-1 text-sm font-medium text-slate-700">
            <span>Or paste invoice ID</span>
            <input
              className={inputClassName}
              placeholder="Invoice UUID"
              value={invoiceId}
              onChange={(e) => setInvoiceId(e.target.value)}
            />
          </label>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Button type="button" variant="secondary" disabled={busy || !invoiceId.trim()} onClick={() => void runAction('qr')}>
            Generate QR
          </Button>
          <Button type="button" disabled={busy || !invoiceId.trim()} onClick={() => void runAction('einvoice')}>
            Request e-invoice
          </Button>
          <Button type="button" variant="secondary" disabled={busy || !invoiceId.trim()} onClick={() => void runAction('eway')}>
            Generate e-way bill (demo)
          </Button>
        </div>

        {ewayResult ? (
          <div className="mt-4 space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-950">
            <p className="font-semibold">E-way bill saved on invoice</p>
            <p>
              <span className="text-emerald-800">Number:</span> <strong className="font-mono">{ewayResult.ewayBillNo}</strong>
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
              Also shown on the invoice print under <strong>E-way bill no.</strong> — open Invoices → this bill → Print.
            </p>
          </div>
        ) : null}

        {qrResult ? (
          <div className="mt-4 flex flex-col gap-4 rounded-xl border border-slate-200 p-4 sm:flex-row sm:items-center">
            {qrResult.qrUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={String(qrResult.qrUrl)} alt="Invoice QR" className="h-32 w-32 shrink-0 rounded-lg border border-slate-100" />
            ) : null}
            <p className="min-w-0 break-all font-mono text-xs text-slate-600">{String(qrResult.qrPayload)}</p>
          </div>
        ) : null}
      </Card>

      <Card className="border-slate-200">
        <h3 className="mb-4 text-lg font-semibold text-slate-900">Audit log</h3>
        {loading ? (
          <p className="py-8 text-center text-sm text-slate-500">Loading…</p>
        ) : !logs.length ? (
          <EmptyState title="No audit activity yet" description="E-invoice and e-way bill actions will be logged here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className={tableHeaderClassName}>When</th>
                  <th className={tableHeaderClassName}>Action</th>
                  <th className={tableHeaderClassName}>Entity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((l) => (
                  <tr key={String(l.id)}>
                    <td className={tableCellClassName}>{formatDateTime(String(l.createdAt))}</td>
                    <td className={tableCellClassName}>
                      <span className={cn('inline-flex rounded-full px-2.5 py-1 text-xs font-medium', ACTION_BADGE[String(l.action)] ?? 'bg-slate-100 text-slate-600')}>
                        {String(l.action).replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className={tableCellClassName}>
                      {String(l.entityType)}
                      {l.entityId ? ` · ${String(l.entityId).slice(0, 8)}` : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
