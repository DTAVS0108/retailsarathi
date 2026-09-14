'use client';
import { AppLoader } from '@/app/_components/app-loader';
import { DocumentViewer } from '@/app/_components/document-viewer';
import { resolveUploadUrl } from '@/lib/upload-url';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Button, Card, formatINR } from '@retail-sarathi/ui';
import { apiWithAuth } from '@/lib/helpers';
import { pageShellClassName,
  MessageBanner,
  PageHeader,
  StatusBadge,
  cn,
  formatDateTime,
  inputClassName,
  parseError,
  selectClassName,
  tableCellClassName,
  tableHeaderClassName,
  textareaClassName,
  toNumber,
} from '../../_components/dashboard-ui';

interface RepairDetail {
  id: string;
  jobNumber: string;
  deviceModel: string;
  imei?: string | null;
  issue: string;
  accessories?: string | null;
  status: string;
  estimateAmount?: number | null;
  finalAmount?: number | null;
  customerApproved?: boolean | null;
  notes?: string | null;
  warrantyDays: number;
  warrantyEndsAt?: string | null;
  photoUrls?: string[];
  linkedInvoiceId?: string | null;
  receivedAt: string;
  deliveredAt?: string | null;
  technician?: { id: string; name: string } | null;
  customer: {
    id: string;
    name: string;
    phone: string;
    gstin?: string | null;
  };
  partsUsed: Array<{
    id: string;
    quantity: number;
    unitPrice: number;
    product: {
      id: string;
      name: string;
      sku: string;
    };
  }>;
  statusHistory: Array<{
    id: string;
    status: string;
    notes?: string | null;
    createdAt: string;
  }>;
}

interface ProductOption {
  id: string;
  name: string;
  sku: string;
  stockQty: number;
  salePrice: number;
}

interface Technician {
  id: string;
  name: string;
}

