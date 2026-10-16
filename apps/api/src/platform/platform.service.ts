import { Injectable, UnauthorizedException, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { JwtService } from '@nestjs/jwt';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PlatformService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async seedAdmin(email: string, password: string, name: string) {
    const existing = await this.prisma.platformAdmin.count();
    if (existing > 0) return { message: 'Platform admin already exists' };
    const passwordHash = await bcrypt.hash(password, 10);
    return this.prisma.platformAdmin.create({ data: { email, passwordHash, name } });
  }

  async login(email: string, password: string) {
    const admin = await this.prisma.platformAdmin.findUnique({ where: { email } });
    if (!admin || !admin.isActive) throw new UnauthorizedException('Invalid credentials');
    const ok = await bcrypt.compare(password, admin.passwordHash);
    if (!ok) throw new UnauthorizedException('Invalid credentials');
    const token = this.jwt.sign({ sub: admin.id, email: admin.email, platformAdmin: true });
    return { token, admin: { id: admin.id, name: admin.name, email: admin.email } };
  }

  async listTenants(filter?: { search?: string; plan?: string; status?: string }) {
    const search = filter?.search?.trim();
    const tenants = await this.prisma.tenant.findMany({
      where: {
        ...(search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { gstin: { contains: search, mode: 'insensitive' } },
              ],
            }
          : {}),
        ...(filter?.status ? { subscriptionStatus: filter.status as never } : {}),
        ...(filter?.plan ? { subscription: { plan: { code: filter.plan } } } : {}),
      },
      include: {
        subscription: { include: { plan: true } },
        _count: { select: { users: true, products: true, branches: true, invoices: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    return tenants.map((t) => ({
      id: t.id,
      name: t.name,
      gstin: t.gstin,
      subscriptionStatus: t.subscriptionStatus,
      plan: t.subscription?.plan?.name ?? 'None',
      planCode: t.subscription?.plan?.code ?? null,
      isSuspended: t.isSuspended,
      users: t._count.users,
      products: t._count.products,
      branches: t._count.branches,
      invoices: t._count.invoices,
      createdAt: t.createdAt,
    }));
  }

  async getTenantDetail(id: string) {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id },
      include: {
        subscription: { include: { plan: true } },
        _count: { select: { users: true, products: true, branches: true, invoices: true } },
      },
    });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const [tickets, invoices] = await Promise.all([
      this.prisma.supportTicket.findMany({ where: { tenantId: id }, orderBy: { createdAt: 'desc' }, take: 20 }),
      this.prisma.subscriptionInvoice.findMany({ where: { tenantId: id }, orderBy: { createdAt: 'desc' }, take: 20 }),
    ]);

    return {
      id: tenant.id,
      name: tenant.name,
      gstin: tenant.gstin,
      address: tenant.address,
      phone: tenant.phone,
      email: tenant.email,
      isSuspended: tenant.isSuspended,
      suspendedAt: tenant.suspendedAt,
      suspendedReason: tenant.suspendedReason,
      subscriptionStatus: tenant.subscriptionStatus,
      plan: tenant.subscription?.plan ?? null,
      usage: {
        users: tenant._count.users,
        products: tenant._count.products,
        branches: tenant._count.branches,
        invoices: tenant._count.invoices,
      },
      createdAt: tenant.createdAt,
      tickets,
      subscriptionInvoices: invoices,
    };
  }

  async suspendTenant(tenantId: string, adminId: string, reason?: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { isSuspended: true, suspendedAt: new Date(), suspendedReason: reason?.trim() || null },
    });
    await this.logAction(adminId, 'SUSPEND_TENANT', 'TENANT', tenantId, { reason: reason?.trim() || null });
    return updated;
  }

  async reactivateTenant(tenantId: string, adminId: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { isSuspended: false, suspendedAt: null, suspendedReason: null },
    });
    await this.logAction(adminId, 'REACTIVATE_TENANT', 'TENANT', tenantId);
    return updated;
  }

  private async logAction(adminId: string, action: string, targetType: string, targetId: string, detail?: Record<string, unknown>) {
    await this.prisma.platformAuditLog.create({
      data: { adminId, action, targetType, targetId, detail: (detail ?? undefined) as Prisma.InputJsonValue },
    });
  }

  async getAuditLog() {
    return this.prisma.platformAuditLog.findMany({
      include: { admin: { select: { name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async getPlatformStats() {
    const [tenants, users, invoices, tickets] = await Promise.all([
      this.prisma.tenant.count(),
      this.prisma.user.count(),
      this.prisma.invoice.count({ where: { status: 'FINALIZED' } }),
      this.prisma.supportTicket.count({ where: { status: 'OPEN' } }),
    ]);
    const mrr = await this.prisma.tenantSubscription.findMany({
      where: { status: 'ACTIVE' },
      include: { plan: true },
    });
    const monthlyRecurring = mrr.reduce((s, sub) => s + Number(sub.plan.priceMonthly), 0);
    return { tenants, users, invoices, openTickets: tickets, estimatedMrr: monthlyRecurring };
  }

  async listTickets(status?: string) {
    return this.prisma.supportTicket.findMany({
      where: status ? { status: status as never } : {},
      include: { tenant: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async createTicket(tenantId: string, subject: string, body: string, priority = 'normal') {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');
    return this.prisma.supportTicket.create({ data: { tenantId, subject, body, priority } });
  }

  async updateTicket(id: string, status: string, adminId: string) {
    const ticket = await this.prisma.supportTicket.update({ where: { id }, data: { status: status as never } });
    await this.logAction(adminId, 'RESOLVE_TICKET', 'TICKET', id, { status });
    return ticket;
  }
}
