import { Injectable, BadRequestException } from '@nestjs/common';
import { unlinkSync } from 'fs';
import { Prisma } from '@prisma/client';
import { mergeLedgerSettings, mergeNumberingSettings } from '@retail-sarathi/gst-engine';
import { PrismaService } from '../prisma/prisma.service';
import { BILLING_TEMPLATES, isBillingTemplateId } from '../billing/billing-templates';
import { validateGstin } from '@retail-sarathi/gst-engine';
import {
  deleteTenantLogoFile,
  isAllowedLogoMime,
  storeTenantLogoFile,
} from './tenant-logo.util';

@Injectable()
export class TenantsService {
  constructor(private prisma: PrismaService) {}

  async getProfile(tenantId: string) {
    return this.prisma.tenant.findUnique({
      where: { id: tenantId },
      include: { branches: true },
    });
  }

  async updateProfile(
    tenantId: string,
    data: {
      name?: string;
      gstin?: string;
      stateCode?: string;
      compositionScheme?: boolean;
      phone?: string;
      email?: string;
      address?: string;
      defaultInvoiceTemplate?: string;
      mobileInvoiceTemplate?: string;
      invoiceDisplayOptions?: Record<string, unknown>;
      bankName?: string;
      bankAccountNo?: string;
      bankIfsc?: string;
      bankBranch?: string;
      invoiceNumbering?: Record<string, unknown>;
      ledgerSettings?: Record<string, unknown>;
    },
  ) {
    if (
      data.defaultInvoiceTemplate !== undefined &&
      !isBillingTemplateId(data.defaultInvoiceTemplate)
    ) {
      throw new BadRequestException('Invalid invoice template');
    }
    if (
      data.mobileInvoiceTemplate !== undefined &&
      !isBillingTemplateId(data.mobileInvoiceTemplate)
    ) {
      throw new BadRequestException('Invalid mobile invoice template');
    }

    const patch: typeof data = { ...data };
    if (patch.gstin !== undefined) {
      const gstin = String(patch.gstin || '')
        .replace(/[\s\-]/g, '')
        .toUpperCase();
      if (gstin && !validateGstin(gstin)) {
        throw new BadRequestException('Invalid GSTIN format');
      }
      patch.gstin = gstin || undefined;
      if (gstin) {
        // Official rule: GSTIN prefix always wins over a manually typed state code.
        patch.stateCode = gstin.slice(0, 2);
      }
    } else if (patch.stateCode !== undefined) {
      const code = String(patch.stateCode).replace(/\D/g, '').padStart(2, '0').slice(0, 2);
      if (!/^\d{2}$/.test(code)) {
        throw new BadRequestException('State code must be 2 digits');
      }
      patch.stateCode = code;
      const current = await this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { gstin: true },
      });
      if (current?.gstin && validateGstin(current.gstin)) {
        const fromGstin = current.gstin.slice(0, 2);
        if (fromGstin !== code) {
          patch.stateCode = fromGstin;
        }
      }
    }

    const updated = await this.prisma.tenant.update({
      where: { id: tenantId },
      data: {
        ...patch,
        invoiceDisplayOptions: patch.invoiceDisplayOptions as Prisma.InputJsonValue | undefined,
        invoiceNumbering: patch.invoiceNumbering
          ? (mergeNumberingSettings(patch.invoiceNumbering) as unknown as Prisma.InputJsonValue)
          : undefined,
        ledgerSettings: patch.ledgerSettings
          ? (mergeLedgerSettings(patch.ledgerSettings) as unknown as Prisma.InputJsonValue)
          : undefined,
      },
      include: { branches: true },
    });

    // Keep default branch aligned with shop GSTIN/state so POS tax splits stay correct.
    if (patch.stateCode || patch.address || patch.gstin) {
      const defaultBranch =
        updated.branches.find((b) => b.isDefault) ?? updated.branches[0];
      if (defaultBranch) {
        await this.prisma.branch.update({
          where: { id: defaultBranch.id },
          data: {
            ...(patch.stateCode ? { stateCode: patch.stateCode } : {}),
            ...(patch.address ? { address: patch.address } : {}),
          },
        });
      }
    }

    return this.getProfile(tenantId);
  }

  async uploadLogo(tenantId: string, file: Express.Multer.File) {
    if (!file) throw new BadRequestException('file is required');
    if (!isAllowedLogoMime(file.mimetype)) {
      try {
        unlinkSync(file.path);
      } catch {
        /* ignore */
      }
      throw new BadRequestException('Logo must be JPEG, PNG, WebP, or GIF');
    }

    const current = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { logoUrl: true },
    });
    if (current?.logoUrl) deleteTenantLogoFile(current.logoUrl);

    const logoUrl = storeTenantLogoFile(tenantId, file);
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { logoUrl },
    });
    return { logoUrl };
  }

  async deleteLogo(tenantId: string) {
    const current = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { logoUrl: true },
    });
    if (current?.logoUrl) deleteTenantLogoFile(current.logoUrl);
    await this.prisma.tenant.update({
      where: { id: tenantId },
      data: { logoUrl: null },
    });
    return { logoUrl: null };
  }

  listBillingTemplates() {
    return BILLING_TEMPLATES;
  }

  async getDashboardStats(tenantId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      todaySales,
      totalProducts,
      allProducts,
      openRepairs,
      customers,
      recentProducts,
      recentInvoices,
      recentStockMovements,
    ] = await Promise.all([
      this.prisma.invoice.aggregate({
        where: { tenantId, createdAt: { gte: today }, status: 'FINALIZED' },
        _sum: { grandTotal: true },
        _count: true,
      }),
      this.prisma.product.count({ where: { tenantId, isActive: true } }),
      this.prisma.product.findMany({
        where: { tenantId, isActive: true },
        select: {
          id: true,
          name: true,
          sku: true,
          stockQty: true,
          lowStockThreshold: true,
          salePrice: true,
        },
      }),
      this.prisma.repairJob.count({
        where: { tenantId, status: { notIn: ['DELIVERED', 'CANCELLED'] } },
      }),
      this.prisma.customer.count({ where: { tenantId } }),
      this.prisma.product.findMany({
        where: { tenantId, isActive: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          id: true,
          name: true,
          sku: true,
          stockQty: true,
          salePrice: true,
          createdAt: true,
        },
      }),
      this.prisma.invoice.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          customer: { select: { name: true } },
          payments: { select: { method: true } },
        },
      }),
      this.prisma.stockLedger.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: 8,
        include: {
          product: { select: { id: true, name: true, sku: true } },
        },
      }),
    ]);

    const lowStockCount = allProducts.filter(
      (p) => Number(p.stockQty) <= Number(p.lowStockThreshold),
    ).length;

    const lowStockItems = allProducts
      .filter((p) => Number(p.stockQty) <= Number(p.lowStockThreshold))
      .sort((a, b) => Number(a.stockQty) - Number(b.stockQty))
      .slice(0, 5)
      .map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        stockQty: Number(p.stockQty),
        lowStockThreshold: Number(p.lowStockThreshold),
        salePrice: Number(p.salePrice),
      }));

    return {
      todayRevenue: Number(todaySales._sum.grandTotal ?? 0),
      todayInvoices: todaySales._count,
      totalProducts,
      lowStockCount,
      openRepairs,
      totalCustomers: customers,
      recentProducts: recentProducts.map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        stockQty: Number(p.stockQty),
        salePrice: Number(p.salePrice),
        createdAt: p.createdAt,
      })),
      recentInvoices: recentInvoices.map((inv) => ({
        id: inv.id,
        invoiceNumber: inv.invoiceNumber,
        grandTotal: Number(inv.grandTotal),
        status: inv.status,
        createdAt: inv.createdAt,
        customerName: inv.customer?.name ?? null,
        paymentMethods: [...new Set(inv.payments.map((p) => p.method))],
      })),
      lowStockItems,
      recentStockMovements: recentStockMovements.map((m) => ({
        id: m.id,
        type: m.type,
        quantity: Number(m.quantity),
        notes: m.notes,
        createdAt: m.createdAt,
        productId: m.productId,
        productName: m.product.name,
        productSku: m.product.sku,
      })),
    };
  }
}
