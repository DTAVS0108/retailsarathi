'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Button, Card, formatINR } from '@retail-sarathi/ui';
import { apiWithAuth } from '@/lib/helpers';
import { getStoredUser } from '@/lib/helpers';
import {
  pageShellClassName,
  EmptyState,
  MessageBanner,
  PageHeader,
  StatCard,
  StatusBadge,
  cn,
  formatDate,
  formatDateTime,
  inputClassName,
  parseError,
  selectClassName,
  tableCellClassName,
  tableHeaderClassName,
  toNumber,
} from '../_components/dashboard-ui';
import { ScrollableTabBar } from '../_components/scrollable-tab-bar';
import { RowActionsMenu } from '../_components/row-actions-menu';

interface StaffMember {
  id: string;
  name: string;
  email: string;
  role: 'OWNER' | 'MANAGER' | 'CASHIER' | 'TECHNICIAN';
  branchId: string | null;
  isActive: boolean;
  createdAt: string;
  phone?: string | null;
  dateOfJoining?: string | null;
  monthlySalary?: number | null;
  commissionPct?: number | null;
  branch?: { name: string } | null;
}

interface AttendanceRow {
  id: string;
  checkIn: string;
  checkOut: string | null;
  user: { name: string; role: string };
  branch: { name: string };
}

interface CommissionRow {
  id: string;
  userId: string;
  periodStart: string;
  periodEnd: string;
  salesTotal: number;
  repairTotal: number;
  commissionPct: number;
  commissionAmt: number;
  user: { id: string; name: string; role: string };
}

interface BranchOption {
  id: string;
  name: string;
}

const ROLE_OPTIONS = ['OWNER', 'MANAGER', 'CASHIER', 'TECHNICIAN'] as const;
const LEAVE_TYPES = ['CASUAL', 'SICK', 'EARNED', 'UNPAID'] as const;

const EMPTY_FORM = {
  name: '',
  email: '',
  password: '',
  role: 'CASHIER' as (typeof ROLE_OPTIONS)[number],
  branchId: '',
  phone: '',
  address: '',
  dateOfJoining: '',
  monthlySalary: '',
  commissionPct: '',
  emergencyContactName: '',
  emergencyContactPhone: '',
};

type Tab = 'team' | 'attendance' | 'leave' | 'roster' | 'commissions' | 'payroll';

interface LeaveRequestRow {
  id: string;
  leaveType: string;
  fromDate: string;
  toDate: string;
  reason?: string | null;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'CANCELLED';
  user: { id: string; name: string; role: string };
  approvedBy?: { name: string } | null;
}

interface LeaveBalanceRow {
  leaveType: string;
  allowance: number | null;
  used: number;
  remaining: number | null;
}

interface ShiftOption {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
}

interface ShiftAssignmentRow {
  id: string;
  date: string;
  shift: ShiftOption;
  user: { id: string; name: string };
}

interface Payslip {
  id: string;
  userId: string;
  baseSalary: number;
  commissionAmt: number;
  unpaidLeaveDeduction: number;
  netPay: number;
  paidAt: string | null;
  user: { id: string; name: string; role: string };
}

interface PayrollRunRow {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: 'DRAFT' | 'FINALIZED';
  payslips: Payslip[];
}

function localDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfWeek(d: Date) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() - copy.getDay());
  return copy;
}

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

