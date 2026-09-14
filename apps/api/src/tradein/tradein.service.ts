import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  ConvertTradeInDto,
  CreateTradeInDto,
  UpdateTradeInDto,
} from './dto/tradein.dto';

const OPEN_STATUSES = ['QUOTED', 'ACCEPTED', 'RECEIVED'] as const;
const TERMINAL = new Set(['REFURBISHED', 'SOLD', 'REJECTED']);

const ALLOWED: Record<string, string[]> = {
  QUOTED: ['ACCEPTED', 'REJECTED'],
  ACCEPTED: ['RECEIVED', 'REJECTED'],
  RECEIVED: ['REJECTED'],
  REFURBISHED: ['SOLD'],
  SOLD: [],
  REJECTED: [],
};

@Injectable()
export class TradeInService {
  constructor(private prisma: PrismaService) {}

  private analyze(row: {
    deviceModel: string;
    imei: string | null;
    quotedValue: Prisma.Decimal | number;
    finalValue: Prisma.Decimal | number | null;
    status: string;
  }) {
    const missingFields: string[] = [];
    if (!row.deviceModel?.trim()) missingFields.push('deviceModel');
    if (!(Number(row.quotedValue) > 0)) missingFields.push('quotedValue');

    // IMEI required before intake / inventory convert
    if (['ACCEPTED', 'RECEIVED'].includes(row.status) && !row.imei?.trim()) {
      missingFields.push('imei');
    }
    // Final value recommended once accepted (defaults to quote on convert)
    if (
      ['ACCEPTED', 'RECEIVED'].includes(row.status) &&
      row.finalValue == null &&
      !(Number(row.quotedValue) > 0)
    ) {
      missingFields.push('finalValue');
    }

    return { missingFields };
  }

  private async withCustomer(row: {
    id: string;
    tenantId: string;
    customerId: string | null;
    deviceModel: string;
    imei: string | null;
    condition: string;
    quotedValue: Prisma.Decimal | number;
    finalValue: Prisma.Decimal | number | null;
    status: string;
    notes: string | null;
    refurbProductId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }) {
    let customer: { id: string; name: string; phone: string } | null = null;
    if (row.customerId) {
      customer = await this.prisma.customer.findFirst({
        where: { id: row.customerId },
        select: { id: true, name: true, phone: true },
      });
    }
    return {
      ...row,
      ...this.analyze(row),
      customer,
      quotedValue: Number(row.quotedValue),
      finalValue: row.finalValue == null ? null : Number(row.finalValue),
    };
  }

