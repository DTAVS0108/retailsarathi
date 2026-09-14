import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class BranchesService {
  constructor(private prisma: PrismaService) {}

  async list(tenantId: string) {
    return this.prisma.branch.findMany({
      where: { tenantId },
      include: { _count: { select: { users: true, invoices: true } } },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(tenantId: string, data: { name: string; address: string; stateCode: string }) {
    return this.prisma.branch.create({
      data: { tenantId, ...data, isDefault: false },
    });
  }

  async update(tenantId: string, id: string, data: { name?: string; address?: string; stateCode?: string }) {
    await this.ensureBranch(tenantId, id);
    return this.prisma.branch.update({ where: { id }, data });
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

  async completeTransfer(tenantId: string, transferId: string) {
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
            notes: `Transfer to branch ${transfer.toBranchId}`,
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

  async getConsolidatedPnl(tenantId: string, from: string, to: string) {
    const branches = await this.list(tenantId);
    const result = await Promise.all(
      branches.map(async (b) => {
        const agg = await this.prisma.invoice.aggregate({
          where: {
            tenantId,
            branchId: b.id,
            status: 'FINALIZED',
            createdAt: { gte: new Date(from), lte: new Date(to) },
          },
          _sum: { grandTotal: true },
          _count: true,
        });
        return {
          branchId: b.id,
          branchName: b.name,
          revenue: Number(agg._sum.grandTotal ?? 0),
          invoiceCount: agg._count,
        };
      }),
    );
    return { period: { from, to }, branches: result, totalRevenue: result.reduce((s, b) => s + b.revenue, 0) };
  }

  private async ensureBranch(tenantId: string, id: string) {
    const b = await this.prisma.branch.findFirst({ where: { id, tenantId } });
    if (!b) throw new NotFoundException('Branch not found');
    return b;
  }
}
