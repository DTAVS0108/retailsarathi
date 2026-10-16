'use client';

import { Fragment, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button, Card, formatINR } from '@retail-sarathi/ui';
import { apiWithAuth } from '@/lib/helpers';
import {
  pageShellClassName,
  EmptyState,
  MessageBanner,
  PageHeader,
  StatusBadge,
  cn,
  formatDate,
  formatDateTime,
  parseError,
  tableCellClassName,
  tableHeaderClassName,
  toNumber,
} from '../../_components/dashboard-ui';

interface StaffDetail {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  createdAt: string;
  phone?: string | null;
  address?: string | null;
  dateOfJoining?: string | null;
  monthlySalary?: number | null;
  commissionPct?: number | null;
  photoUrl?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  branch?: { name: string } | null;
  attendance: Array<{ id: string; checkIn: string; checkOut: string | null; isLate?: boolean }>;
  commissions: Array<{
    id: string;
    periodStart: string;
    periodEnd: string;
    salesTotal: number;
    repairTotal: number;
    commissionPct: number;
    commissionAmt: number;
    invoiceIds: string[];
    repairJobIds: string[];
  }>;
}

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

export default function StaffDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [staff, setStaff] = useState<StaffDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedCommissionId, setExpandedCommissionId] = useState<string | null>(null);

  async function load() {
    try {
      setLoading(true);
      setError('');
      setStaff(await apiWithAuth<StaffDetail>(`/staff/${params.id}`));
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.id]);

  if (loading) {
    return (
      <div className={pageShellClassName}>
        <p className="py-8 text-center text-sm text-slate-500">Loading…</p>
      </div>
    );
  }

  if (error || !staff) {
    return (
      <div className={pageShellClassName}>
        <MessageBanner tone="error">{error || 'Staff member not found'}</MessageBanner>
        <Button type="button" variant="secondary" onClick={() => router.push('/dashboard/staff')}>
          Back to staff
        </Button>
      </div>
    );
  }

  const totalCommissionThisYear = staff.commissions
    .filter((c) => new Date(c.periodStart).getFullYear() === new Date().getFullYear())
    .reduce((s, c) => s + toNumber(c.commissionAmt), 0);

  return (
    <div className={pageShellClassName}>
      <PageHeader
        title={staff.name}
        description={`${staff.role} · ${staff.email}`}
        actions={
          <Button type="button" variant="secondary" onClick={() => router.push('/dashboard/staff')}>
            Back to staff
          </Button>
        }
      />

      <Card className="border-slate-200">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
          <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-brand-light text-xl font-semibold text-brand">
            {initials(staff.name)}
          </span>
          <div className="grid flex-1 gap-x-6 gap-y-3 sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Role</p>
              <div className="mt-1">
                <StatusBadge status={staff.role} />
              </div>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Status</p>
              <p className="mt-1 text-sm text-slate-800">{staff.isActive ? 'Active' : 'Inactive'}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Branch</p>
              <p className="mt-1 text-sm text-slate-800">{staff.branch?.name || '—'}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Phone</p>
              <p className="mt-1 text-sm text-slate-800">{staff.phone || '—'}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Date of joining</p>
              <p className="mt-1 text-sm text-slate-800">{staff.dateOfJoining ? formatDate(staff.dateOfJoining) : '—'}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Monthly salary</p>
              <p className="mt-1 text-sm text-slate-800">{staff.monthlySalary != null ? formatINR(toNumber(staff.monthlySalary)) : '—'}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Commission rate</p>
              <p className="mt-1 text-sm text-slate-800">{staff.commissionPct != null ? `${toNumber(staff.commissionPct)}% (custom)` : 'Role default'}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Address</p>
              <p className="mt-1 text-sm text-slate-800">{staff.address || '—'}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Emergency contact</p>
              <p className="mt-1 text-sm text-slate-800">
                {staff.emergencyContactName ? `${staff.emergencyContactName}${staff.emergencyContactPhone ? ` · ${staff.emergencyContactPhone}` : ''}` : '—'}
              </p>
            </div>
          </div>
        </div>
      </Card>

      <section className="grid gap-4 sm:grid-cols-2">
        <Card className="border-slate-200">
          <p className="text-sm font-medium text-slate-500">Commission earned this year</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{formatINR(totalCommissionThisYear)}</p>
        </Card>
        <Card className="border-slate-200">
          <p className="text-sm font-medium text-slate-500">Attendance records (recent)</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{staff.attendance.length}</p>
        </Card>
      </section>

      <Card className="border-slate-200">
        <h3 className="mb-4 text-lg font-semibold text-slate-900">Recent attendance</h3>
        {!staff.attendance.length ? (
          <EmptyState title="No attendance records" description="Check-ins will appear here once this staff member starts clocking in." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className={tableHeaderClassName}>Check in</th>
                  <th className={tableHeaderClassName}>Check out</th>
                  <th className={tableHeaderClassName}>Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {staff.attendance.map((a) => (
                  <tr key={a.id}>
                    <td className={tableCellClassName}>{formatDateTime(a.checkIn)}</td>
                    <td className={tableCellClassName}>{a.checkOut ? formatDateTime(a.checkOut) : '—'}</td>
                    <td className={tableCellClassName}>
                      <div className="flex flex-wrap gap-1.5">
                        {!a.checkOut ? (
                          <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">On shift</span>
                        ) : null}
                        {a.isLate ? (
                          <span className="inline-flex rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800">Late</span>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Card className="border-slate-200">
        <h3 className="mb-4 text-lg font-semibold text-slate-900">Commission history</h3>
        {!staff.commissions.length ? (
          <EmptyState title="No commission history" description="Run a commission calculation from the Staff page to see results here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-200">
              <thead className="bg-slate-50">
                <tr>
                  <th className={tableHeaderClassName}>Period</th>
                  <th className={tableHeaderClassName}>Sales</th>
                  <th className={tableHeaderClassName}>Repairs</th>
                  <th className={tableHeaderClassName}>Rate</th>
                  <th className={tableHeaderClassName}>Commission</th>
                  <th className={tableHeaderClassName} />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {staff.commissions.map((c) => (
                  <Fragment key={c.id}>
                    <tr>
                      <td className={tableCellClassName}>
                        {formatDate(c.periodStart)} – {formatDate(c.periodEnd)}
                      </td>
                      <td className={tableCellClassName}>{formatINR(toNumber(c.salesTotal))}</td>
                      <td className={tableCellClassName}>{formatINR(toNumber(c.repairTotal))}</td>
                      <td className={tableCellClassName}>{toNumber(c.commissionPct)}%</td>
                      <td className={tableCellClassName}>
                        <span className="font-semibold text-slate-900">{formatINR(toNumber(c.commissionAmt))}</span>
                      </td>
                      <td className={cn(tableCellClassName, 'text-right')}>
                        {c.invoiceIds.length + c.repairJobIds.length > 0 ? (
                          <button
                            type="button"
                            className="text-sm font-medium text-brand hover:underline"
                            onClick={() => setExpandedCommissionId((id) => (id === c.id ? null : c.id))}
                          >
                            {expandedCommissionId === c.id ? 'Hide' : 'Details'}
                          </button>
                        ) : null}
                      </td>
                    </tr>
                    {expandedCommissionId === c.id ? (
                      <tr>
                        <td colSpan={6} className="bg-slate-50/60 px-4 py-3 text-xs text-slate-600">
                          {c.invoiceIds.length ? <p>{c.invoiceIds.length} contributing invoice(s)</p> : null}
                          {c.repairJobIds.length ? <p>{c.repairJobIds.length} contributing repair job(s)</p> : null}
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
