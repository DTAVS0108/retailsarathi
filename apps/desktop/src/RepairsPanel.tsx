import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ApiFetch } from './api';
import { useToastMessage } from './toast';
import { REPAIR_STATUS_FLOW, type RepairStatus } from '@retail-sarathi/types';

const STATUS_FLOW = REPAIR_STATUS_FLOW;

const STATUS_FILTERS: Array<RepairStatus | 'ALL'> = ['ALL', ...(Object.keys(REPAIR_STATUS_FLOW) as RepairStatus[])];

type Customer = { id: string; name: string; phone: string };
type Technician = { id: string; name: string; email?: string };
type ProductOpt = { id: string; name: string; salePrice: number | string; stockQty?: number | string };

type RepairJob = {
  id: string;
  jobNumber: string;
  deviceModel: string;
  imei?: string | null;
  issue: string;
  accessories?: string | null;
  status: RepairStatus;
  estimateAmount?: number | string | null;
  finalAmount?: number | string | null;
  warrantyDays?: number;
  customerApproved?: boolean | null;
  linkedInvoiceId?: string | null;
  notes?: string | null;
  receivedAt?: string;
  deliveredAt?: string | null;
  warrantyEndsAt?: string | null;
  customer?: Customer | null;
  technician?: Technician | null;
  partsUsed?: Array<{
    id: string;
    quantity: number | string;
    unitPrice: number | string;
    product?: { id: string; name: string; sku?: string };
  }>;
  statusHistory?: Array<{ id: string; status: string; notes?: string | null; createdAt: string }>;
};

function num(v: unknown) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function inr(n: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(n);
}

function statusTone(status: string) {
  if (status === 'DELIVERED') return { bg: 'color-mix(in srgb, #059669 18%, var(--rs-surface))', fg: '#047857' };
  if (status === 'CANCELLED') return { bg: 'color-mix(in srgb, #dc2626 16%, var(--rs-surface))', fg: '#b91c1c' };
  if (status === 'READY') return { bg: 'color-mix(in srgb, var(--rs-accent) 18%, var(--rs-surface))', fg: 'var(--rs-accent)' };
  if (status === 'IN_REPAIR' || status === 'AWAITING_PARTS' || status === 'ON_HOLD')
    return { bg: 'color-mix(in srgb, #ca8a04 16%, var(--rs-surface))', fg: '#a16207' };
  if (status === 'AWAITING_CUSTOMER_APPROVAL')
    return { bg: 'color-mix(in srgb, var(--rs-accent) 18%, var(--rs-surface))', fg: 'var(--rs-accent)' };
  return { bg: 'var(--rs-surface-2)', fg: 'var(--rs-ink)' };
}


