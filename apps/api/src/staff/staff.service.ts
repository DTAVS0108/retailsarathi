import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class StaffService {
  constructor(private prisma: PrismaService) {}

  async listStaff(tenantId: string) {
    return this.prisma.user.findMany({
      where: { tenantId },
      select: { id: true, name: true, email: true, role: true, branchId: true, isActive: true, createdAt: true, branch: true },
      orderBy: { name: 'asc' },
    });
  }

  async createStaff(
    tenantId: string,
    data: { name: string; email: string; password: string; role: string; branchId?: string },
  ) {
    const passwordHash = await bcrypt.hash(data.password, 10);
    return this.prisma.user.create({
      data: {
        tenantId,
        name: data.name,
        email: data.email,
        passwordHash,
        role: data.role as UserRole,
        branchId: data.branchId,
      },
      select: { id: true, name: true, email: true, role: true, branchId: true, isActive: true },
    });
  }

  async updateStaff(tenantId: string, id: string, data: { name?: string; role?: string; branchId?: string; isActive?: boolean }) {
    await this.ensureStaff(tenantId, id);
    return this.prisma.user.update({
      where: { id },
      data: { ...data, role: data.role ? (data.role as UserRole) : undefined },
      select: { id: true, name: true, email: true, role: true, branchId: true, isActive: true },
    });
  }

  async checkIn(tenantId: string, userId: string, branchId: string) {
    return this.prisma.staffAttendance.create({
      data: { tenantId, userId, branchId, checkIn: new Date() },
      include: { user: { select: { name: true } }, branch: { select: { name: true } } },
    });
  }

  async checkOut(tenantId: string, attendanceId: string) {
    const att = await this.prisma.staffAttendance.findFirst({ where: { id: attendanceId, tenantId } });
    if (!att) throw new NotFoundException('Attendance record not found');
    if (att.checkOut) throw new BadRequestException('Already checked out');
    return this.prisma.staffAttendance.update({
      where: { id: attendanceId },
      data: { checkOut: new Date() },
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

  async calculateCommissions(tenantId: string, periodStart: string, periodEnd: string, commissionPct = 2) {
    const start = new Date(periodStart);
    const end = new Date(periodEnd);
    const staff = await this.prisma.user.findMany({
      where: { tenantId, isActive: true, role: { in: ['CASHIER', 'MANAGER', 'TECHNICIAN'] } },
    });

    const results = [];
    for (const user of staff) {
      const sales = await this.prisma.invoice.aggregate({
        where: { tenantId, soldByUserId: user.id, status: 'FINALIZED', createdAt: { gte: start, lte: end } },
        _sum: { grandTotal: true },
      });
      const repairs = await this.prisma.repairJob.aggregate({
        where: { tenantId, technicianId: user.id, status: 'DELIVERED', deliveredAt: { gte: start, lte: end } },
        _sum: { finalAmount: true },
      });
      const salesTotal = Number(sales._sum.grandTotal ?? 0);
      const repairTotal = Number(repairs._sum.finalAmount ?? 0);
      const total = salesTotal + repairTotal;
      const commissionAmt = (total * commissionPct) / 100;

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
}
