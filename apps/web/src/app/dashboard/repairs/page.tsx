'use client';
import { AppLoader } from '@/app/_components/app-loader';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { Button, Card, formatINR } from '@retail-sarathi/ui';
import { REPAIR_STATUS_FLOW } from '@retail-sarathi/types';
import { apiWithAuth } from '@/lib/helpers';
import { pageShellClassName,
  EmptyState,
  MessageBanner,
  PageHeader,
  StatusBadge,
  cn,
  inputClassName,
  parseError,
  selectClassName,
  textareaClassName,
  toNumber,
} from '../_components/dashboard-ui';

interface RepairJob {
  id: string;
  jobNumber: string;
  deviceModel: string;
  imei?: string | null;
  issue: string;
  status: string;
  estimateAmount?: number | null;
  createdAt: string;
  customer: { id: string; name: string; phone: string };
}

interface CustomerOption {
  id: string;
  name: string;
  phone: string;
}

interface RepairFormState {
  customerId: string;
  deviceModel: string;
  imei: string;
  issue: string;
  estimateAmount: string;
  serviceTypeId: string;
  powersOn: boolean;
  screenDamage: boolean;
  bodyDamage: boolean;
  intakeNotes: string;
}

interface ServiceTypeOption {
  id: string;
  name: string;
  defaultPrice?: number | null;
}

const EMPTY_FORM: RepairFormState = {
  customerId: '',
  deviceModel: '',
  imei: '',
  issue: '',
  estimateAmount: '',
  serviceTypeId: '',
  powersOn: true,
  screenDamage: false,
  bodyDamage: false,
  intakeNotes: '',
};

/** Only send a checklist if the front desk actually recorded something beyond the default. */
function buildIntakeChecklist(form: RepairFormState) {
  if (form.powersOn && !form.screenDamage && !form.bodyDamage && !form.intakeNotes.trim()) {
    return undefined;
  }
  return {
    powersOn: form.powersOn,
    screenDamage: form.screenDamage,
    bodyDamage: form.bodyDamage,
    notes: form.intakeNotes.trim() || undefined,
  };
}

