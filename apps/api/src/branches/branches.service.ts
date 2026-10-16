import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { endOfDay } from '../reports/period.util';

@Injectable()
export class BranchesService {
  constructor(private prisma: PrismaService) {}

  async list(tenantId: string) {
    const branches = await this.prisma.branch.findMany({
      where: { tenantId },
      include: {
        _count: { select: { users: true, invoices: true } },
        manager: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'asc' },
    });

    // Low-stock count per branch: quantity at or below its own reorderLevel, falling back to
    // the product's global lowStockThreshold when the branch hasn't set its own.
    const withLowStock = await Promise.all(
      branches.map(async (b) => {
        const rows = await this.prisma.branchStock.findMany({
          where: { tenantId, branchId: b.id },
          include: { product: { select: { lowStockThreshold: true } } },
        });
        const lowStockCount = rows.filter((r) => {
          const threshold = r.reorderLevel != null ? Number(r.reorderLevel) : Number(r.product.lowStockThreshold);
          return Number(r.quantity) <= threshold;
        }).length;
        return { ...b, lowStockCount };
      }),
    );
    return withLowStock;
  }

  async create(tenantId: string, data: { name: string; address: string; stateCode: string; managerId?: string }) {
    if (data.managerId) await this.ensureManager(tenantId, data.managerId);
    return this.prisma.branch.create({
      data: { tenantId, ...data, isDefault: false },
    });
  }

  async update(
    tenantId: string,
    id: string,
    data: { name?: string; address?: string; stateCode?: string; managerId?: string | null },
  ) {
    await this.ensureBranch(tenantId, id);
    if (data.managerId) await this.ensureManager(tenantId, data.managerId);
    return this.prisma.branch.update({ where: { id }, data });
  }