  async list(tenantId: string, status?: string) {
    const filter = (status || 'OPEN').toUpperCase();
    const where =
      filter === 'ALL'
        ? { tenantId }
        : filter === 'OPEN'
          ? { tenantId, status: { in: [...OPEN_STATUSES] } }
          : { tenantId, status: filter as never };

    const rows = await this.prisma.tradeIn.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 100,
    });
    return Promise.all(rows.map((row) => this.withCustomer(row)));
  }

  async getOne(tenantId: string, id: string) {
    const row = await this.ensure(tenantId, id);
    return this.withCustomer(row);
  }

  async create(tenantId: string, data: CreateTradeInDto) {
    const deviceModel = data.deviceModel?.trim();
    if (!deviceModel) throw new BadRequestException('Device model is required');
    if (!(Number(data.quotedValue) > 0)) {
      throw new BadRequestException('Quoted value must be greater than 0');
    }
    if (data.customerId) {
      const customer = await this.prisma.customer.findFirst({
        where: { id: data.customerId, tenantId },
      });
      if (!customer) throw new BadRequestException('Customer not found');
    }

    const imei = data.imei?.trim() || null;
    if (imei) await this.assertImeiFree(tenantId, imei);

    const row = await this.prisma.tradeIn.create({
      data: {
        tenantId,
        customerId: data.customerId || null,
        deviceModel,
        imei,
        condition: (data.condition as never) ?? 'REFURB',
        quotedValue: data.quotedValue,
        notes: data.notes?.trim() || null,
        status: 'QUOTED',
      },
    });
    return this.withCustomer(row);
  }

  async update(tenantId: string, id: string, data: UpdateTradeInDto) {
    const existing = await this.ensure(tenantId, id);
    if (TERMINAL.has(existing.status)) {
      throw new BadRequestException(`Cannot edit a ${existing.status} trade-in`);
    }

    if (data.customerId) {
      const customer = await this.prisma.customer.findFirst({
        where: { id: data.customerId, tenantId },
      });
      if (!customer) throw new BadRequestException('Customer not found');
    }

    const imei = data.imei !== undefined ? data.imei.trim() || null : undefined;
    if (imei) await this.assertImeiFree(tenantId, imei, id);

    if (data.deviceModel !== undefined && !data.deviceModel.trim()) {
      throw new BadRequestException('Device model is required');
    }
    if (data.quotedValue !== undefined && !(Number(data.quotedValue) > 0)) {
      throw new BadRequestException('Quoted value must be greater than 0');
    }

    const row = await this.prisma.tradeIn.update({
      where: { id },
      data: {
        ...(data.customerId !== undefined ? { customerId: data.customerId || null } : {}),
        ...(data.deviceModel !== undefined ? { deviceModel: data.deviceModel.trim() } : {}),
        ...(imei !== undefined ? { imei } : {}),
        ...(data.condition !== undefined ? { condition: data.condition as never } : {}),
        ...(data.quotedValue !== undefined ? { quotedValue: data.quotedValue } : {}),
        ...(data.finalValue !== undefined ? { finalValue: data.finalValue } : {}),
        ...(data.notes !== undefined ? { notes: data.notes.trim() || null } : {}),
      },
    });
    return this.withCustomer(row);
  }

  async updateStatus(tenantId: string, id: string, status: string, finalValue?: number) {
    const existing = await this.ensure(tenantId, id);
    const next = status.toUpperCase();
    const allowed = ALLOWED[existing.status] ?? [];
    if (!allowed.includes(next)) {
      throw new BadRequestException(
        `Cannot move from ${existing.status} to ${next}. Allowed: ${allowed.join(', ') || 'none'}`,
      );
    }

    if (next === 'ACCEPTED' || next === 'RECEIVED') {
      const { missingFields } = this.analyze({
        ...existing,
        status: next,
        finalValue: finalValue ?? existing.finalValue,
      });
      // Accept can proceed without IMEI; Receive/convert need it later
      if (next === 'RECEIVED' && missingFields.includes('imei')) {
        throw new BadRequestException('IMEI / serial is required before marking received');
      }
    }

    const row = await this.prisma.tradeIn.update({
      where: { id },
      data: {
        status: next as never,
        ...(finalValue != null ? { finalValue } : {}),
      },
    });
    return this.withCustomer(row);
  }

  async convertToInventory(tenantId: string, id: string, body: ConvertTradeInDto = {}) {
    const tradeIn = await this.ensure(tenantId, id);
    if (!['ACCEPTED', 'RECEIVED'].includes(tradeIn.status)) {
      throw new BadRequestException('Accept the trade-in before converting to inventory');
    }

    const imei = tradeIn.imei?.trim();
    if (!imei) {
      throw new BadRequestException('IMEI / serial is required before converting to inventory');
    }
    await this.assertImeiFree(tenantId, imei, id);

    const buyPrice = Number(tradeIn.finalValue ?? tradeIn.quotedValue);
    if (!(buyPrice > 0)) {
      throw new BadRequestException('Quoted / final value must be greater than 0');
    }
    const salePrice =
      body.salePrice != null && Number(body.salePrice) > 0
        ? Number(body.salePrice)
        : Math.round(buyPrice * 1.2 * 100) / 100;

    const sku =
      body.sku?.trim() ||
      `TI-${tradeIn.deviceModel.replace(/[^A-Za-z0-9]/g, '').slice(0, 8).toUpperCase() || 'DEV'}-${Date.now().toString(36).toUpperCase()}`;

    const skuClash = await this.prisma.product.findFirst({
      where: { tenantId, sku },
    });
    if (skuClash) throw new BadRequestException(`SKU already exists: ${sku}`);

    await this.ensureCategory(tenantId, 'Trade-in');

    const product = await this.prisma.product.create({
      data: {
        tenantId,
        sku,
        name: `${tradeIn.deviceModel} (Trade-in)`,
        model: tradeIn.deviceModel,
        hsnCode: '8517',
        salePrice,
        purchasePrice: buyPrice,
        gstRate: 18,
        stockQty: 1,
        category: 'Trade-in',
        trackSerial: true,
        needsEnrichment: true,
      },
    });

    await this.prisma.productSerial.create({
      data: {
        productId: product.id,
        serialNumber: imei,
        imei,
        condition: tradeIn.condition,
        status: 'IN_STOCK',
      },
    });

    const existingPending = await this.prisma.productEnrichment.findFirst({
      where: { tenantId, productId: product.id, status: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
    if (existingPending) {
      await this.prisma.productEnrichment.update({
        where: { id: existingPending.id },
        data: {
          missingFields: ['barcode', 'salePrice'],
          draftName: tradeIn.deviceModel,
          notes: 'From trade-in convert',
        },
      });
    } else {
      await this.prisma.productEnrichment.create({
        data: {
          tenantId,
          productId: product.id,
          status: 'PENDING',
          missingFields: ['barcode', 'salePrice'],
          draftName: tradeIn.deviceModel,
          notes: 'From trade-in convert',
        },
      });
    }

    const row = await this.prisma.tradeIn.update({
      where: { id },
      data: {
        status: 'REFURBISHED',
        refurbProductId: product.id,
        finalValue: tradeIn.finalValue ?? buyPrice,
      },
    });

    return {
      ...(await this.withCustomer(row)),
      product: {
        id: product.id,
        sku: product.sku,
        name: product.name,
        salePrice: Number(product.salePrice),
        purchasePrice: Number(product.purchasePrice),
      },
    };
  }

  private async assertImeiFree(tenantId: string, imei: string, exceptTradeInId?: string) {
    const open = await this.prisma.tradeIn.findFirst({
      where: {
        tenantId,
        imei,
        status: { in: [...OPEN_STATUSES, 'REFURBISHED'] },
        ...(exceptTradeInId ? { id: { not: exceptTradeInId } } : {}),
      },
    });
    if (open) {
      throw new BadRequestException(`IMEI already on trade-in ${open.deviceModel} (${open.status})`);
    }
    const serial = await this.prisma.productSerial.findFirst({
      where: {
        OR: [{ serialNumber: imei }, { imei }],
        product: { tenantId },
      },
    });
    if (serial) throw new BadRequestException(`IMEI / serial already in inventory: ${imei}`);
  }

  private async ensureCategory(tenantId: string, name: string) {
    try {
      await this.prisma.productCategory.create({ data: { tenantId, name } });
    } catch {
      /* already exists */
    }
  }

  private async ensure(tenantId: string, id: string) {
    const t = await this.prisma.tradeIn.findFirst({ where: { id, tenantId } });
    if (!t) throw new NotFoundException('Trade-in not found');
    return t;
  }
}