export default function RepairsPage() {
  const [jobs, setJobs] = useState<RepairJob[]>([]);
  const [customers, setCustomers] = useState<CustomerOption[]>([]);
  const [statusFilter, setStatusFilter] = useState('');
  const [form, setForm] = useState<RepairFormState>(EMPTY_FORM);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [workload, setWorkload] = useState<{
    technicians: Array<{ technicianId: string; name: string; openJobCount: number }>;
    unassignedOpenJobs: number;
  } | null>(null);
  const [serviceTypes, setServiceTypes] = useState<ServiceTypeOption[]>([]);
  const [tenantSlug, setTenantSlug] = useState('');

  async function loadRepairs(status = statusFilter) {
    try {
      setLoading(true);
      setError('');
      const [jobsResponse, customersResponse, workloadResponse, serviceTypesResponse, tenantResponse] = await Promise.all([
        apiWithAuth<RepairJob[]>(`/repairs${status ? `?status=${encodeURIComponent(status)}` : ''}`),
        apiWithAuth<CustomerOption[]>('/customers'),
        apiWithAuth<typeof workload>('/repairs/technicians/workload').catch(() => null),
        apiWithAuth<ServiceTypeOption[]>('/repair-service-types').catch(() => []),
        apiWithAuth<{ slug: string | null }>('/tenants/profile').catch(() => null),
      ]);
      setJobs(jobsResponse);
      setCustomers(customersResponse);
      setWorkload(workloadResponse);
      setServiceTypes(serviceTypesResponse);
      setTenantSlug(tenantResponse?.slug ?? '');
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadRepairs('');
  }, []);

  const openJobs = useMemo(
    () => jobs.filter((job) => !['DELIVERED', 'CANCELLED'].includes(job.status)).length,
    [jobs],
  );

  async function handleCreate(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      if (!form.customerId) throw new Error('Customer is required.');
      if (!form.deviceModel.trim()) throw new Error('Device model is required.');
      if (!form.issue.trim()) throw new Error('Issue description is required.');

      setSaving(true);
      setError('');
      setSuccess('');
      const created = await apiWithAuth<{
        reopenSuggestion?: { jobId: string; jobNumber: string; warrantyEndsAt?: string | null } | null;
      }>('/repairs', {
        method: 'POST',
        body: JSON.stringify({
          customerId: form.customerId,
          deviceModel: form.deviceModel.trim(),
          imei: form.imei.trim() || undefined,
          issue: form.issue.trim(),
          estimateAmount: form.estimateAmount ? toNumber(form.estimateAmount) : undefined,
          serviceTypeId: form.serviceTypeId || undefined,
          intakeChecklist: buildIntakeChecklist(form),
        }),
      });
      setForm(EMPTY_FORM);
      setSuccess(
        created.reopenSuggestion
          ? `Repair job created. Note: this device was serviced before (${created.reopenSuggestion.jobNumber}), still under warranty — consider handling this as a warranty comeback.`
          : 'Repair job created successfully.',
      );
      await loadRepairs();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className={pageShellClassName}>
      <PageHeader
        title="Repair Jobs"
        description="Create repair tickets, keep service queues organized, and move device issues through a predictable workflow."
      />

      {error ? <MessageBanner tone="error">{error}</MessageBanner> : null}
      {success ? <MessageBanner tone="success">{success}</MessageBanner> : null}

      <section className="grid gap-4 md:grid-cols-3">
        <Card className="border-slate-200">
          <p className="text-sm font-medium text-slate-500">Jobs in view</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">{jobs.length}</p>
        </Card>
        <Card className="border-slate-200">
          <p className="text-sm font-medium text-slate-500">Open jobs</p>
          <p className="mt-2 text-3xl font-semibold text-amber-600">{openJobs}</p>
        </Card>
        <Card className="border-slate-200">
          <p className="text-sm font-medium text-slate-500">Estimated value</p>
          <p className="mt-2 text-3xl font-semibold text-slate-900">
            {formatINR(jobs.reduce((sum, job) => sum + toNumber(job.estimateAmount), 0))}
          </p>
        </Card>
      </section>

      {tenantSlug ? (
        <Card className="border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-700">Counter "Now Serving" display</h3>
              <p className="text-xs text-slate-500">
                A public, no-login screen showing ready-for-pickup token numbers — open this link on a
                tablet/TV at the counter.
              </p>
              <p className="mt-1 font-mono text-xs text-slate-400">
                {typeof window !== 'undefined' ? window.location.origin : ''}/queue/{tenantSlug}
              </p>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                const url = `${window.location.origin}/queue/${tenantSlug}`;
                void navigator.clipboard.writeText(url);
                setSuccess('Queue display link copied to clipboard.');
              }}
            >
              Copy display link
            </Button>
          </div>
        </Card>
      ) : null}

      {workload?.technicians.length ? (
        <Card className="border-slate-200">
          <h3 className="text-sm font-semibold text-slate-700">Technician workload</h3>
          <div className="mt-3 flex flex-wrap gap-3">
            {workload.technicians.map((t) => (
              <div key={t.technicianId} className="rounded-xl border border-slate-200 px-3 py-2 text-sm">
                <p className="font-medium text-slate-900">{t.name}</p>
                <p className="text-xs text-slate-500">{t.openJobCount} open job{t.openJobCount === 1 ? '' : 's'}</p>
              </div>
            ))}
            {workload.unassignedOpenJobs > 0 ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm">
                <p className="font-medium text-amber-800">{workload.unassignedOpenJobs} unassigned</p>
              </div>
            ) : null}
          </div>
        </Card>
      ) : null}

      <Card className="border-teal-200 bg-gradient-to-br from-teal-50 to-white">
        <form className="space-y-5" onSubmit={handleCreate}>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Create repair job</h2>
            <p className="text-sm text-slate-500">
              Register the customer device, its issue, and the initial estimate from the front desk.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
            <label className="space-y-2 text-sm font-medium text-slate-700">
              <span>Customer</span>
              <select
                className={selectClassName}
                value={form.customerId}
                onChange={(event) => setForm((current) => ({ ...current, customerId: event.target.value }))}
              >
                <option value="">Select customer</option>
                {customers.map((customer) => (
                  <option key={customer.id} value={customer.id}>
                    {customer.name} ({customer.phone})
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              <span>Device model</span>
              <input
                className={inputClassName}
                value={form.deviceModel}
                onChange={(event) =>
                  setForm((current) => ({ ...current, deviceModel: event.target.value }))
                }
              />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              <span>IMEI / serial</span>
              <input
                className={inputClassName}
                value={form.imei}
                onChange={(event) => setForm((current) => ({ ...current, imei: event.target.value }))}
              />
            </label>
            {serviceTypes.length ? (
              <label className="space-y-2 text-sm font-medium text-slate-700">
                <span>Common service (optional)</span>
                <select
                  className={selectClassName}
                  value={form.serviceTypeId}
                  onChange={(event) => {
                    const serviceTypeId = event.target.value;
                    const picked = serviceTypes.find((s) => s.id === serviceTypeId);
                    setForm((current) => ({
                      ...current,
                      serviceTypeId,
                      estimateAmount:
                        picked?.defaultPrice != null ? String(picked.defaultPrice) : current.estimateAmount,
                    }));
                  }}
                >
                  <option value="">Free-typed / bespoke</option>
                  {serviceTypes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <label className="space-y-2 text-sm font-medium text-slate-700 xl:col-span-2">
              <span>Estimate amount</span>
              <input
                className={inputClassName}
                type="number"
                min="0"
                step="0.01"
                value={form.estimateAmount}
                onChange={(event) =>
                  setForm((current) => ({ ...current, estimateAmount: event.target.value }))
                }
              />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700 md:col-span-2 xl:col-span-5">
              <span>Issue</span>
              <textarea
                className={textareaClassName}
                value={form.issue}
                onChange={(event) => setForm((current) => ({ ...current, issue: event.target.value }))}
              />
            </label>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white/60 p-4">
            <p className="text-sm font-medium text-slate-700">
              Condition at intake <span className="font-normal text-slate-400">(optional)</span>
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Record pre-existing condition before the device leaves the customer's hands.
            </p>
            <div className="mt-3 flex flex-wrap gap-4">
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.powersOn}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, powersOn: event.target.checked }))
                  }
                />
                Powers on
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.screenDamage}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, screenDamage: event.target.checked }))
                  }
                />
                Existing screen damage
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={form.bodyDamage}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, bodyDamage: event.target.checked }))
                  }
                />
                Existing body/case damage
              </label>
            </div>
            <label className="mt-3 block space-y-2 text-sm font-medium text-slate-700">
              <span>Other intake notes</span>
              <input
                className={inputClassName}
                placeholder="e.g. missing back cover, SIM tray, case included"
                value={form.intakeNotes}
                onChange={(event) =>
                  setForm((current) => ({ ...current, intakeNotes: event.target.value }))
                }
              />
            </label>
          </div>

          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={saving}>
              {saving ? 'Saving...' : 'Create repair job'}
            </Button>
            <Button type="button" variant="secondary" onClick={() => setForm(EMPTY_FORM)}>
              Reset
            </Button>
          </div>
        </form>
      </Card>

      <Card className="border-slate-200">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Repair queue</h2>
            <p className="text-sm text-slate-500">
              Open a job to update status, add parts consumption, and capture final billing details.
            </p>
          </div>
          <div className="flex gap-3">
            <select
              className={selectClassName}
              value={statusFilter}
              onChange={(event) => setStatusFilter(event.target.value)}
            >
              <option value="">All statuses</option>
              {Object.keys(REPAIR_STATUS_FLOW).map((status) => (
                <option key={status} value={status}>
                  {status.replace(/_/g, ' ')}
                </option>
              ))}
            </select>
            <Button type="button" variant="secondary" onClick={() => void loadRepairs()}>
              Apply filter
            </Button>
          </div>
        </div>

        <div className="mt-6">
          {loading ? (
            <AppLoader label="Loading repair jobs..." />
          ) : !jobs.length ? (
            <EmptyState
              title="No repair jobs found"
              description="Create a job above or broaden the current status filter."
            />
          ) : (
            <div className="grid gap-4">
              {jobs.map((job) => (
                <Link
                  key={job.id}
                  href={`/dashboard/repairs/${job.id}`}
                  className={cn(
                    'block rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-md',
                    ['READY', 'DELIVERED'].includes(job.status) && 'border-emerald-200',
                  )}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-3">
                        <p className="font-mono text-sm font-semibold text-brand">{job.jobNumber}</p>
                        <StatusBadge status={job.status} />
                      </div>
                      <h3 className="text-lg font-semibold text-slate-900">{job.deviceModel}</h3>
                      <p className="text-sm text-slate-600">{job.issue}</p>
                      <div className="text-sm text-slate-500">
                        {job.customer.name} · {job.customer.phone}
                        {job.imei ? ` · IMEI ${job.imei}` : ''}
                      </div>
                    </div>
                    <div className="space-y-1 text-right">
                      <p className="text-sm text-slate-500">Estimate</p>
                      <p className="text-xl font-semibold text-slate-900">
                        {formatINR(toNumber(job.estimateAmount))}
                      </p>
                      <p className="text-xs text-slate-500">
                        Created {new Date(job.createdAt).toLocaleString('en-IN')}
                      </p>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