  private async ensureManager(tenantId: string, userId: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, tenantId } });
    if (!user) throw new BadRequestException('Manager not found');
    if (user.role !== 'OWNER' && user.role !== 'MANAGER') {
      throw new BadRequestException('Branch manager must have the OWNER or MANAGER role');
    }
  }

  async updateStockReorderLevel(tenantId: string, branchId: string, productId: string, reorderLevel: number | null) {
    await this.ensureBranch(tenantId, branchId);
    return this.prisma.branchStock.update({
      where: { branchId_productId: { branchId, productId } },
      data: { reorderLevel },
    });
  }

  async getBranchStock(tenantId: string, branchId: string) {
    await this.ensureBranch(tenantId, branchId);
    return this.prisma.branchStock.findMany({
      where: { branchId, tenantId },
      include: { product: true },
    });
  }

  async initBranchStock(tenantId: string, branchId: string) {
    await this.ensureBranch(tenantId, branchId);
    const products = await this.prisma.product.findMany({ where: { tenantId, isActive: true } });
    for (const p of products) {
      await this.prisma.branchStock.upsert({
        where: { branchId_productId: { branchId, productId: p.id } },
        create: { tenantId, branchId, productId: p.id, quantity: p.stockQty },
        update: {},
      });
    }
    return this.getBranchStock(tenantId, branchId);
  }

  async createTransfer(
    tenantId: string,
    fromBranchId: string,
    toBranchId: string,
    items: Array<{ productId: string; quantity: number }>,
    notes?: string,
  ) {
    if (fromBranchId === toBranchId) throw new BadRequestException('Cannot transfer to same branch');
    return this.prisma.branchTransfer.create({
      data: {
        tenantId,
        fromBranchId,
        toBranchId,
        notes,
        items: { create: items.map((i) => ({ productId: i.productId, quantity: i.quantity })) },
      },
      include: { items: { include: { product: true } }, fromBranch: true, toBranch: true },
    });
  }

  /** PENDING → IN_TRANSIT: marks goods as dispatched. No stock movement yet — that happens on receive. */
  async dispatchTransfer(tenantId: string, transferId: string) {
    const transfer = await this.prisma.branchTransfer.findFirst({ where: { id: transferId, tenantId } });
    if (!transfer) throw new NotFoundException('Transfer not found');
    if (transfer.status !== 'PENDING') {
      throw new BadRequestException('Only a pending transfer can be dispatched');
    }
    return this.prisma.branchTransfer.update({
      where: { id: transferId },
      data: { status: 'IN_TRANSIT' },
      include: { items: { include: { product: true } }, fromBranch: true, toBranch: true },
    });
  }

  /** PENDING or IN_TRANSIT → CANCELLED. Safe at both stages since stock only moves on receive. */
  async cancelTransfer(tenantId: string, transferId: string) {
    const transfer = await this.prisma.branchTransfer.findFirst({ where: { id: transferId, tenantId } });
    if (!transfer) throw new NotFoundException('Transfer not found');
    if (transfer.status !== 'PENDING' && transfer.status !== 'IN_TRANSIT') {
      throw new BadRequestException('Only a pending or in-transit transfer can be cancelled');
    }
    return this.prisma.branchTransfer.update({
      where: { id: transferId },
      data: { status: 'CANCELLED' },
      include: { items: { include: { product: true } }, fromBranch: true, toBranch: true },
    });
  }

  /** IN_TRANSIT (or PENDING, for a same-building instant transfer) → COMPLETED. Moves stock exactly once. */
  async receiveTransfer(tenantId: string, transferId: string) {
    const transfer = await this.prisma.branchTransfer.findFirst({
      where: { id: transferId, tenantId },
      include: { items: true },
    });
    if (!transfer) throw new NotFoundException('Transfer not found');
    if (transfer.status !== 'PENDING' && transfer.status !== 'IN_TRANSIT') {
      throw new BadRequestException('Transfer already completed or cancelled');
    }

    return this.prisma.$transaction(async (tx) => {
      for (const item of transfer.items) {
        const qty = Number(item.quantity);
        const fromStock = await tx.branchStock.findUnique({
          where: { branchId_productId: { branchId: transfer.fromBranchId, productId: item.productId } },
        });
        if (!fromStock || Number(fromStock.quantity) < qty) {
          throw new BadRequestException(`Insufficient stock for product ${item.productId}`);
        }
        await tx.branchStock.update({
          where: { branchId_productId: { branchId: transfer.fromBranchId, productId: item.productId } },
          data: { quantity: { decrement: qty } },
        });
        await tx.branchStock.upsert({
          where: { branchId_productId: { branchId: transfer.toBranchId, productId: item.productId } },
          create: { tenantId, branchId: transfer.toBranchId, productId: item.productId, quantity: qty },
          update: { quantity: { increment: qty } },
        });
        await tx.stockLedger.create({
          data: {
            tenantId,
            productId: item.productId,
            type: 'TRANSFER',
            quantity: -qty,
            referenceId: transferId,
            notes: `Transfer out to branch ${transfer.toBranchId}`,
          },
        });
        await tx.stockLedger.create({
          data: {
            tenantId,
            productId: item.productId,
            type: 'TRANSFER',
            quantity: qty,
            referenceId: transferId,
            notes: `Transfer in from branch ${transfer.fromBranchId}`,
          },
        });
      }
      return tx.branchTransfer.update({
        where: { id: transferId },
        data: { status: 'COMPLETED', completedAt: new Date() },
        include: { items: { include: { product: true } }, fromBranch: true, toBranch: true },
      });
    });
  }

  async listTransfers(tenantId: string) {
    return this.prisma.branchTransfer.findMany({
      where: { tenantId },
      include: { items: { include: { product: true } }, fromBranch: true, toBranch: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Real profit per branch: sale revenue + delivered-repair revenue, minus cost of goods sold. */
  async getConsolidatedPnl(tenantId: string, from: string, to: string) {
    const branches = await this.list(tenantId);
    const fromDate = new Date(from);
    // BUG FIX: a bare "to" date parses as that day's midnight, silently excluding the whole
    // day itself from `lte` comparisons — extend it to the end of that calendar day.
    const toDate = endOfDay(new Date(to));

    const result = await Promise.all(
      branches.map(async (b) => {
        const [agg, invoices, repairAgg] = await Promise.all([
          this.prisma.invoice.aggregate({
            where: { tenantId, branchId: b.id, status: 'FINALIZED', createdAt: { gte: fromDate, lte: toDate } },
            _sum: { grandTotal: true },
            _count: true,
          }),
          this.prisma.invoice.findMany({
            where: { tenantId, branchId: b.id, status: 'FINALIZED', createdAt: { gte: fromDate, lte: toDate } },
            select: {
              lines: { select: { quantity: true, product: { select: { purchasePrice: true } } } },
            },
          }),
          this.prisma.repairJob.aggregate({
            where: { tenantId, branchId: b.id, status: 'DELIVERED', deliveredAt: { gte: fromDate, lte: toDate } },
            _sum: { finalAmount: true },
            _count: true,
          }),
        ]);

        const revenue = Number(agg._sum.grandTotal ?? 0);
        const cogs = invoices.reduce(
          (sum, inv) =>
            sum +
            inv.lines.reduce((lineSum, l) => lineSum + Number(l.quantity) * Number(l.product?.purchasePrice ?? 0), 0),
          0,
        );
        const repairRevenue = Number(repairAgg._sum.finalAmount ?? 0);

        return {
          branchId: b.id,
          branchName: b.name,
          revenue,
          invoiceCount: agg._count,
          cogs: Math.round(cogs * 100) / 100,
          repairRevenue,
          repairCount: repairAgg._count,
          netProfit: Math.round((revenue + repairRevenue - cogs) * 100) / 100,
        };
      }),
    );
    return {
      period: { from, to },
      branches: result,
      totalRevenue: result.reduce((s, b) => s + b.revenue, 0),
      totalNetProfit: result.reduce((s, b) => s + b.netProfit, 0),
    };
  }

  private async ensureBranch(tenantId: string, id: string) {
    const b = await this.prisma.branch.findFirst({ where: { id, tenantId } });
    if (!b) throw new NotFoundException('Branch not found');
    return b;
  }
}