export function RepairsPanel({
  token,
  apiFetch,
  printOpts,
}: {
  token: string;
  apiFetch: ApiFetch;
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
  const [jobs, setJobs] = useState<RepairJob[]>([]);
  const [statusFilter, setStatusFilter] = useState<RepairStatus | 'ALL'>('ALL');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  useToastMessage(error, 'error', setError);
  useToastMessage(msg, setMsg);
  const [busy, setBusy] = useState(false);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [products, setProducts] = useState<ProductOpt[]>([]);

  const [showCreate, setShowCreate] = useState(false);
  const [custQuery, setCustQuery] = useState('');
  const [form, setForm] = useState({
    customerId: '',
    deviceModel: '',
    imei: '',
    issue: '',
    accessories: '',
    technicianId: '',
    estimateAmount: '',
    warrantyDays: '30',
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<RepairJob | null>(null);
  const [statusNotes, setStatusNotes] = useState('');
  const [finalAmount, setFinalAmount] = useState('');
  const [customerApproved, setCustomerApproved] = useState(false);
  const [partProductId, setPartProductId] = useState('');
  const [partQty, setPartQty] = useState('1');
  const [partPrice, setPartPrice] = useState('');

  const loadJobs = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const q = statusFilter === 'ALL' ? '' : `?status=${statusFilter}`;
      const res = await apiFetch<RepairJob[]>(token, `/repairs${q}`);
      setJobs(Array.isArray(res) ? res : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load repairs');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, token, statusFilter]);

  const loadMeta = useCallback(async () => {
    try {
      const [cust, tech, prod] = await Promise.all([
        apiFetch<Customer[]>(token, '/customers').catch(() => []),
        apiFetch<Technician[]>(token, '/users/technicians').catch(() => []),
        apiFetch<{ items: ProductOpt[] }>(token, '/products?pageSize=300').catch(() => ({ items: [] })),
      ]);
      setCustomers(Array.isArray(cust) ? cust : []);
      setTechnicians(Array.isArray(tech) ? tech : []);
      setProducts(prod.items ?? []);
    } catch {
      /* optional */
    }
  }, [apiFetch, token]);

  useEffect(() => {
    void loadJobs();
  }, [loadJobs]);

  useEffect(() => {
    void loadMeta();
  }, [loadMeta]);

  const filteredCustomers = useMemo(() => {
    const q = custQuery.trim().toLowerCase();
    if (!q) return customers.slice(0, 30);
    return customers
      .filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q))
      .slice(0, 30);
  }, [customers, custQuery]);

  async function openDetail(id: string) {
    setSelectedId(id);
    setBusy(true);
    setMsg('');
    try {
      const d = await apiFetch<RepairJob>(token, `/repairs/${id}`);
      setDetail(d);
      setFinalAmount(d.finalAmount != null ? String(num(d.finalAmount)) : '');
      setCustomerApproved(Boolean(d.customerApproved));
      setStatusNotes('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to open job');
      setSelectedId(null);
    } finally {
      setBusy(false);
    }
  }

  async function refreshDetail() {
    if (!selectedId) return;
    const d = await apiFetch<RepairJob>(token, `/repairs/${selectedId}`);
    setDetail(d);
    await loadJobs();
  }

  async function createJob(e: React.FormEvent) {
    e.preventDefault();
    if (!form.customerId || !form.deviceModel.trim() || !form.issue.trim()) {
      setMsg('Customer, device, and issue are required');
      return;
    }
    setBusy(true);
    setMsg('');
    try {
      const created = await apiFetch<RepairJob>(token, '/repairs', {
        method: 'POST',
        body: JSON.stringify({
          customerId: form.customerId,
          deviceModel: form.deviceModel.trim(),
          imei: form.imei.trim() || undefined,
          issue: form.issue.trim(),
          accessories: form.accessories.trim() || undefined,
          technicianId: form.technicianId || undefined,
          estimateAmount: form.estimateAmount ? Number(form.estimateAmount) : undefined,
          warrantyDays: Number(form.warrantyDays) || 30,
        }),
      });
      setShowCreate(false);
      setForm({
        customerId: '',
        deviceModel: '',
        imei: '',
        issue: '',
        accessories: '',
        technicianId: '',
        estimateAmount: '',
        warrantyDays: '30',
      });
      setMsg(`Token ${created.jobNumber} created — use "Print token" to print the slip.`);
      await loadJobs();
      await openDetail(created.id);
    } catch (err) {
      setMsg(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  }

  async function printToken(job: RepairJob) {
    setBusy(true);
    try {
      const { escposBase64 } = await apiFetch<{ text: string; escposBase64: string }>(token, `/repairs/${job.id}/token-thermal`);
      await window.retailSarathi.printThermal({
        escposBase64,
        comPort: printOpts?.comPort,
        bluetoothAddress: printOpts?.bluetoothAddress,
      });
      setMsg(`Token slip printed · ${job.jobNumber}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Print failed');
    } finally {
      setBusy(false);
    }
  }

  async function advanceStatus(next: RepairStatus) {
    if (!detail) return;
    setBusy(true);
    setMsg('');
    try {
      await apiFetch(token, `/repairs/${detail.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status: next,
          notes: statusNotes || undefined,
          customerApproved: next === 'READY' || next === 'DELIVERED' ? customerApproved : undefined,
          finalAmount: finalAmount ? Number(finalAmount) : undefined,
        }),
      });
      setMsg(`Status → ${next}`);
      await refreshDetail();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Status update failed');
    } finally {
      setBusy(false);
    }
  }

  async function saveTechnician(technicianId: string) {
    if (!detail || !technicianId) return;
    setBusy(true);
    try {
      await apiFetch(token, `/repairs/${detail.id}/technician`, {
        method: 'PATCH',
        body: JSON.stringify({ technicianId }),
      });
      setMsg('Technician assigned');
      await refreshDetail();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Assign failed');
    } finally {
      setBusy(false);
    }
  }

  async function addPart() {
    if (!detail || !partProductId) {
      setMsg('Select a part');
      return;
    }
    setBusy(true);
    try {
      await apiFetch(token, `/repairs/${detail.id}/parts`, {
        method: 'POST',
        body: JSON.stringify({
          productId: partProductId,
          quantity: Number(partQty) || 1,
          unitPrice: Number(partPrice) || 0,
        }),
      });
      setPartProductId('');
      setPartQty('1');
      setPartPrice('');
      setMsg('Part added (stock deducted)');
      await refreshDetail();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Add part failed');
    } finally {
      setBusy(false);
    }
  }

  async function sendEstimate() {
    if (!detail) return;
    setBusy(true);
    try {
      const res = await apiFetch<{ message?: string; customerPhone?: string }>(
        token,
        `/repairs/${detail.id}/send-estimate`,
        { method: 'POST' },
      );
      setMsg(res.message || `Estimate sent${res.customerPhone ? ` to ${res.customerPhone}` : ''}`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Send estimate failed');
    } finally {
      setBusy(false);
    }
  }

  async function createInvoiceAndPrint() {
    if (!detail) return;
    setBusy(true);
    setMsg('');
    try {
      const inv = await apiFetch<{ id: string; invoiceNumber: string }>(
        token,
        `/repairs/${detail.id}/create-invoice`,
        { method: 'POST' },
      );
      setMsg(`Invoice ${inv.invoiceNumber} created`);
      try {
        const job = await apiFetch<{ text: string; escposBase64?: string; bluetoothAddress?: string | null }>(
          token,
          '/hardware/print-thermal',
          {
            method: 'POST',
            body: JSON.stringify({
              invoiceId: inv.id,
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
        setMsg(`Invoice ${inv.invoiceNumber} · thermal printed`);
      } catch {
        setMsg(`Invoice ${inv.invoiceNumber} created — open Bills to reprint thermal / A4`);
      }
      await refreshDetail();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Create invoice failed');
    } finally {
      setBusy(false);
    }
  }

  async function reprintLinkedInvoice() {
    if (!detail?.linkedInvoiceId) return;
    setBusy(true);
    try {
      const job = await apiFetch<{ text: string; escposBase64?: string; bluetoothAddress?: string | null }>(
        token,
        '/hardware/print-thermal',
        {
          method: 'POST',
          body: JSON.stringify({
            invoiceId: detail.linkedInvoiceId,
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
      setMsg('Invoice thermal reprinted');
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Reprint failed');
    } finally {
      setBusy(false);
    }
  }

  const nextStatuses = detail ? STATUS_FLOW[detail.status] ?? [] : [];

  return (
    <div className="flex h-full min-h-0 flex-col gap-3 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold" style={{ color: 'var(--rs-ink)' }}>
            Repair desk
          </h2>
          <p className="text-sm" style={{ color: 'var(--rs-muted)' }}>
            Intake creates a token (REP-…), print token slip, track status, add parts, then bill &amp; thermal.
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="rs-btn-secondary text-sm" onClick={() => void loadJobs()}>
            Refresh
          </button>
          <button
            type="button"
            className="rs-btn-primary text-sm"
            onClick={() => {
              setShowCreate(true);
              setMsg('');
            }}
          >
            New repair · token
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            type="button"
            className={statusFilter === s ? 'rs-btn-primary text-xs' : 'rs-btn-secondary text-xs'}
            style={{ minHeight: 32 }}
            onClick={() => setStatusFilter(s)}
          >
            {s === 'ALL' ? 'All' : s.replace(/_/g, ' ')}
          </button>
        ))}
      </div>

      {error ? (
        <p className="rounded-lg px-3 py-2 text-sm text-red-700" style={{ background: 'color-mix(in srgb, #dc2626 12%, var(--rs-surface))' }}>
          {error}
        </p>
      ) : null}
      {msg ? (
        <p className="rounded-lg px-3 py-2 text-sm" style={{ background: 'var(--rs-surface-2)', color: 'var(--rs-ink)' }}>
          {msg}
        </p>
      ) : null}

      <div
        className="min-h-0 flex-1 overflow-auto rounded-xl"
        style={{ background: 'var(--rs-surface)', border: '1px solid var(--rs-border)' }}
      >
        {loading ? (
          <p className="p-6 text-sm" style={{ color: 'var(--rs-muted)' }}>
            Loading repairs…
          </p>
        ) : !jobs.length ? (
          <p className="p-6 text-sm" style={{ color: 'var(--rs-muted)' }}>
            No repair jobs in this filter.
          </p>
        ) : (
          <table className="min-w-full text-left text-sm">
            <thead className="sticky top-0 text-xs uppercase" style={{ background: 'var(--rs-surface-2)', color: 'var(--rs-muted)' }}>
              <tr>
                <th className="px-3 py-2">Token</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Device</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Estimate</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {jobs.map((j) => {
                const tone = statusTone(j.status);
                return (
                  <tr key={j.id} style={{ borderTop: '1px solid var(--rs-border)' }}>
                    <td className="px-3 py-2 font-mono font-semibold" style={{ color: 'var(--rs-accent)' }}>
                      {j.jobNumber}
                    </td>
                    <td className="px-3 py-2">
                      <div style={{ color: 'var(--rs-ink)' }}>{j.customer?.name ?? '—'}</div>
                      <div className="text-xs" style={{ color: 'var(--rs-muted)' }}>
                        {j.customer?.phone ?? ''}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div style={{ color: 'var(--rs-ink)' }}>{j.deviceModel}</div>
                      <div className="truncate text-xs" style={{ color: 'var(--rs-muted)', maxWidth: 180 }}>
                        {j.issue}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <span className="rounded-full px-2 py-0.5 text-[10px] font-semibold" style={{ background: tone.bg, color: tone.fg }}>
                        {j.status}
                      </span>
                    </td>
                    <td className="px-3 py-2">{j.estimateAmount != null ? inr(num(j.estimateAmount)) : '—'}</td>
                    <td className="px-3 py-2">
                      <div className="flex flex-wrap gap-1">
                        <button type="button" className="rs-btn-primary text-xs" style={{ minHeight: 28 }} onClick={() => void openDetail(j.id)}>
                          Open
                        </button>
                        <button type="button" className="rs-btn-secondary text-xs" style={{ minHeight: 28 }} onClick={() => void printToken(j)}>
                          Token
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Create modal */}
      {showCreate ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/45 p-4">
          <form
            onSubmit={(e) => void createJob(e)}
            className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-2xl p-5 shadow-xl"
            style={{ background: 'var(--rs-surface)', border: '1px solid var(--rs-border)' }}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="font-bold" style={{ color: 'var(--rs-ink)' }}>
                New repair · generate token
              </h3>
              <button type="button" className="rs-btn-secondary text-sm" onClick={() => setShowCreate(false)}>
                Close
              </button>
            </div>
            <label className="mb-2 block text-xs font-semibold" style={{ color: 'var(--rs-muted)' }}>
              Customer
              <input
                className="rs-input mt-1 text-sm"
                placeholder="Search name / phone…"
                value={custQuery}
                onChange={(e) => setCustQuery(e.target.value)}
              />
            </label>
            <div className="mb-3 max-h-36 overflow-auto rounded-lg" style={{ border: '1px solid var(--rs-border)' }}>
              {filteredCustomers.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="block w-full px-3 py-2 text-left text-sm"
                  style={{
                    background:
                      form.customerId === c.id
                        ? 'color-mix(in srgb, var(--rs-accent) 14%, transparent)'
                        : undefined,
                    color: 'var(--rs-ink)',
                  }}
                  onClick={() => {
                    setForm((f) => ({ ...f, customerId: c.id }));
                    setCustQuery(`${c.name} · ${c.phone}`);
                  }}
                >
                  {c.name} · {c.phone}
                </button>
              ))}
            </div>
            {(
              [
                ['deviceModel', 'Device model *'],
                ['imei', 'IMEI / serial'],
                ['issue', 'Issue *'],
                ['accessories', 'Accessories received'],
                ['estimateAmount', 'Estimate ₹'],
                ['warrantyDays', 'Warranty days'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="mb-2 block text-xs font-semibold" style={{ color: 'var(--rs-muted)' }}>
                {label}
                <input
                  className="rs-input mt-1 text-sm"
                  value={form[key]}
                  onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                />
              </label>
            ))}
            <label className="mb-3 block text-xs font-semibold" style={{ color: 'var(--rs-muted)' }}>
              Technician (optional)
              <select
                className="rs-input mt-1 text-sm"
                value={form.technicianId}
                onChange={(e) => setForm((f) => ({ ...f, technicianId: e.target.value }))}
              >
                <option value="">Unassigned</option>
                {technicians.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" className="rs-btn-primary w-full" disabled={busy}>
              {busy ? 'Creating…' : 'Create token & print slip'}
            </button>
          </form>
        </div>
      ) : null}

      {/* Detail modal */}
      {selectedId && detail ? (
        <div className="fixed inset-0 z-50 flex items-stretch justify-center bg-black/50 p-3 sm:p-5">
          <div
            className="flex max-h-full w-full max-w-3xl flex-col overflow-hidden rounded-2xl shadow-xl"
            style={{ background: 'var(--rs-surface)', border: '1px solid var(--rs-border)' }}
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3" style={{ borderColor: 'var(--rs-border)' }}>
              <div>
                <h3 className="font-mono text-lg font-bold" style={{ color: 'var(--rs-accent)' }}>
                  {detail.jobNumber}
                </h3>
                <p className="text-xs" style={{ color: 'var(--rs-muted)' }}>
                  {detail.customer?.name} · {detail.deviceModel} · {detail.status}
                </p>
              </div>
              <button
                type="button"
                className="rs-btn-secondary text-sm"
                onClick={() => {
                  setSelectedId(null);
                  setDetail(null);
                }}
              >
                Close
              </button>
            </div>

            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4 text-sm">
              {msg ? (
                <p className="rounded-lg px-3 py-2" style={{ background: 'var(--rs-surface-2)' }}>
                  {msg}
                </p>
              ) : null}

              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl p-3" style={{ background: 'var(--rs-surface-2)', border: '1px solid var(--rs-border)' }}>
                  <p className="text-xs font-semibold uppercase" style={{ color: 'var(--rs-muted)' }}>
                    Device
                  </p>
                  <p style={{ color: 'var(--rs-ink)' }}>{detail.deviceModel}</p>
                  {detail.imei ? <p className="text-xs">IMEI {detail.imei}</p> : null}
                  <p className="mt-1" style={{ color: 'var(--rs-ink)' }}>
                    {detail.issue}
                  </p>
                  {detail.accessories ? (
                    <p className="text-xs" style={{ color: 'var(--rs-muted)' }}>
                      + {detail.accessories}
                    </p>
                  ) : null}
                </div>
                <div className="rounded-xl p-3" style={{ background: 'var(--rs-surface-2)', border: '1px solid var(--rs-border)' }}>
                  <p className="text-xs font-semibold uppercase" style={{ color: 'var(--rs-muted)' }}>
                    Billing
                  </p>
                  <p>Estimate {detail.estimateAmount != null ? inr(num(detail.estimateAmount)) : '—'}</p>
                  <p>Final {detail.finalAmount != null ? inr(num(detail.finalAmount)) : '—'}</p>
                  <p className="text-xs" style={{ color: 'var(--rs-muted)' }}>
                    Warranty {detail.warrantyDays ?? 30} days
                    {detail.linkedInvoiceId ? ' · Invoice linked' : ''}
                  </p>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button type="button" className="rs-btn-secondary text-sm" disabled={busy} onClick={() => void printToken(detail)}>
                  Print token slip
                </button>
                <button type="button" className="rs-btn-secondary text-sm" disabled={busy} onClick={() => void sendEstimate()}>
                  Send estimate
                </button>
                {!detail.linkedInvoiceId ? (
                  <button type="button" className="rs-btn-primary text-sm" disabled={busy} onClick={() => void createInvoiceAndPrint()}>
                    Create invoice &amp; thermal
                  </button>
                ) : (
                  <button type="button" className="rs-btn-primary text-sm" disabled={busy} onClick={() => void reprintLinkedInvoice()}>
                    Reprint invoice thermal
                  </button>
                )}
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase" style={{ color: 'var(--rs-muted)' }}>
                  Advance status
                </p>
                <div className="mb-2 flex flex-wrap gap-2">
                  {nextStatuses.map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={s === 'CANCELLED' ? 'rs-btn-secondary text-xs' : 'rs-btn-primary text-xs'}
                      style={{ minHeight: 32 }}
                      disabled={busy}
                      onClick={() => void advanceStatus(s)}
                    >
                      → {s.replace(/_/g, ' ')}
                    </button>
                  ))}
                  {!nextStatuses.length ? (
                    <span className="text-xs" style={{ color: 'var(--rs-muted)' }}>
                      Terminal status
                    </span>
                  ) : null}
                </div>
                <input
                  className="rs-input mb-2 text-sm"
                  placeholder="Status notes (optional)"
                  value={statusNotes}
                  onChange={(e) => setStatusNotes(e.target.value)}
                />
                <div className="flex flex-wrap items-center gap-3">
                  <label className="text-xs" style={{ color: 'var(--rs-muted)' }}>
                    Final amount ₹
                    <input
                      className="rs-input mt-1 w-32 text-sm"
                      value={finalAmount}
                      onChange={(e) => setFinalAmount(e.target.value)}
                    />
                  </label>
                  <label className="flex items-center gap-2 text-xs" style={{ color: 'var(--rs-ink)' }}>
                    <input
                      type="checkbox"
                      checked={customerApproved}
                      onChange={(e) => setCustomerApproved(e.target.checked)}
                    />
                    Customer approved
                  </label>
                </div>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase" style={{ color: 'var(--rs-muted)' }}>
                  Technician
                </p>
                <select
                  className="rs-input text-sm"
                  value={detail.technician?.id ?? ''}
                  onChange={(e) => {
                    if (e.target.value) void saveTechnician(e.target.value);
                  }}
                  disabled={busy}
                >
                  <option value="">Unassigned</option>
                  {technicians.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <p className="mb-2 text-xs font-semibold uppercase" style={{ color: 'var(--rs-muted)' }}>
                  Parts used
                </p>
                <ul className="mb-2 space-y-1">
                  {(detail.partsUsed ?? []).map((p) => (
                    <li key={p.id} className="flex justify-between rounded-lg px-2 py-1" style={{ background: 'var(--rs-surface-2)' }}>
                      <span>
                        {p.product?.name ?? 'Part'} × {num(p.quantity)}
                      </span>
                      <span>{inr(num(p.unitPrice) * num(p.quantity))}</span>
                    </li>
                  ))}
                  {!detail.partsUsed?.length ? (
                    <li className="text-xs" style={{ color: 'var(--rs-muted)' }}>
                      No parts yet
                    </li>
                  ) : null}
                </ul>
                <div className="flex flex-wrap gap-2">
                  <select
                    className="rs-input min-w-[160px] flex-1 text-sm"
                    value={partProductId}
                    onChange={(e) => {
                      const id = e.target.value;
                      setPartProductId(id);
                      const p = products.find((x) => x.id === id);
                      if (p) setPartPrice(String(num(p.salePrice)));
                    }}
                  >
                    <option value="">Select part…</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <input
                    className="rs-input w-20 text-sm"
                    value={partQty}
                    onChange={(e) => setPartQty(e.target.value)}
                    placeholder="Qty"
                  />
                  <input
                    className="rs-input w-24 text-sm"
                    value={partPrice}
                    onChange={(e) => setPartPrice(e.target.value)}
                    placeholder="Rate"
                  />
                  <button type="button" className="rs-btn-secondary text-sm" disabled={busy} onClick={() => void addPart()}>
                    Add part
                  </button>
                </div>
              </div>

              {detail.statusHistory?.length ? (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase" style={{ color: 'var(--rs-muted)' }}>
                    History
                  </p>
                  <ul className="space-y-1 text-xs" style={{ color: 'var(--rs-muted)' }}>
                    {detail.statusHistory.map((h) => (
                      <li key={h.id}>
                        {new Date(h.createdAt).toLocaleString('en-IN')} · {h.status}
                        {h.notes ? ` — ${h.notes}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