const STATUS_FLOW: Record<string, string[]> = {
  RECEIVED: ['DIAGNOSED', 'CANCELLED'],
  DIAGNOSED: ['AWAITING_PARTS', 'IN_REPAIR', 'CANCELLED'],
  AWAITING_PARTS: ['IN_REPAIR', 'CANCELLED'],
  IN_REPAIR: ['READY', 'CANCELLED'],
  READY: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

export default function RepairDetailPage() {
  const params = useParams<{ id: string }>();
  const [repair, setRepair] = useState<RepairDetail | null>(null);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [statusNotes, setStatusNotes] = useState('');
  const [finalAmount, setFinalAmount] = useState('');
  const [customerApproved, setCustomerApproved] = useState(false);
  const [partProductId, setPartProductId] = useState('');
  const [partQuantity, setPartQuantity] = useState('1');
  const [partUnitPrice, setPartUnitPrice] = useState('');
  const [technicians, setTechnicians] = useState<Technician[]>([]);
  const [technicianId, setTechnicianId] = useState('');
  const [photoUrlInput, setPhotoUrlInput] = useState('');

  async function loadRepair() {
    try {
      setLoading(true);
      setError('');
      const [repairResponse, productsResponse, techResponse] = await Promise.all([
        apiWithAuth<RepairDetail>(`/repairs/${params.id}`),
        apiWithAuth<{ items: ProductOption[] }>('/products'),
        apiWithAuth<Technician[]>('/users/technicians'),
      ]);
      setRepair(repairResponse);
      setProducts(productsResponse.items);
      setTechnicians(techResponse);
      setTechnicianId(repairResponse.technician?.id ?? '');
      setFinalAmount(
        repairResponse.finalAmount != null
          ? String(toNumber(repairResponse.finalAmount))
          : repairResponse.estimateAmount != null
            ? String(toNumber(repairResponse.estimateAmount))
            : '',
      );
      setCustomerApproved(Boolean(repairResponse.customerApproved));
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (params.id) {
      void loadRepair();
    }
  }, [params.id]);

  const nextStatuses = useMemo(
    () => (repair ? STATUS_FLOW[repair.status] || [] : []),
    [repair],
  );

  async function handleStatusUpdate(status: string) {
    try {
      setSubmitting(true);
      setError('');
      setSuccess('');
      await apiWithAuth(`/repairs/${params.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({
          status,
          notes: statusNotes.trim() || undefined,
          customerApproved,
          finalAmount: finalAmount ? toNumber(finalAmount) : undefined,
        }),
      });
      setSuccess(`Repair status updated to ${status.replace(/_/g, ' ')}.`);
      setStatusNotes('');
      await loadRepair();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAddPart(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      if (!partProductId) throw new Error('Select a part from inventory.');
      if (toNumber(partQuantity) <= 0) throw new Error('Quantity must be greater than zero.');
      if (toNumber(partUnitPrice) < 0) throw new Error('Unit price cannot be negative.');

      setSubmitting(true);
      setError('');
      setSuccess('');
      await apiWithAuth(`/repairs/${params.id}/parts`, {
        method: 'POST',
        body: JSON.stringify({
          productId: partProductId,
          quantity: toNumber(partQuantity),
          unitPrice: toNumber(partUnitPrice),
        }),
      });
      setPartProductId('');
      setPartQuantity('1');
      setPartUnitPrice('');
      setSuccess('Part added to repair job.');
      await loadRepair();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSendEstimate() {
    try {
      setSubmitting(true);
      setError('');
      const res = await apiWithAuth<{ message: string; channel: string }>(`/repairs/${params.id}/send-estimate`, { method: 'POST' });
      setSuccess(`Estimate sent via ${res.channel}.`);
    } catch (err) {
      setError(parseError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAssignTechnician() {
    if (!technicianId) return;
    try {
      setSubmitting(true);
      await apiWithAuth(`/repairs/${params.id}/technician`, {
        method: 'PATCH',
        body: JSON.stringify({ technicianId }),
      });
      setSuccess('Technician assigned.');
      await loadRepair();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleAddPhoto() {
    if (!photoUrlInput.trim()) return;
    const next = [...(repair?.photoUrls ?? []), photoUrlInput.trim()];
    try {
      setSubmitting(true);
      await apiWithAuth(`/repairs/${params.id}/photos`, {
        method: 'PATCH',
        body: JSON.stringify({ photoUrls: next }),
      });
      setPhotoUrlInput('');
      setSuccess('Photo URL saved.');
      await loadRepair();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUploadPhoto(file: File | null) {
    if (!file) return;
    try {
      setSubmitting(true);
      setError('');
      setSuccess('');
      const form = new FormData();
      form.append('file', file);
      await apiWithAuth(`/repairs/${params.id}/photos`, { method: 'POST', body: form });
      setSuccess('Photo uploaded.');
      await loadRepair();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCreateInvoice() {
    try {
      setSubmitting(true);
      const invoice = await apiWithAuth<{ id: string }>(`/repairs/${params.id}/create-invoice`, { method: 'POST' });
      setSuccess('Repair invoice created.');
      window.location.href = `/dashboard/invoices/${invoice.id}`;
    } catch (err) {
      setError(parseError(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={pageShellClassName}>
      <PageHeader
        title={repair ? `Repair ${repair.jobNumber}` : 'Repair detail'}
        description="Track workflow transitions, capture parts used, and maintain a service-ready history for this repair job."
        breadcrumbLabel={repair?.jobNumber ? `Repair ${repair.jobNumber}` : 'Repair'}
      />

      {error ? <MessageBanner tone="error">{error}</MessageBanner> : null}
      {success ? <MessageBanner tone="success">{success}</MessageBanner> : null}

      {loading || !repair ? (
        <Card className="border-slate-200">
          <AppLoader label="Loading repair details..." />
        </Card>
      ) : (
        <>
          <section className="grid gap-4 xl:grid-cols-[1.15fr,0.85fr]">
            <Card className="border-slate-200">
              <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="font-mono text-sm font-semibold text-brand">{repair.jobNumber}</p>
                    <StatusBadge status={repair.status} />
                  </div>
                  <h2 className="text-2xl font-semibold text-slate-900">{repair.deviceModel}</h2>
                  <p className="text-sm text-slate-600">{repair.issue}</p>
                  <div className="grid gap-3 text-sm text-slate-500 sm:grid-cols-2">
                    <p>Customer: {repair.customer.name}</p>
                    <p>Phone: {repair.customer.phone}</p>
                    <p>IMEI: {repair.imei || 'Not captured'}</p>
                    <p>Accessories: {repair.accessories || 'None recorded'}</p>
                    <p>Received: {formatDateTime(repair.receivedAt)}</p>
                    <p>Delivered: {formatDateTime(repair.deliveredAt)}</p>
                    <p>Warranty until: {formatDateTime(repair.warrantyEndsAt)}</p>
                    <p>Technician: {repair.technician?.name ?? 'Unassigned'}</p>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-right">
                    <p className="text-sm text-slate-500">Estimate (ex-GST)</p>
                    <p className="mt-1 text-2xl font-semibold text-slate-900">
                      {formatINR(toNumber(repair.estimateAmount))}
                    </p>
                    <p className="mt-2 text-sm text-slate-500">Final (ex-GST)</p>
                    <p className="font-semibold text-brand">
                      {formatINR(
                        toNumber(repair.finalAmount) > 0
                          ? toNumber(repair.finalAmount)
                          : toNumber(repair.estimateAmount),
                      )}
                      {!(toNumber(repair.finalAmount) > 0) && toNumber(repair.estimateAmount) > 0 ? (
                        <span className="ml-1 text-xs font-normal text-slate-500">(from estimate)</span>
                      ) : null}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">
                      Invoice adds GST (e.g. 18%) on create
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2 justify-end">
                    <Button type="button" variant="secondary" disabled={submitting} onClick={() => void handleSendEstimate()}>
                      Send estimate
                    </Button>
                    {repair.linkedInvoiceId ? (
                      <Link href={`/dashboard/invoices/${repair.linkedInvoiceId}`} className="rs-control border border-slate-200 bg-white text-brand hover:bg-slate-50">
                        View invoice
                      </Link>
                    ) : (
                      <Button type="button" disabled={submitting} onClick={() => void handleCreateInvoice()}>
                        Create invoice
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </Card>

            <Card className="border-slate-200">
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Technician & photos</h3>
                </div>
                <div className="flex gap-2">
                  <select className={selectClassName} value={technicianId} onChange={(e) => setTechnicianId(e.target.value)}>
                    <option value="">Select technician</option>
                    {technicians.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  <Button type="button" variant="secondary" disabled={submitting || !technicianId} onClick={() => void handleAssignTechnician()}>
                    Assign
                  </Button>
                </div>
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-slate-700">Upload photo / file</label>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-teal-50 file:px-3 file:py-2 file:text-sm file:font-medium file:text-teal-800"
                    disabled={submitting}
                    onChange={(event) => {
                      const file = event.target.files?.[0] ?? null;
                      void handleUploadPhoto(file);
                      event.target.value = '';
                    }}
                  />
                </div>
                <div className="flex gap-2">
                  <input className={inputClassName} placeholder="Or paste photo URL" value={photoUrlInput} onChange={(e) => setPhotoUrlInput(e.target.value)} />
                  <Button type="button" variant="secondary" disabled={submitting} onClick={() => void handleAddPhoto()}>Add URL</Button>
                </div>
                {repair.photoUrls?.length ? (
                  <div className="flex flex-wrap gap-3">
                    {repair.photoUrls.map((url, index) => (
                      <DocumentViewer
                        key={`${url}-${index}`}
                        url={resolveUploadUrl(url) ?? url}
                        fileName={`Repair photo ${index + 1}`}
                        height={96}
                        className="w-24 shrink-0"
                      />
                    ))}
                  </div>
                ) : null}
              </div>
            </Card>

            <Card className="border-slate-200">
              <div className="space-y-4">
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Workflow actions</h3>
                  <p className="text-sm text-slate-500">
                    Only backend-allowed transitions are shown for the current status.
                  </p>
                </div>
                <label className="space-y-2 text-sm font-medium text-slate-700">
                  <span>Status notes</span>
                  <textarea
                    className={textareaClassName}
                    value={statusNotes}
                    onChange={(event) => setStatusNotes(event.target.value)}
                    placeholder="Add technician note, diagnosis summary, or handover detail"
                  />
                </label>
                <label className="space-y-2 text-sm font-medium text-slate-700">
                  <span>Final amount</span>
                  <input
                    className={inputClassName}
                    type="number"
                    min="0"
                    step="0.01"
                    value={finalAmount}
                    onChange={(event) => setFinalAmount(event.target.value)}
                  />
                </label>
                <label className="flex items-center gap-3 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={customerApproved}
                    onChange={(event) => setCustomerApproved(event.target.checked)}
                  />
                  Customer approved estimate or final amount
                </label>
                <div className="flex flex-wrap gap-2">
                  {nextStatuses.length ? (
                    nextStatuses.map((status) => (
                      <Button
                        key={status}
                        type="button"
                        onClick={() => void handleStatusUpdate(status)}
                        disabled={submitting}
                        variant={status === 'CANCELLED' ? 'danger' : 'primary'}
                      >
                        {status.replace(/_/g, ' ')}
                      </Button>
                    ))
                  ) : (
                    <p className="text-sm text-slate-500">No further workflow actions available.</p>
                  )}
                </div>
              </div>
            </Card>
          </section>

          <section className="grid gap-4 xl:grid-cols-[0.95fr,1.05fr]">
            <Card className="border-slate-200">
              <form className="space-y-4" onSubmit={handleAddPart}>
                <div>
                  <h3 className="text-lg font-semibold text-slate-900">Add parts used</h3>
                  <p className="text-sm text-slate-500">
                    Issue inventory to the repair job and keep stock and service cost aligned.
                  </p>
                </div>
                <label className="space-y-2 text-sm font-medium text-slate-700">
                  <span>Product</span>
                  <select
                    className={selectClassName}
                    value={partProductId}
                    onChange={(event) => {
                      const nextProductId = event.target.value;
                      const selectedProduct = products.find((product) => product.id === nextProductId);
                      setPartProductId(nextProductId);
                      setPartUnitPrice(
                        selectedProduct ? String(toNumber(selectedProduct.salePrice)) : '',
                      );
                    }}
                  >
                    <option value="">Select inventory item</option>
                    {products.map((product) => (
                      <option key={product.id} value={product.id}>
                        {product.name} ({product.sku}) · Stock {toNumber(product.stockQty)}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="space-y-2 text-sm font-medium text-slate-700">
                    <span>Quantity</span>
                    <input
                      className={inputClassName}
                      type="number"
                      min="0"
                      step="0.001"
                      value={partQuantity}
                      onChange={(event) => setPartQuantity(event.target.value)}
                    />
                  </label>
                  <label className="space-y-2 text-sm font-medium text-slate-700">
                    <span>Unit price</span>
                    <input
                      className={inputClassName}
                      type="number"
                      min="0"
                      step="0.01"
                      value={partUnitPrice}
                      onChange={(event) => setPartUnitPrice(event.target.value)}
                    />
                  </label>
                </div>
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Saving...' : 'Add part'}
                </Button>
              </form>
            </Card>

            <Card className="border-slate-200">
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-slate-900">Parts consumed</h3>
                <p className="text-sm text-slate-500">
                  Billing and stock usage recorded against this repair job.
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className={tableHeaderClassName}>Part</th>
                      <th className={tableHeaderClassName}>Quantity</th>
                      <th className={tableHeaderClassName}>Unit price</th>
                      <th className={tableHeaderClassName}>Line total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {repair.partsUsed.length ? (
                      repair.partsUsed.map((part) => (
                        <tr key={part.id}>
                          <td className={tableCellClassName}>
                            <div>
                              <p className="font-medium text-slate-900">{part.product.name}</p>
                              <p className="text-xs text-slate-500">{part.product.sku}</p>
                            </div>
                          </td>
                          <td className={tableCellClassName}>{toNumber(part.quantity)}</td>
                          <td className={tableCellClassName}>{formatINR(toNumber(part.unitPrice))}</td>
                          <td className={cn(tableCellClassName, 'font-semibold text-slate-900')}>
                            {formatINR(toNumber(part.quantity) * toNumber(part.unitPrice))}
                          </td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={4} className="px-4 py-8 text-center text-sm text-slate-500">
                          No parts have been added yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>
          </section>

          <Card className="border-slate-200">
            <div className="mb-4">
              <h3 className="text-lg font-semibold text-slate-900">Status history</h3>
              <p className="text-sm text-slate-500">
                A chronological service trail from intake through delivery or cancellation.
              </p>
            </div>
            <div className="space-y-3">
              {repair.statusHistory.map((entry) => (
                <div key={entry.id} className="rounded-2xl border border-slate-200 px-4 py-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <StatusBadge status={entry.status} />
                      <span className="text-sm text-slate-500">{formatDateTime(entry.createdAt)}</span>
                    </div>
                    {entry.notes ? <p className="text-sm text-slate-600">{entry.notes}</p> : null}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
