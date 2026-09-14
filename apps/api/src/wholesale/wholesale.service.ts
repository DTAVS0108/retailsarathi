import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PriceListType, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePriceListDto } from './dto/wholesale.dto';

const SEGMENT_TO_PRICE_LIST: Record<string, PriceListType> = {
  RETAIL: 'RETAIL',
  DEALER: 'DEALER',
  DISTRIBUTOR: 'DISTRIBUTOR',
  CORPORATE: 'WHOLESALE',
};

const SEGMENT_LABELS: Record<string, string> = {
  RETAIL: 'Retail walk-in',
  DEALER: 'Dealer',
  DISTRIBUTOR: 'Distributor',
  CORPORATE: 'Corporate (uses Wholesale list)',
};

@Injectable()
export class WholesaleService {
  constructor(private prisma: PrismaService) {}

  segmentToPriceListType(segment?: string): PriceListType {
    return SEGMENT_TO_PRICE_LIST[segment ?? 'RETAIL'] ?? 'RETAIL';
  }

  segmentGuide() {
    return Object.entries(SEGMENT_TO_PRICE_LIST).map(([segment, type]) => ({
      segment,
      priceListType: type,
      label: SEGMENT_LABELS[segment] ?? segment,
    }));
  }

  async getPriceLists(tenantId: string) {
    return this.prisma.priceList.findMany({
      where: { tenantId },
      include: {
        items: {
          include: { product: true },
          orderBy: [{ product: { name: 'asc' } }, { minQty: 'asc' }],
        },
      },
      orderBy: [{ type: 'asc' }, { isDefault: 'desc' }, { name: 'asc' }],
    });
  }

  async getPriceList(tenantId: string, id: string) {
    const list = await this.prisma.priceList.findFirst({
      where: { id, tenantId },
      include: {
        items: {
          include: { product: true },
          orderBy: [{ product: { name: 'asc' } }, { minQty: 'asc' }],
        },
      },
    });
    if (!list) throw new NotFoundException('Price list not found');
    return list;
  }

  private async clearOtherDefaults(
    tx: Prisma.TransactionClient,
    tenantId: string,
    type: PriceListType,
    exceptId?: string,
  ) {
    await tx.priceList.updateMany({
      where: {
        tenantId,
        type,
        isDefault: true,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      data: { isDefault: false },
    });
  }

  async createPriceList(tenantId: string, dto: CreatePriceListDto) {
    const type = dto.type as PriceListType;
    const isDefault = dto.isDefault ?? false;

    return this.prisma.$transaction(async (tx) => {
      if (isDefault) {
        await this.clearOtherDefaults(tx, tenantId, type);
      }

      return tx.priceList.create({
        data: {
          tenantId,
          name: dto.name.trim(),
          type,
          isDefault,
          items: dto.items?.length
            ? {
                create: dto.items.map((i) => ({
                  productId: i.productId,
                  price: i.price,
                  minQty: i.minQty ?? 1,
                })),
              }
            : undefined,
        },
        include: {
          items: { include: { product: true }, orderBy: [{ product: { name: 'asc' } }, { minQty: 'asc' }] },
        },
      });
    });
  }

  async updatePriceList(
    tenantId: string,
    id: string,
    data: { name?: string; isDefault?: boolean; type?: string },
  ) {
    const existing = await this.getPriceList(tenantId, id);
    const nextType = (data.type as PriceListType | undefined) ?? existing.type;

    return this.prisma.$transaction(async (tx) => {
      if (data.isDefault === true) {
        await this.clearOtherDefaults(tx, tenantId, nextType, id);
      }

      return tx.priceList.update({
        where: { id },
        data: {
          name: data.name?.trim(),
          isDefault: data.isDefault,
          type: data.type ? (data.type as PriceListType) : undefined,
        },
        include: {
          items: { include: { product: true }, orderBy: [{ product: { name: 'asc' } }, { minQty: 'asc' }] },
        },
      });
    });
  }

  async deletePriceList(tenantId: string, id: string) {
    await this.getPriceList(tenantId, id);
    await this.prisma.priceList.delete({ where: { id } });
    return { deleted: true };
  }

  async addPriceListItem(
    tenantId: string,
    priceListId: string,
    productId: string,
    price: number,
    minQty = 1,
  ) {
    if (price < 0) throw new BadRequestException('Price cannot be negative');
    if (minQty <= 0) throw new BadRequestException('Min qty must be greater than 0');

    await this.getPriceList(tenantId, priceListId);
    const product = await this.prisma.product.findFirst({ where: { id: productId, tenantId } });
    if (!product) throw new NotFoundException('Product not found');

    const qty = new Prisma.Decimal(minQty);

    return this.prisma.priceListItem.upsert({
      where: {
        priceListId_productId_minQty: {
          priceListId,
          productId,
          minQty: qty,
        },
      },
      create: { priceListId, productId, price, minQty: qty },
      update: { price },
      include: { product: true },
    });
  }

  async removePriceListItem(tenantId: string, priceListId: string, itemId: string) {
    await this.getPriceList(tenantId, priceListId);
    const item = await this.prisma.priceListItem.findFirst({
      where: { id: itemId, priceListId },
    });
    if (!item) throw new NotFoundException('Price list item not found');
    await this.prisma.priceListItem.delete({ where: { id: itemId } });
    return { deleted: true };
  }

  async getPriceForProduct(
    tenantId: string,
    productId: string,
    priceListType: string,
    quantity: number,
  ) {
    const type = priceListType as PriceListType;
    const qty = Math.max(0, Number(quantity) || 1);

    // Prefer default list for this type; else newest list of that type.
    let list = await this.prisma.priceList.findFirst({
      where: { tenantId, type, isDefault: true },
      include: {
        items: { where: { productId, minQty: { lte: qty } } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    if (!list) {
      list = await this.prisma.priceList.findFirst({
        where: { tenantId, type },
        include: {
          items: { where: { productId, minQty: { lte: qty } } },
        },
        orderBy: { updatedAt: 'desc' },
      });
    }

    if (list?.items.length) {
      const best = [...list.items].sort((a, b) => Number(b.minQty) - Number(a.minQty))[0];
      return Number(best.price);
    }

    const product = await this.prisma.product.findFirst({ where: { id: productId, tenantId } });
    return product ? Number(product.salePrice) : 0;
  }
}
