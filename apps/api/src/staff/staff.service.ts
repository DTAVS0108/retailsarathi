import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateStaffDto, UpdateStaffDto } from './dto/staff.dto';

const ROLE_DEFAULT_COMMISSION_PCT: Partial<Record<UserRole, number>> = {
  CASHIER: 2,
  TECHNICIAN: 5,
  MANAGER: 1,
};

/** Simple flat annual allowance per leave type (days/year) — not yet tenant-configurable. */
const ANNUAL_LEAVE_ALLOWANCE: Record<string, number> = {
  CASUAL: 12,
  SICK: 12,
  EARNED: 12,
  UNPAID: Infinity,
};

/**
 * A bare "YYYY-MM-DD" from a date picker means "this calendar day where the shop is" —
 * `new Date("YYYY-MM-DD")` parses it as UTC midnight instead, which silently shifts to the
 * previous local day for several hours every night in IST (UTC+5:30). Parse as local midnight
 * so it lines up with computeIsLate's local-time day window.
 */
function parseLocalDateOnly(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

const STAFF_SELECT = {
  id: true,
  name: true,
  email: true,
  role: true,
  branchId: true,
  isActive: true,
  createdAt: true,
  phone: true,
  address: true,
  dateOfJoining: true,
  monthlySalary: true,
  commissionPct: true,
  photoUrl: true,
  emergencyContactName: true,
  emergencyContactPhone: true,
} as const;

@Injectable()
export class StaffService {
  constructor(private prisma: PrismaService) {}

  async listStaff(tenantId: string) {
    return this.prisma.user.findMany({
      where: { tenantId },
      select: { ...STAFF_SELECT, branch: true },
      orderBy: { name: 'asc' },
    });
  }

  async getStaffById(tenantId: string, id: string) {
    const user = await this.prisma.user.findFirst({
      where: { id, tenantId },
      select: { ...STAFF_SELECT, branch: true },
    });
    if (!user) throw new NotFoundException('Staff member not found');

    const [attendance, commissions] = await Promise.all([
      this.prisma.staffAttendance.findMany({
        where: { tenantId, userId: id },
        orderBy: { checkIn: 'desc' },
        take: 30,
      }),
      this.prisma.staffCommission.findMany({
        where: { tenantId, userId: id },
        orderBy: { periodStart: 'desc' },
        take: 12,
      }),
    ]);

    return { ...user, attendance, commissions };
  }

  /** Only an OWNER may create or promote a user to OWNER/MANAGER; a MANAGER may only manage CASHIER/TECHNICIAN. */
  private assertCanAssignRole(callerRole: UserRole, targetRole: UserRole) {
    if ((targetRole === 'OWNER' || targetRole === 'MANAGER') && callerRole !== 'OWNER') {
      throw new ForbiddenException('Only an OWNER can create or promote to OWNER or MANAGER');
    }
  }

  async createStaff(tenantId: string, callerRole: UserRole, data: CreateStaffDto) {
    this.assertCanAssignRole(callerRole, data.role as UserRole);
    const passwordHash = await bcrypt.hash(data.password, 10);
    return this.prisma.user.create({
      data: {
        tenantId,
        name: data.name,
        email: data.email,
        passwordHash,
        role: data.role as UserRole,
        branchId: data.branchId,
        phone: data.phone,
        address: data.address,
        dateOfJoining: data.dateOfJoining ? new Date(data.dateOfJoining) : undefined,
        monthlySalary: data.monthlySalary,
        commissionPct: data.commissionPct,
        photoUrl: data.photoUrl,
        emergencyContactName: data.emergencyContactName,
        emergencyContactPhone: data.emergencyContactPhone,
      },
      select: STAFF_SELECT,
    });
  }

  async updateStaff(tenantId: string, callerRole: UserRole, id: string, data: UpdateStaffDto) {
    const existing = await this.ensureStaff(tenantId, id);
    if (callerRole === 'MANAGER' && (existing.role === 'OWNER' || existing.role === 'MANAGER')) {
      throw new ForbiddenException('Managers cannot edit OWNER or MANAGER accounts');
    }
    if (data.role) this.assertCanAssignRole(callerRole, data.role as UserRole);

    return this.prisma.user.update({
      where: { id },
      data: {
        ...data,
        role: data.role ? (data.role as UserRole) : undefined,
        dateOfJoining: data.dateOfJoining ? new Date(data.dateOfJoining) : undefined,
      },
      select: STAFF_SELECT,
    });
  }

  /** True if `checkIn` is later than the user's assigned shift start (if any) for that day, else the tenant's expectedCheckInTime. */
  private async computeIsLate(tenantId: string, userId: string, checkIn: Date): Promise<boolean> {
    const dayStart = new Date(checkIn);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayEnd.getDate() + 1);

    const assignment = await this.prisma.shiftAssignment.findFirst({
      where: { tenantId, userId, date: { gte: dayStart, lt: dayEnd } },
      include: { shift: true },
    });

    let expected = assignment?.shift.startTime;
    if (!expected) {
      const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId }, select: { expectedCheckInTime: true } });
      expected = tenant?.expectedCheckInTime ?? undefined;
    }
    if (!expected) return false;

    const [h, m] = expected.split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return false;
    const expectedAt = new Date(checkIn);
    expectedAt.setHours(h, m, 0, 0);
    return checkIn.getTime() > expectedAt.getTime();
  }

  async checkIn(tenantId: string, callerId: string, callerRole: UserRole, userId: string, branchId: string) {
    if (callerRole !== 'OWNER' && callerRole !== 'MANAGER' && callerId !== userId) {
      throw new ForbiddenException('You can only check yourself in');
    }
    const open = await this.prisma.staffAttendance.findFirst({
      where: { tenantId, userId, checkOut: null },
    });
    if (open) throw new BadRequestException('Already checked in — check out first');

    const checkIn = new Date();
    const isLate = await this.computeIsLate(tenantId, userId, checkIn);

    return this.prisma.staffAttendance.create({
      data: { tenantId, userId, branchId, checkIn, isLate },
      include: { user: { select: { name: true } }, branch: { select: { name: true } } },
    });
  }

  /** OWNER/MANAGER correction for someone who forgot to clock in/out, or a fresh manual record. */
  async recordManualAttendance(
    tenantId: string,
    data: { userId: string; branchId: string; checkIn: string; checkOut?: string; notes?: string },
  ) {
    const checkIn = new Date(data.checkIn);
    const isLate = await this.computeIsLate(tenantId, data.userId, checkIn);
    return this.prisma.staffAttendance.create({
      data: {
        tenantId,
        userId: data.userId,
        branchId: data.branchId,
        checkIn,
        checkOut: data.checkOut ? new Date(data.checkOut) : undefined,
        isLate,
        notes: data.notes,
      },
      include: { user: { select: { name: true } }, branch: { select: { name: true } } },
    });
  }

  async updateAttendance(
    tenantId: string,
    id: string,
    data: { checkIn?: string; checkOut?: string; notes?: string },
  ) {
    const att = await this.prisma.staffAttendance.findFirst({ where: { id, tenantId } });
    if (!att) throw new NotFoundException('Attendance record not found');
    return this.prisma.staffAttendance.update({
      where: { id },
      data: {
        checkIn: data.checkIn ? new Date(data.checkIn) : undefined,
        checkOut: data.checkOut ? new Date(data.checkOut) : undefined,
        notes: data.notes,
      },
      include: { user: { select: { name: true } }, branch: { select: { name: true } } },
    });
  }

  async getAttendanceSummary(tenantId: string, userId: string, month: string) {
    const [y, m] = month.split('-').map(Number);
    if (!Number.isFinite(y) || !Number.isFinite(m)) {
      throw new BadRequestException('month must be YYYY-MM');
    }
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 1);

    const rows = await this.prisma.staffAttendance.findMany({
      where: { tenantId, userId, checkIn: { gte: start, lt: end } },
    });

    const presentDays = new Set(rows.map((r) => r.checkIn.toDateString())).size;
    const lateDays = new Set(rows.filter((r) => r.isLate).map((r) => r.checkIn.toDateString())).size;
    const totalHours = rows.reduce((s, r) => {
      if (!r.checkOut) return s;
      return s + (r.checkOut.getTime() - r.checkIn.getTime()) / 3_600_000;
    }, 0);

    // Working days = Mon–Sat in the month (simple default; not tenant-configurable yet).
    let workingDays = 0;
    for (let d = new Date(start); d < end; d.setDate(d.getDate() + 1)) {
      if (d.getDay() !== 0) workingDays += 1;
    }
    const absentDays = Math.max(0, workingDays - presentDays);

    return { month, presentDays, lateDays, absentDays, workingDays, totalHours: Math.round(totalHours * 10) / 10 };
  }

  async checkOut(tenantId: string, callerId: string, callerRole: UserRole, attendanceId: string) {
    const att = await this.prisma.staffAttendance.findFirst({ where: { id: attendanceId, tenantId } });
    if (!att) throw new NotFoundException('Attendance record not found');
    if (callerRole !== 'OWNER' && callerRole !== 'MANAGER' && att.userId !== callerId) {
      throw new ForbiddenException('You can only check yourself out');
    }
    if (att.checkOut) throw new BadRequestException('Already checked out');
    return this.prisma.staffAttendance.update({
      where: { id: attendanceId },
      data: { checkOut: new Date() },
    });
  }

  /** The caller's own currently-open attendance row (if any) — for the self-service clock widget. */
  async getMyOpenAttendance(tenantId: string, userId: string) {
    return this.prisma.staffAttendance.findFirst({
      where: { tenantId, userId, checkOut: null },
      orderBy: { checkIn: 'desc' },
    });
  }

  async getAttendance(tenantId: string, from?: string, to?: string) {
    return this.prisma.staffAttendance.findMany({
      where: {
        tenantId,
        ...(from || to
          ? { checkIn: { ...(from ? { gte: new Date(from) } : {}), ...(to ? { lte: new Date(to) } : {}) } }
          : {}),
      },
      include: { user: { select: { name: true, role: true } }, branch: { select: { name: true } } },
      orderBy: { checkIn: 'desc' },
      take: 200,
    });
  }

  /**
   * Idempotent: recalculating an overlapping period for the same users replaces their
   * existing rows in that exact range rather than accumulating duplicates.
   */
  async calculateCommissions(tenantId: string, periodStart: string, periodEnd: string, commissionPctOverride?: number) {
    const start = new Date(periodStart);
    const end = new Date(periodEnd);
    const staff = await this.prisma.user.findMany({
      where: { tenantId, isActive: true, role: { in: ['CASHIER', 'MANAGER', 'TECHNICIAN'] } },
    });

    const results = [];
    for (const user of staff) {
      const commissionPct =
        commissionPctOverride ?? Number(user.commissionPct ?? ROLE_DEFAULT_COMMISSION_PCT[user.role] ?? 2);

      const [sales, repairs] = await Promise.all([
        this.prisma.invoice.findMany({
          where: { tenantId, soldByUserId: user.id, status: 'FINALIZED', createdAt: { gte: start, lte: end } },
          select: { id: true, grandTotal: true },
        }),
        this.prisma.repairJob.findMany({
          where: { tenantId, technicianId: user.id, status: 'DELIVERED', deliveredAt: { gte: start, lte: end } },
          select: { id: true, finalAmount: true },
        }),
      ]);

      const salesTotal = sales.reduce((s, i) => s + Number(i.grandTotal), 0);
      const repairTotal = repairs.reduce((s, r) => s + Number(r.finalAmount ?? 0), 0);
      const commissionAmt = ((salesTotal + repairTotal) * commissionPct) / 100;

      await this.prisma.staffCommission.deleteMany({
        where: { tenantId, userId: user.id, periodStart: start, periodEnd: end },
      });
      const record = await this.prisma.staffCommission.create({
        data: {
          tenantId,
          userId: user.id,
          periodStart: start,
          periodEnd: end,
          salesTotal,
          repairTotal,
          commissionPct,
          commissionAmt,
          invoiceIds: sales.map((i) => i.id),
          repairJobIds: repairs.map((r) => r.id),
        },
      });
      results.push({ user: { id: user.id, name: user.name, role: user.role }, ...record });
    }
    return results;
  }

  private async ensureStaff(tenantId: string, id: string) {
    const u = await this.prisma.user.findFirst({ where: { id, tenantId } });
    if (!u) throw new NotFoundException('Staff member not found');
    return u;
  }

  // ─── Leave management ────────────────────────────────────────────

  async requestLeave(
    tenantId: string,
    userId: string,
    data: { leaveType: string; fromDate: string; toDate: string; reason?: string },
  ) {
    const fromDate = new Date(data.fromDate);
    const toDate = new Date(data.toDate);
    if (toDate < fromDate) throw new BadRequestException('toDate must be on or after fromDate');

    const overlapping = await this.prisma.leaveRequest.findFirst({
      where: {
        tenantId,
        userId,
        status: { in: ['PENDING', 'APPROVED'] },
        fromDate: { lte: toDate },
        toDate: { gte: fromDate },
      },
    });
    if (overlapping) {
      throw new BadRequestException('Overlaps an existing pending or approved leave request');
    }

    return this.prisma.leaveRequest.create({
      data: { tenantId, userId, leaveType: data.leaveType, fromDate, toDate, reason: data.reason },
    });
  }

  async listLeave(tenantId: string, callerId: string, callerRole: UserRole, filters: { userId?: string; status?: string }) {
    const scopedUserId =
      callerRole === 'OWNER' || callerRole === 'MANAGER' ? filters.userId : callerId;
    return this.prisma.leaveRequest.findMany({
      where: {
        tenantId,
        ...(scopedUserId ? { userId: scopedUserId } : {}),
        ...(filters.status ? { status: filters.status as never } : {}),
      },
      include: { user: { select: { id: true, name: true, role: true } }, approvedBy: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async decideLeave(tenantId: string, approverId: string, id: string, decision: 'APPROVED' | 'REJECTED') {
    const leave = await this.prisma.leaveRequest.findFirst({ where: { id, tenantId } });
    if (!leave) throw new NotFoundException('Leave request not found');
    if (leave.status !== 'PENDING') throw new BadRequestException('This request has already been decided');
    return this.prisma.leaveRequest.update({
      where: { id },
      data: { status: decision, approvedById: approverId, decidedAt: new Date() },
    });
  }

  async cancelLeave(tenantId: string, callerId: string, callerRole: UserRole, id: string) {
    const leave = await this.prisma.leaveRequest.findFirst({ where: { id, tenantId } });
    if (!leave) throw new NotFoundException('Leave request not found');
    if (callerRole !== 'OWNER' && callerRole !== 'MANAGER' && leave.userId !== callerId) {
      throw new ForbiddenException('You can only cancel your own leave request');
    }
    if (leave.status === 'CANCELLED') throw new BadRequestException('Already cancelled');
    return this.prisma.leaveRequest.update({ where: { id }, data: { status: 'CANCELLED' } });
  }

  async getLeaveBalance(tenantId: string, userId: string, year: number) {
    const start = new Date(year, 0, 1);
    const end = new Date(year + 1, 0, 1);
    const approved = await this.prisma.leaveRequest.findMany({
      where: { tenantId, userId, status: 'APPROVED', fromDate: { gte: start, lt: end } },
    });

    const usedByType: Record<string, number> = {};
    for (const l of approved) {
      const days = Math.round((l.toDate.getTime() - l.fromDate.getTime()) / 86_400_000) + 1;
      usedByType[l.leaveType] = (usedByType[l.leaveType] ?? 0) + days;
    }

    return Object.keys(ANNUAL_LEAVE_ALLOWANCE).map((type) => ({
      leaveType: type,
      allowance: Number.isFinite(ANNUAL_LEAVE_ALLOWANCE[type]) ? ANNUAL_LEAVE_ALLOWANCE[type] : null,
      used: usedByType[type] ?? 0,
      remaining: Number.isFinite(ANNUAL_LEAVE_ALLOWANCE[type])
        ? Math.max(0, ANNUAL_LEAVE_ALLOWANCE[type] - (usedByType[type] ?? 0))
        : null,
    }));
  }

  // ─── Shift scheduling ────────────────────────────────────────────

  async listShifts(tenantId: string) {
    return this.prisma.shift.findMany({ where: { tenantId }, orderBy: { startTime: 'asc' } });
  }

  async createShift(tenantId: string, data: { name: string; startTime: string; endTime: string; branchId?: string }) {
    return this.prisma.shift.create({ data: { tenantId, ...data } });
  }

  async getRoster(tenantId: string, weekStart: string) {
    const start = parseLocalDateOnly(weekStart);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);

    return this.prisma.shiftAssignment.findMany({
      where: { tenantId, date: { gte: start, lt: end } },
      include: { shift: true, user: { select: { id: true, name: true } } },
      orderBy: { date: 'asc' },
    });
  }

  async assignShift(tenantId: string, data: { userId: string; shiftId: string; date: string }) {
    const date = parseLocalDateOnly(data.date);
    return this.prisma.shiftAssignment.upsert({
      where: { userId_date: { userId: data.userId, date } },
      update: { shiftId: data.shiftId },
      create: { tenantId, userId: data.userId, shiftId: data.shiftId, date },
      include: { shift: true, user: { select: { id: true, name: true } } },
    });
  }

  async unassignShift(tenantId: string, id: string) {
    const assignment = await this.prisma.shiftAssignment.findFirst({ where: { id, tenantId } });
    if (!assignment) throw new NotFoundException('Shift assignment not found');
    await this.prisma.shiftAssignment.delete({ where: { id } });
    return { ok: true };
  }

  // ─── Payroll ─────────────────────────────────────────────────────

  async listPayrollRuns(tenantId: string) {
    return this.prisma.payrollRun.findMany({
      where: { tenantId },
      include: { payslips: { include: { user: { select: { id: true, name: true, role: true } } } } },
      orderBy: { periodStart: 'desc' },
    });
  }

  /** Idempotent for a DRAFT run: regenerating the same period recomputes its payslips rather than duplicating the run. */
  async generatePayroll(tenantId: string, periodStart: string, periodEnd: string) {
    const start = new Date(periodStart);
    const end = new Date(periodEnd);

    const existing = await this.prisma.payrollRun.findFirst({
      where: { tenantId, periodStart: start, periodEnd: end },
    });
    if (existing && existing.status === 'FINALIZED') {
      throw new BadRequestException('This period has already been finalized — cannot regenerate.');
    }

    const run =
      existing ?? (await this.prisma.payrollRun.create({ data: { tenantId, periodStart: start, periodEnd: end } }));

    const staff = await this.prisma.user.findMany({ where: { tenantId, isActive: true } });
    const daysInPeriod = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);

    for (const user of staff) {
      const baseSalary = Number(user.monthlySalary ?? 0);

      const commissions = await this.prisma.staffCommission.findMany({
        where: { tenantId, userId: user.id, periodStart: { gte: start }, periodEnd: { lte: end } },
      });
      const commissionAmt = commissions.reduce((s, c) => s + Number(c.commissionAmt), 0);

      const unpaidLeave = await this.prisma.leaveRequest.findMany({
        where: {
          tenantId,
          userId: user.id,
          leaveType: 'UNPAID',
          status: 'APPROVED',
          fromDate: { lte: end },
          toDate: { gte: start },
        },
      });
      const unpaidDays = unpaidLeave.reduce((s, l) => {
        const from = l.fromDate < start ? start : l.fromDate;
        const to = l.toDate > end ? end : l.toDate;
        return s + Math.max(0, Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1);
      }, 0);
      const dailyRate = baseSalary / daysInPeriod;
      const unpaidLeaveDeduction = Math.round(unpaidDays * dailyRate * 100) / 100;

      const netPay = Math.round((baseSalary + commissionAmt - unpaidLeaveDeduction) * 100) / 100;

      await this.prisma.payslip.upsert({
        where: { payrollRunId_userId: { payrollRunId: run.id, userId: user.id } },
        update: { baseSalary, commissionAmt, unpaidLeaveDeduction, netPay },
        create: { payrollRunId: run.id, userId: user.id, baseSalary, commissionAmt, unpaidLeaveDeduction, netPay },
      });
    }

    return this.prisma.payrollRun.findUnique({
      where: { id: run.id },
      include: { payslips: { include: { user: { select: { id: true, name: true, role: true } } } } },
    });
  }

  async finalizePayroll(tenantId: string, runId: string) {
    const run = await this.prisma.payrollRun.findFirst({ where: { id: runId, tenantId } });
    if (!run) throw new NotFoundException('Payroll run not found');
    if (run.status === 'FINALIZED') throw new BadRequestException('Already finalized');
    return this.prisma.payrollRun.update({ where: { id: runId }, data: { status: 'FINALIZED' } });
  }

  async markPayslipPaid(tenantId: string, runId: string, payslipId: string) {
    const run = await this.prisma.payrollRun.findFirst({ where: { id: runId, tenantId } });
    if (!run) throw new NotFoundException('Payroll run not found');
    const payslip = await this.prisma.payslip.findFirst({ where: { id: payslipId, payrollRunId: runId } });
    if (!payslip) throw new NotFoundException('Payslip not found');
    return this.prisma.payslip.update({ where: { id: payslipId }, data: { paidAt: new Date() } });
  }

  async getMyPayslips(tenantId: string, userId: string) {
    return this.prisma.payslip.findMany({
      where: { userId, payrollRun: { tenantId, status: 'FINALIZED' } },
      include: { payrollRun: true },
      orderBy: { payrollRun: { periodStart: 'desc' } },
    });
  }
}