export default function StaffPage() {
  const currentUser = useMemo(() => getStoredUser(), []);
  const [tab, setTab] = useState<Tab>('team');
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showMoreFields, setShowMoreFields] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const [commissionPeriod, setCommissionPeriod] = useState(() => {
    const now = new Date();
    return {
      start: new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10),
      end: now.toISOString().slice(0, 10),
    };
  });
  const [commissionResults, setCommissionResults] = useState<CommissionRow[]>([]);
  const [calculating, setCalculating] = useState(false);

  const [myShift, setMyShift] = useState<{ id: string; checkIn: string } | null>(null);
  const [myShiftLoading, setMyShiftLoading] = useState(true);
  const [clockBusy, setClockBusy] = useState(false);
  const [clockError, setClockError] = useState('');

  const isManager = currentUser?.role === 'OWNER' || currentUser?.role === 'MANAGER';
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequestRow[]>([]);
  const [leaveBalance, setLeaveBalance] = useState<LeaveBalanceRow[]>([]);
  const [leaveForm, setLeaveForm] = useState({ leaveType: 'CASUAL' as (typeof LEAVE_TYPES)[number], fromDate: '', toDate: '', reason: '' });
  const [leaveSubmitting, setLeaveSubmitting] = useState(false);
  const [leaveLoaded, setLeaveLoaded] = useState(false);

  const [shifts, setShifts] = useState<ShiftOption[]>([]);
  const [roster, setRoster] = useState<ShiftAssignmentRow[]>([]);
  const [rosterWeek, setRosterWeek] = useState(() => startOfWeek(new Date()));
  const [rosterLoaded, setRosterLoaded] = useState(false);
  const [newShift, setNewShift] = useState({ name: '', startTime: '09:00', endTime: '18:00' });

  const [payrollRuns, setPayrollRuns] = useState<PayrollRunRow[]>([]);
  const [payrollLoaded, setPayrollLoaded] = useState(false);
  const [payrollGenerating, setPayrollGenerating] = useState(false);
  const [payrollPeriod, setPayrollPeriod] = useState(() => {
    const now = new Date();
    return {
      start: localDateStr(new Date(now.getFullYear(), now.getMonth(), 1)),
      end: localDateStr(new Date(now.getFullYear(), now.getMonth() + 1, 0)),
    };
  });

  const roleOptions = useMemo(() => {
    if (currentUser?.role === 'MANAGER') return ROLE_OPTIONS.filter((r) => r !== 'OWNER' && r !== 'MANAGER');
    return ROLE_OPTIONS;
  }, [currentUser]);

  async function load() {
    try {
      setLoading(true);
      setError('');
      const [s, a, b] = await Promise.all([
        apiWithAuth<StaffMember[]>('/staff'),
        apiWithAuth<AttendanceRow[]>('/staff/attendance').catch(() => []),
        apiWithAuth<BranchOption[]>('/branches').catch(() => []),
      ]);
      setStaff(s);
      setAttendance(a);
      setBranches(b);
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function refreshMyShift() {
    try {
      setMyShift(await apiWithAuth<{ id: string; checkIn: string } | null>('/staff/attendance/me'));
    } catch {
      // ignore — widget just won't render a state
    } finally {
      setMyShiftLoading(false);
    }
  }

  useEffect(() => {
    void refreshMyShift();
  }, []);

  async function handleClockIn() {
    const branchId = currentUser?.branchId || branches[0]?.id;
    if (!currentUser || !branchId) {
      setClockError('No branch assigned — set one in Shop Settings or on your staff profile.');
      return;
    }
    try {
      setClockBusy(true);
      setClockError('');
      await apiWithAuth('/staff/attendance/check-in', {
        method: 'POST',
        body: JSON.stringify({ userId: currentUser.id, branchId }),
      });
      await Promise.all([refreshMyShift(), load()]);
    } catch (err) {
      setClockError(parseError(err));
    } finally {
      setClockBusy(false);
    }
  }

  async function handleClockOut() {
    if (!myShift) return;
    try {
      setClockBusy(true);
      setClockError('');
      await apiWithAuth(`/staff/attendance/${myShift.id}/check-out`, { method: 'POST' });
      await Promise.all([refreshMyShift(), load()]);
    } catch (err) {
      setClockError(parseError(err));
    } finally {
      setClockBusy(false);
    }
  }

  async function handleAddStaff(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSaving(true);
      setError('');
      await apiWithAuth('/staff', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          password: form.password,
          role: form.role,
          branchId: form.branchId || undefined,
          phone: form.phone || undefined,
          address: form.address || undefined,
          dateOfJoining: form.dateOfJoining || undefined,
          monthlySalary: form.monthlySalary ? Number(form.monthlySalary) : undefined,
          commissionPct: form.commissionPct ? Number(form.commissionPct) : undefined,
          emergencyContactName: form.emergencyContactName || undefined,
          emergencyContactPhone: form.emergencyContactPhone || undefined,
        }),
      });
      setForm(EMPTY_FORM);
      setShowForm(false);
      setShowMoreFields(false);
      setSuccess('Staff member added');
      await load();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setSaving(false);
    }
  }

  async function loadLeave() {
    try {
      setError('');
      const [requests, balance] = await Promise.all([
        apiWithAuth<LeaveRequestRow[]>('/staff/leave'),
        currentUser ? apiWithAuth<LeaveBalanceRow[]>(`/staff/${currentUser.id}/leave/balance`).catch(() => []) : Promise.resolve([]),
      ]);
      setLeaveRequests(requests);
      setLeaveBalance(balance);
      setLeaveLoaded(true);
    } catch (err) {
      setError(parseError(err));
    }
  }

  useEffect(() => {
    if (tab === 'leave' && !leaveLoaded) void loadLeave();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function handleRequestLeave(e: React.FormEvent) {
    e.preventDefault();
    try {
      setLeaveSubmitting(true);
      setError('');
      await apiWithAuth('/staff/leave', { method: 'POST', body: JSON.stringify(leaveForm) });
      setLeaveForm({ leaveType: 'CASUAL', fromDate: '', toDate: '', reason: '' });
      setSuccess('Leave request submitted');
      await loadLeave();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setLeaveSubmitting(false);
    }
  }

  async function handleDecideLeave(id: string, decision: 'APPROVED' | 'REJECTED') {
    try {
      setError('');
      await apiWithAuth(`/staff/leave/${id}/decide`, { method: 'PATCH', body: JSON.stringify({ decision }) });
      setSuccess(`Leave request ${decision.toLowerCase()}`);
      await loadLeave();
    } catch (err) {
      setError(parseError(err));
    }
  }

  async function handleCancelLeave(id: string) {
    try {
      setError('');
      await apiWithAuth(`/staff/leave/${id}/cancel`, { method: 'POST' });
      setSuccess('Leave request cancelled');
      await loadLeave();
    } catch (err) {
      setError(parseError(err));
    }
  }

  async function loadRoster() {
    try {
      setError('');
      const [shiftList, rosterRows] = await Promise.all([
        apiWithAuth<ShiftOption[]>('/staff/shifts'),
        apiWithAuth<ShiftAssignmentRow[]>(`/staff/roster?week=${localDateStr(rosterWeek)}`),
      ]);
      setShifts(shiftList);
      setRoster(rosterRows);
      setRosterLoaded(true);
    } catch (err) {
      setError(parseError(err));
    }
  }

  useEffect(() => {
    if (tab === 'roster') void loadRoster();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, rosterWeek]);

  async function handleCreateShift(e: React.FormEvent) {
    e.preventDefault();
    try {
      setError('');
      await apiWithAuth('/staff/shifts', { method: 'POST', body: JSON.stringify(newShift) });
      setNewShift({ name: '', startTime: '09:00', endTime: '18:00' });
      setSuccess('Shift created');
      await loadRoster();
    } catch (err) {
      setError(parseError(err));
    }
  }

  async function handleAssignShift(userId: string, date: Date, shiftId: string) {
    try {
      setError('');
      if (!shiftId) {
        const existing = roster.find((r) => r.user.id === userId && localDateStr(new Date(r.date)) === localDateStr(date));
        if (existing) await apiWithAuth(`/staff/shift-assignments/${existing.id}/remove`, { method: 'POST' });
      } else {
        await apiWithAuth('/staff/shift-assignments', {
          method: 'POST',
          body: JSON.stringify({ userId, shiftId, date: localDateStr(date) }),
        });
      }
      await loadRoster();
    } catch (err) {
      setError(parseError(err));
    }
  }

  async function loadPayroll() {
    try {
      setError('');
      setPayrollRuns(await apiWithAuth<PayrollRunRow[]>('/staff/payroll'));
      setPayrollLoaded(true);
    } catch (err) {
      setError(parseError(err));
    }
  }

  useEffect(() => {
    if (tab === 'payroll' && !payrollLoaded) void loadPayroll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  async function handleGeneratePayroll() {
    try {
      setPayrollGenerating(true);
      setError('');
      await apiWithAuth('/staff/payroll/generate', {
        method: 'POST',
        body: JSON.stringify({ periodStart: payrollPeriod.start, periodEnd: payrollPeriod.end }),
      });
      setSuccess('Payroll run generated');
      await loadPayroll();
    } catch (err) {
      setError(parseError(err));
    } finally {
      setPayrollGenerating(false);
    }
  }

  async function handleFinalizePayroll(id: string) {
    try {
      setError('');
      await apiWithAuth(`/staff/payroll/${id}/finalize`, { method: 'PATCH' });
      setSuccess('Payroll run finalized');
      await loadPayroll();
    } catch (err) {
      setError(parseError(err));
    }
  }

  async function handleMarkPaid(runId: string, payslipId: string) {
    try {
      setError('');
      await apiWithAuth(`/staff/payroll/${runId}/payslips/${payslipId}/mark-paid`, { method: 'PATCH' });
      await loadPayroll();
    } catch (err) {
      setError(parseError(err));
    }
  }

  async function handleCalculateCommissions() {
    try {
      setCalculating(true);
      setError('');
      const results = await apiWithAuth<CommissionRow[]>('/staff/commissions/calculate', {
        method: 'POST',
        body: JSON.stringify({ periodStart: commissionPeriod.start, periodEnd: commissionPeriod.end }),
      });
      setCommissionResults(results);
      setSuccess(`Commissions calculated for ${results.length} staff member${results.length === 1 ? '' : 's'}`);
    } catch (err) {
      setError(parseError(err));
    } finally {
      setCalculating(false);
    }
  }

  const filteredStaff = staff.filter((s) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q) || (s.phone ?? '').includes(q);
  });

  const activeCount = staff.filter((s) => s.isActive).length;
  const checkedInNow = attendance.filter((a) => !a.checkOut).length;

  return (
    <div className={pageShellClassName}>
      <PageHeader
        title="Staff"
        description="Manage your team, track attendance, and calculate sales/repair commissions."
        actions={
          <Button type="button" onClick={() => setShowForm((v) => !v)}>
            {showForm ? 'Cancel' : 'Add staff'}
          </Button>
        }
      />

      {error ? <MessageBanner tone="error">{error}</MessageBanner> : null}
      {success ? <MessageBanner tone="success">{success}</MessageBanner> : null}

      <section className="grid gap-3 sm:gap-4 sm:grid-cols-3">
        <StatCard label="Total staff" value={String(staff.length)} hint={`${activeCount} active`} />
        <StatCard label="Checked in now" value={String(checkedInNow)} hint="Currently on shift" />
        <StatCard label="Branches" value={String(branches.length)} hint="With staff assigned" />
      </section>

      {!myShiftLoading ? (
        <Card className="border-slate-200">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-slate-500">Your shift</p>
              {myShift ? (
                <p className="text-lg font-semibold text-emerald-700">On shift since {formatDateTime(myShift.checkIn)}</p>
              ) : (
                <p className="text-lg font-semibold text-slate-900">Not checked in</p>
              )}
              {clockError ? <p className="mt-1 text-sm text-rose-600">{clockError}</p> : null}
            </div>
            <Button type="button" variant={myShift ? 'secondary' : 'primary'} onClick={myShift ? handleClockOut : handleClockIn} disabled={clockBusy}>
              {clockBusy ? 'Please wait…' : myShift ? 'Clock out' : 'Clock in'}
            </Button>
          </div>
        </Card>
      ) : null}

      {showForm ? (
        <Card className="border-slate-200">
          <h3 className="mb-3 text-lg font-semibold text-slate-900">Add staff member</h3>
          <form className="space-y-4" onSubmit={handleAddStaff}>
            <div className="grid gap-3 md:grid-cols-3">
              <label className="space-y-1 text-sm font-medium text-slate-700">
                <span>Name</span>
                <input className={inputClassName} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
              </label>
              <label className="space-y-1 text-sm font-medium text-slate-700">
                <span>Email</span>
                <input type="email" className={inputClassName} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required />
              </label>
              <label className="space-y-1 text-sm font-medium text-slate-700">
                <span>Password</span>
                <input type="password" className={inputClassName} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={6} />
              </label>
              <label className="space-y-1 text-sm font-medium text-slate-700">
                <span>Role</span>
                <select className={selectClassName} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as typeof form.role })}>
                  {roleOptions.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm font-medium text-slate-700">
                <span>Branch</span>
                <select className={selectClassName} value={form.branchId} onChange={(e) => setForm({ ...form, branchId: e.target.value })}>
                  <option value="">Unassigned</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="space-y-1 text-sm font-medium text-slate-700">
                <span>Phone</span>
                <input className={inputClassName} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
              </label>
            </div>

            <button
              type="button"
              className="text-sm font-medium text-brand hover:underline"
              onClick={() => setShowMoreFields((v) => !v)}
            >
              {showMoreFields ? 'Hide extra details' : 'Add salary, joining date & emergency contact'}
            </button>

            {showMoreFields ? (
              <div className="grid gap-3 rounded-xl border border-slate-100 bg-slate-50/60 p-4 md:grid-cols-3">
                <label className="space-y-1 text-sm font-medium text-slate-700">
                  <span>Address</span>
                  <input className={inputClassName} value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
                </label>
                <label className="space-y-1 text-sm font-medium text-slate-700">
                  <span>Date of joining</span>
                  <input type="date" className={inputClassName} value={form.dateOfJoining} onChange={(e) => setForm({ ...form, dateOfJoining: e.target.value })} />
                </label>
                <label className="space-y-1 text-sm font-medium text-slate-700">
                  <span>Monthly salary (₹)</span>
                  <input type="number" min="0" className={inputClassName} value={form.monthlySalary} onChange={(e) => setForm({ ...form, monthlySalary: e.target.value })} />
                </label>
                <label className="space-y-1 text-sm font-medium text-slate-700">
                  <span>Commission % override</span>
                  <input type="number" min="0" max="100" step="0.5" className={inputClassName} value={form.commissionPct} onChange={(e) => setForm({ ...form, commissionPct: e.target.value })} placeholder="Role default" />
                </label>
                <label className="space-y-1 text-sm font-medium text-slate-700">
                  <span>Emergency contact name</span>
                  <input className={inputClassName} value={form.emergencyContactName} onChange={(e) => setForm({ ...form, emergencyContactName: e.target.value })} />
                </label>
                <label className="space-y-1 text-sm font-medium text-slate-700">
                  <span>Emergency contact phone</span>
                  <input className={inputClassName} value={form.emergencyContactPhone} onChange={(e) => setForm({ ...form, emergencyContactPhone: e.target.value })} />
                </label>
              </div>
            ) : null}

            <div className="flex gap-2">
              <Button type="submit" disabled={saving}>
                {saving ? 'Adding…' : 'Add staff'}
              </Button>
              <Button type="button" variant="secondary" onClick={() => { setShowForm(false); setForm(EMPTY_FORM); }}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      ) : null}

      <ScrollableTabBar
        tabs={[
          { id: 'team', label: 'Team' },
          { id: 'attendance', label: 'Attendance' },
          { id: 'leave', label: 'Leave' },
          { id: 'roster', label: 'Roster' },
          { id: 'commissions', label: 'Commissions' },
          { id: 'payroll', label: 'Payroll' },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'team' ? (
        <Card className="border-slate-200">
          <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <h3 className="text-lg font-semibold text-slate-900">Team ({filteredStaff.length})</h3>
            <input
              className={cn(inputClassName, 'sm:w-64')}
              placeholder="Search name, email, phone…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {loading ? (
            <p className="py-8 text-center text-sm text-slate-500">Loading…</p>
          ) : !filteredStaff.length ? (
            <EmptyState title="No staff found" description="Try a different search, or add your first team member." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className={tableHeaderClassName}>Staff</th>
                    <th className={tableHeaderClassName}>Role</th>
                    <th className={tableHeaderClassName}>Phone</th>
                    <th className={tableHeaderClassName}>Branch</th>
                    <th className={tableHeaderClassName}>Joined</th>
                    <th className={tableHeaderClassName}>Status</th>
                    <th className={cn(tableHeaderClassName, 'text-right')}>Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStaff.map((s) => (
                    <tr key={s.id} className="transition hover:bg-slate-50">
                      <td className={tableCellClassName}>
                        <div className="flex items-center gap-3">
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-light text-xs font-semibold text-brand">
                            {initials(s.name)}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-medium text-slate-900">{s.name}</p>
                            <p className="truncate text-xs text-slate-500">{s.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className={tableCellClassName}>
                        <StatusBadge status={s.role} />
                      </td>
                      <td className={tableCellClassName}>{s.phone || '—'}</td>
                      <td className={tableCellClassName}>{s.branch?.name || '—'}</td>
                      <td className={tableCellClassName}>{s.dateOfJoining ? formatDate(s.dateOfJoining) : '—'}</td>
                      <td className={tableCellClassName}>
                        <span
                          className={cn(
                            'inline-flex rounded-full px-2.5 py-1 text-xs font-medium',
                            s.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600',
                          )}
                        >
                          {s.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className={cn(tableCellClassName, 'text-right')}>
                        <Link href={`/dashboard/staff/${s.id}`} className="text-sm font-medium text-brand hover:underline">
                          View
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}

      {tab === 'attendance' ? (
        <Card className="border-slate-200">
          <h3 className="mb-4 text-lg font-semibold text-slate-900">Attendance log</h3>
          {!attendance.length ? (
            <EmptyState title="No attendance records yet" description="Check-ins will show up here once staff start clocking in." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className={tableHeaderClassName}>Staff</th>
                    <th className={tableHeaderClassName}>Branch</th>
                    <th className={tableHeaderClassName}>Check in</th>
                    <th className={tableHeaderClassName}>Check out</th>
                    <th className={tableHeaderClassName}>Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {attendance.slice(0, 50).map((a) => (
                    <tr key={a.id}>
                      <td className={tableCellClassName}>{a.user?.name}</td>
                      <td className={tableCellClassName}>{a.branch?.name}</td>
                      <td className={tableCellClassName}>{formatDateTime(a.checkIn)}</td>
                      <td className={tableCellClassName}>{a.checkOut ? formatDateTime(a.checkOut) : '—'}</td>
                      <td className={tableCellClassName}>
                        {a.checkOut ? (
                          <span className="text-xs text-slate-500">Completed</span>
                        ) : (
                          <span className="inline-flex rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-medium text-emerald-800">
                            On shift
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}

      {tab === 'leave' ? (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card className="border-slate-200">
              <h3 className="mb-4 text-lg font-semibold text-slate-900">Request leave</h3>
              <form className="space-y-3" onSubmit={handleRequestLeave}>
                <label className="space-y-1 text-sm font-medium text-slate-700">
                  <span>Type</span>
                  <select className={selectClassName} value={leaveForm.leaveType} onChange={(e) => setLeaveForm((f) => ({ ...f, leaveType: e.target.value as typeof leaveForm.leaveType }))}>
                    {LEAVE_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t.charAt(0) + t.slice(1).toLowerCase()}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <label className="space-y-1 text-sm font-medium text-slate-700">
                    <span>From</span>
                    <input type="date" className={inputClassName} value={leaveForm.fromDate} onChange={(e) => setLeaveForm((f) => ({ ...f, fromDate: e.target.value }))} required />
                  </label>
                  <label className="space-y-1 text-sm font-medium text-slate-700">
                    <span>To</span>
                    <input type="date" className={inputClassName} value={leaveForm.toDate} onChange={(e) => setLeaveForm((f) => ({ ...f, toDate: e.target.value }))} required />
                  </label>
                </div>
                <label className="space-y-1 text-sm font-medium text-slate-700">
                  <span>Reason (optional)</span>
                  <input className={inputClassName} value={leaveForm.reason} onChange={(e) => setLeaveForm((f) => ({ ...f, reason: e.target.value }))} />
                </label>
                <Button type="submit" disabled={leaveSubmitting}>
                  {leaveSubmitting ? 'Submitting…' : 'Submit request'}
                </Button>
              </form>
            </Card>

            <Card className="border-slate-200">
              <h3 className="mb-4 text-lg font-semibold text-slate-900">Your balance this year</h3>
              {!leaveBalance.length ? (
                <p className="text-sm text-slate-500">Loading…</p>
              ) : (
                <div className="space-y-3">
                  {leaveBalance.map((b) => (
                    <div key={b.leaveType} className="flex items-center justify-between rounded-xl border border-slate-100 bg-slate-50/60 px-4 py-3">
                      <span className="text-sm font-medium text-slate-700">{b.leaveType.charAt(0) + b.leaveType.slice(1).toLowerCase()}</span>
                      <span className="text-sm text-slate-600">
                        {b.allowance == null ? `${b.used} used (unlimited)` : `${b.remaining} of ${b.allowance} remaining`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </Card>
          </div>

          <Card className="border-slate-200">
            <h3 className="mb-4 text-lg font-semibold text-slate-900">{isManager ? 'All leave requests' : 'Your leave requests'}</h3>
            {!leaveRequests.length ? (
              <EmptyState title="No leave requests" description="Submitted requests will appear here." />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      {isManager ? <th className={tableHeaderClassName}>Staff</th> : null}
                      <th className={tableHeaderClassName}>Type</th>
                      <th className={tableHeaderClassName}>From</th>
                      <th className={tableHeaderClassName}>To</th>
                      <th className={tableHeaderClassName}>Reason</th>
                      <th className={tableHeaderClassName}>Status</th>
                      <th className={cn(tableHeaderClassName, 'text-right')}>Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {leaveRequests.map((l) => (
                      <tr key={l.id}>
                        {isManager ? <td className={tableCellClassName}>{l.user.name}</td> : null}
                        <td className={tableCellClassName}>{l.leaveType.charAt(0) + l.leaveType.slice(1).toLowerCase()}</td>
                        <td className={tableCellClassName}>{formatDate(l.fromDate)}</td>
                        <td className={tableCellClassName}>{formatDate(l.toDate)}</td>
                        <td className={tableCellClassName}>{l.reason || '—'}</td>
                        <td className={tableCellClassName}>
                          <span
                            className={cn(
                              'inline-flex rounded-full px-2.5 py-1 text-xs font-medium',
                              l.status === 'APPROVED' && 'bg-emerald-100 text-emerald-800',
                              l.status === 'PENDING' && 'bg-amber-100 text-amber-800',
                              (l.status === 'REJECTED' || l.status === 'CANCELLED') && 'bg-slate-100 text-slate-600',
                            )}
                          >
                            {l.status}
                          </span>
                        </td>
                        <td className={cn(tableCellClassName, 'text-right')}>
                          <div className="flex justify-end">
                            <RowActionsMenu
                              actions={
                                isManager
                                  ? [
                                      {
                                        key: 'approve',
                                        label: 'Approve',
                                        hidden: l.status !== 'PENDING',
                                        onClick: () => handleDecideLeave(l.id, 'APPROVED'),
                                      },
                                      {
                                        key: 'reject',
                                        label: 'Reject',
                                        tone: 'danger',
                                        hidden: l.status !== 'PENDING',
                                        onClick: () => handleDecideLeave(l.id, 'REJECTED'),
                                      },
                                    ]
                                  : [
                                      {
                                        key: 'cancel',
                                        label: 'Cancel',
                                        hidden: l.status !== 'PENDING',
                                        onClick: () => handleCancelLeave(l.id),
                                      },
                                    ]
                              }
                            />
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      ) : null}

      {tab === 'roster' ? (
        <div className="space-y-4">
          <Card className="border-slate-200">
            <h3 className="mb-4 text-lg font-semibold text-slate-900">Shifts</h3>
            <form className="mb-4 grid gap-3 sm:grid-cols-4" onSubmit={handleCreateShift}>
              <input className={inputClassName} placeholder="Shift name (e.g. Morning)" value={newShift.name} onChange={(e) => setNewShift((s) => ({ ...s, name: e.target.value }))} required />
              <input type="time" className={inputClassName} value={newShift.startTime} onChange={(e) => setNewShift((s) => ({ ...s, startTime: e.target.value }))} required />
              <input type="time" className={inputClassName} value={newShift.endTime} onChange={(e) => setNewShift((s) => ({ ...s, endTime: e.target.value }))} required />
              <Button type="submit">Add shift</Button>
            </form>
            {!shifts.length ? (
              <p className="text-sm text-slate-500">No shifts defined yet — add one above.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {shifts.map((s) => (
                  <span key={s.id} className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-700">
                    {s.name} · {s.startTime}–{s.endTime}
                  </span>
                ))}
              </div>
            )}
          </Card>

          <Card className="border-slate-200">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-lg font-semibold text-slate-900">
                Week of {rosterWeek.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
              </h3>
              <div className="flex gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => setRosterWeek((w) => { const n = new Date(w); n.setDate(n.getDate() - 7); return n; })}>
                  ← Previous
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => setRosterWeek(startOfWeek(new Date()))}>
                  This week
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => setRosterWeek((w) => { const n = new Date(w); n.setDate(n.getDate() + 7); return n; })}>
                  Next →
                </Button>
              </div>
            </div>
            {!rosterLoaded ? (
              <p className="py-8 text-center text-sm text-slate-500">Loading…</p>
            ) : !shifts.length ? (
              <EmptyState title="Define a shift first" description="Add at least one shift above before building the roster." />
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className={tableHeaderClassName}>Staff</th>
                      {Array.from({ length: 7 }).map((_, i) => {
                        const d = new Date(rosterWeek);
                        d.setDate(d.getDate() + i);
                        return (
                          <th key={i} className={tableHeaderClassName}>
                            {d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric' })}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {staff.filter((s) => s.isActive).map((member) => (
                      <tr key={member.id}>
                        <td className={tableCellClassName}>{member.name}</td>
                        {Array.from({ length: 7 }).map((_, i) => {
                          const d = new Date(rosterWeek);
                          d.setDate(d.getDate() + i);
                          const assignment = roster.find((r) => r.user.id === member.id && localDateStr(new Date(r.date)) === localDateStr(d));
                          return (
                            <td key={i} className={tableCellClassName}>
                              <select
                                className={cn(selectClassName, 'min-w-[7rem] text-xs')}
                                value={assignment?.shift.id ?? ''}
                                onChange={(e) => handleAssignShift(member.id, d, e.target.value)}
                              >
                                <option value="">—</option>
                                {shifts.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      ) : null}

      {tab === 'commissions' ? (
        <Card className="border-slate-200">
          <h3 className="mb-1 text-lg font-semibold text-slate-900">Sales &amp; repair commissions</h3>
          <p className="mb-4 text-sm text-slate-500">
            Calculates each staff member&apos;s commission from finalized invoices and delivered repairs in the period. Uses their custom rate if set, otherwise a role default.
          </p>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <label className="space-y-1 text-sm font-medium text-slate-700">
              <span>From</span>
              <input type="date" className={inputClassName} value={commissionPeriod.start} onChange={(e) => setCommissionPeriod((p) => ({ ...p, start: e.target.value }))} />
            </label>
            <label className="space-y-1 text-sm font-medium text-slate-700">
              <span>To</span>
              <input type="date" className={inputClassName} value={commissionPeriod.end} onChange={(e) => setCommissionPeriod((p) => ({ ...p, end: e.target.value }))} />
            </label>
            <Button type="button" onClick={handleCalculateCommissions} disabled={calculating}>
              {calculating ? 'Calculating…' : 'Calculate commissions'}
            </Button>
          </div>
          {!commissionResults.length ? (
            <EmptyState title="No results yet" description="Pick a period and calculate to see each staff member's commission." />
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className={tableHeaderClassName}>Staff</th>
                    <th className={tableHeaderClassName}>Sales</th>
                    <th className={tableHeaderClassName}>Repairs</th>
                    <th className={tableHeaderClassName}>Rate</th>
                    <th className={tableHeaderClassName}>Commission</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {commissionResults.map((c) => (
                    <tr key={c.id}>
                      <td className={tableCellClassName}>
                        <Link href={`/dashboard/staff/${c.user.id}`} className="font-medium text-brand hover:underline">
                          {c.user.name}
                        </Link>
                        <p className="text-xs text-slate-500">{c.user.role}</p>
                      </td>
                      <td className={tableCellClassName}>{formatINR(toNumber(c.salesTotal))}</td>
                      <td className={tableCellClassName}>{formatINR(toNumber(c.repairTotal))}</td>
                      <td className={tableCellClassName}>{toNumber(c.commissionPct)}%</td>
                      <td className={tableCellClassName}>
                        <span className="font-semibold text-slate-900">{formatINR(toNumber(c.commissionAmt))}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      ) : null}

      {tab === 'payroll' ? (
        <div className="space-y-4">
          <Card className="border-slate-200">
            <h3 className="mb-4 text-lg font-semibold text-slate-900">Generate payroll run</h3>
            <div className="flex flex-wrap items-end gap-3">
              <label className="space-y-1 text-sm font-medium text-slate-700">
                <span>Period start</span>
                <input type="date" className={inputClassName} value={payrollPeriod.start} onChange={(e) => setPayrollPeriod((p) => ({ ...p, start: e.target.value }))} />
              </label>
              <label className="space-y-1 text-sm font-medium text-slate-700">
                <span>Period end</span>
                <input type="date" className={inputClassName} value={payrollPeriod.end} onChange={(e) => setPayrollPeriod((p) => ({ ...p, end: e.target.value }))} />
              </label>
              <Button type="button" onClick={handleGeneratePayroll} disabled={payrollGenerating}>
                {payrollGenerating ? 'Generating…' : 'Generate'}
              </Button>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Combines each staff member&apos;s monthly salary with any commission calculated for this exact period, minus unpaid-leave deductions. Re-generating a draft period recalculates it; finalized runs are locked.
            </p>
          </Card>

          {!payrollLoaded ? (
            <p className="py-8 text-center text-sm text-slate-500">Loading…</p>
          ) : !payrollRuns.length ? (
            <EmptyState title="No payroll runs yet" description="Generate one above to get started." />
          ) : (
            payrollRuns.map((run) => (
              <Card key={run.id} className="border-slate-200">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-semibold text-slate-900">
                      {formatDate(run.periodStart)} – {formatDate(run.periodEnd)}
                    </h3>
                    <span
                      className={cn(
                        'mt-1 inline-flex rounded-full px-2.5 py-1 text-xs font-medium',
                        run.status === 'FINALIZED' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800',
                      )}
                    >
                      {run.status}
                    </span>
                  </div>
                  {run.status === 'DRAFT' ? (
                    <Button type="button" variant="secondary" size="sm" onClick={() => handleFinalizePayroll(run.id)}>
                      Finalize
                    </Button>
                  ) : null}
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className={tableHeaderClassName}>Staff</th>
                        <th className={tableHeaderClassName}>Base salary</th>
                        <th className={tableHeaderClassName}>Commission</th>
                        <th className={tableHeaderClassName}>Unpaid leave</th>
                        <th className={tableHeaderClassName}>Net pay</th>
                        <th className={cn(tableHeaderClassName, 'text-right')}>Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {run.payslips.map((p) => (
                        <tr key={p.id}>
                          <td className={tableCellClassName}>
                            <Link href={`/dashboard/staff/${p.userId}`} className="font-medium text-brand hover:underline">
                              {p.user.name}
                            </Link>
                          </td>
                          <td className={tableCellClassName}>{formatINR(toNumber(p.baseSalary))}</td>
                          <td className={tableCellClassName}>{formatINR(toNumber(p.commissionAmt))}</td>
                          <td className={tableCellClassName}>
                            {toNumber(p.unpaidLeaveDeduction) > 0 ? `-${formatINR(toNumber(p.unpaidLeaveDeduction))}` : '—'}
                          </td>
                          <td className={tableCellClassName}>
                            <span className="font-semibold text-slate-900">{formatINR(toNumber(p.netPay))}</span>
                          </td>
                          <td className={cn(tableCellClassName, 'text-right')}>
                            {p.paidAt ? (
                              <span className="text-xs text-slate-500">Paid {formatDate(p.paidAt)}</span>
                            ) : run.status === 'FINALIZED' ? (
                              <button type="button" className="text-sm font-medium text-brand hover:underline" onClick={() => handleMarkPaid(run.id, p.id)}>
                                Mark paid
                              </button>
                            ) : (
                              <span className="text-xs text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
