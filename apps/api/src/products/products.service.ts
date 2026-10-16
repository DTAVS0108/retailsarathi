import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { nearestGstSlab } from '@retail-sarathi/gst-engine';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProductDto, UpdateProductDto } from './dto/product.dto';
import {
  buildProductCsv,
  buildProductTemplateCsv,
  parseProductSpreadsheet,
  type ProductImportRow,
} from './product-import.util';

type ProductAttachment = {
  url: string;
  name: string;
  mimeType?: string;
  size?: number;
};

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async findAll(
    tenantId: string,
    opts: {
      search?: string;
      page?: number;
      pageSize?: number;
      category?: string;
      brand?: string;
      supplierId?: string;
      gstRate?: number;
      lowStock?: boolean;
      outOfStock?: boolean;
    } = {},
  ) {
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 50));
    const search = opts.search?.trim();

    let supplierProductIds: string[] | undefined;
    if (opts.supplierId) {
      supplierProductIds = await this.productIdsForSupplier(tenantId, opts.supplierId);
      if (!supplierProductIds.length) {
        return { items: [], total: 0, page, pageSize };
      }
    }

    const where = {
      tenantId,
      isActive: true,
      ...(supplierProductIds ? { id: { in: supplierProductIds } } : {}),
      ...(opts.category
        ? { category: { equals: opts.category, mode: 'insensitive' as const } }
        : {}),
      ...(opts.brand ? { brand: { equals: opts.brand, mode: 'insensitive' as const } } : {}),
      ...(opts.gstRate != null && Number.isFinite(opts.gstRate)
        ? { gstRate: opts.gstRate }
        : {}),
      ...(opts.outOfStock ? { stockQty: { lte: 0 } } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { sku: { contains: search, mode: 'insensitive' as const } },
              { barcode: { contains: search, mode: 'insensitive' as const } },
              { brand: { contains: search, mode: 'insensitive' as const } },
              { model: { contains: search, mode: 'insensitive' as const } },
              { category: { contains: search, mode: 'insensitive' as const } },
              { hsnCode: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const include = {
      serials: { where: { status: 'IN_STOCK' as const } },
      parentProduct: { select: { id: true, name: true } },
    };

    // Low stock compares stockQty to each row's threshold — resolve ids lightly, then page.
    if (opts.lowStock && !opts.outOfStock) {
      const candidates = await this.prisma.product.findMany({
        where,
        select: { id: true, stockQty: true, lowStockThreshold: true, name: true },
        orderBy: { name: 'asc' },
      });
      const filteredIds = candidates
        .filter((p) => Number(p.stockQty) <= Number(p.lowStockThreshold))
        .map((p) => p.id);
      const total = filteredIds.length;
      const pageIds = filteredIds.slice((page - 1) * pageSize, page * pageSize);
      if (!pageIds.length) return { items: [], total, page, pageSize };
      const rows = await this.prisma.product.findMany({
        where: { id: { in: pageIds } },
        include,
      });
      const byId = new Map(rows.map((r) => [r.id, r]));
      const ordered = pageIds.map((id) => byId.get(id)).filter(Boolean) as typeof rows;
      const enriched = await this.attachSupplierInfo(tenantId, ordered);
      return { items: enriched, total, page, pageSize };
    }

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { name: 'asc' },
        include,
      }),
      this.prisma.product.count({ where }),
    ]);

    const enriched = await this.attachSupplierInfo(tenantId, items);
    return { items: enriched, total, page, pageSize };
  }

  /**
   * Lightweight filter facets + KPI counts (avoids loading full catalog into the UI).
   */
  async facets(tenantId: string) {
    const products = await this.prisma.product.findMany({
      where: { tenantId, isActive: true },
      select: {
        category: true,
        brand: true,
        stockQty: true,
        lowStockThreshold: true,
        salePrice: true,
      },
    });
    const categories = new Set<string>();
    const brands = new Set<string>();
    let lowStockCount = 0;
    let outOfStockCount = 0;
    let salePriceSum = 0;
    for (const p of products) {
      if (p.category?.trim()) categories.add(p.category.trim());
      if (p.brand?.trim()) brands.add(p.brand.trim());
      const qty = Number(p.stockQty);
      salePriceSum += Number(p.salePrice);
      if (qty <= 0) outOfStockCount += 1;
      else if (qty <= Number(p.lowStockThreshold)) lowStockCount += 1;
    }
    return {
      totalSkus: products.length,
      lowStockCount,
      outOfStockCount,
      avgSalePrice: products.length ? Math.round((salePriceSum / products.length) * 100) / 100 : 0,
      categories: Array.from(categories).sort((a, b) => a.localeCompare(b)),
      brands: Array.from(brands).sort((a, b) => a.localeCompare(b)),
    };
  }

  /**
   * Stock grouped by category and GST slab — for Products & Stock management.
   */
  async stockSummary(tenantId: string) {
    const products = await this.prisma.product.findMany({
      where: { tenantId, isActive: true },
      select: {
        id: true,
        name: true,
        category: true,
        gstRate: true,
        stockQty: true,
        purchasePrice: true,
        salePrice: true,
        lowStockThreshold: true,
      },
    });

    const byCategory: Record<
      string,
      { category: string; skuCount: number; stockQty: number; stockValue: number; lowStockCount: number }
    > = {};
    const byGst: Record<
      string,
      { gstRate: number; skuCount: number; stockQty: number; stockValue: number; lowStockCount: number }
    > = {};

    for (const p of products) {
      const cat = p.category?.trim() || 'Uncategorized';
      const rate = Number(p.gstRate);
      const qty = Number(p.stockQty);
      const value = qty * Number(p.purchasePrice || p.salePrice || 0);
      const low = qty <= Number(p.lowStockThreshold);

      if (!byCategory[cat]) {
        byCategory[cat] = { category: cat, skuCount: 0, stockQty: 0, stockValue: 0, lowStockCount: 0 };
      }
      byCategory[cat].skuCount += 1;
      byCategory[cat].stockQty += qty;
      byCategory[cat].stockValue += value;
      if (low) byCategory[cat].lowStockCount += 1;

      const gk = String(rate);
      if (!byGst[gk]) {
        byGst[gk] = { gstRate: rate, skuCount: 0, stockQty: 0, stockValue: 0, lowStockCount: 0 };
      }
      byGst[gk].skuCount += 1;
      byGst[gk].stockQty += qty;
      byGst[gk].stockValue += value;
      if (low) byGst[gk].lowStockCount += 1;
    }

    return {
      totalSkus: products.length,
      totalStockQty: products.reduce((s, p) => s + Number(p.stockQty), 0),
      byCategory: Object.values(byCategory).sort((a, b) => a.category.localeCompare(b.category)),
      byGstSlab: Object.values(byGst).sort((a, b) => a.gstRate - b.gstRate),
    };
  }

  private async productIdsForSupplier(tenantId: string, supplierId: string) {
    const [billLines, aliases] = await Promise.all([
      this.prisma.purchaseBillLine.findMany({
        where: { productId: { not: null }, bill: { tenantId, supplierId } },
        select: { productId: true },
        distinct: ['productId'],
      }),
      this.prisma.supplierProductAlias.findMany({
        where: { tenantId, supplierId },
        select: { productId: true },
        distinct: ['productId'],
      }),
    ]);
    return Array.from(
      new Set(
        [...billLines.map((l) => l.productId), ...aliases.map((a) => a.productId)].filter(
          (id): id is string => Boolean(id),
        ),
      ),
    );
  }

  private async attachSupplierInfo<T extends { id: string }>(
    tenantId: string,
    items: T[],
  ): Promise<Array<T & { supplierId: string | null; supplierName: string | null }>> {
    if (!items.length) return [];

    const productIds = items.map((p) => p.id);
    const billLines = await this.prisma.purchaseBillLine.findMany({
      where: { productId: { in: productIds }, bill: { tenantId } },
      include: {
        bill: {
          select: {
            supplierId: true,
            supplierName: true,
            createdAt: true,
            supplier: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { bill: { createdAt: 'desc' } },
    });

    const supplierByProduct = new Map<string, { supplierId: string | null; supplierName: string }>();
    for (const line of billLines) {
      if (!line.productId || supplierByProduct.has(line.productId)) continue;
      const name = line.bill.supplier?.name || line.bill.supplierName;
      if (!name) continue;
      supplierByProduct.set(line.productId, {
        supplierId: line.bill.supplierId,
        supplierName: name,
      });
    }

    const missingIds = productIds.filter((id) => !supplierByProduct.has(id));
    if (missingIds.length) {
      const aliases = await this.prisma.supplierProductAlias.findMany({
        where: { tenantId, productId: { in: missingIds } },
        orderBy: [{ hitCount: 'desc' }, { updatedAt: 'desc' }],
      });
      for (const alias of aliases) {
        if (supplierByProduct.has(alias.productId) || !alias.supplierName) continue;
        supplierByProduct.set(alias.productId, {
          supplierId: alias.supplierId,
          supplierName: alias.supplierName,
        });
      }
    }

    return items.map((product) => {
      const supplier = supplierByProduct.get(product.id);
      return {
        ...product,
        supplierId: supplier?.supplierId ?? null,
        supplierName: supplier?.supplierName ?? null,
      };
    });
  }

  /** Serial/IMEI lookup for returns and counter search. */
  async searchSerials(tenantId: string, q?: string) {
    const query = q?.trim();
    if (!query) return [];

    const serials = await this.prisma.productSerial.findMany({
      where: {
        serialNumber: { contains: query, mode: 'insensitive' },
        product: { tenantId },
      },
      include: {
        product: { select: { id: true, name: true, sku: true } },
      },
      take: 50,
      orderBy: { serialNumber: 'asc' },
    });

    const soldNumbers = serials.filter((s) => s.status === 'SOLD').map((s) => s.serialNumber);
    const invoiceBySerial = new Map<string, { invoiceId: string; invoiceNumber: string }>();

    if (soldNumbers.length) {
      const lines = await this.prisma.invoiceLine.findMany({
        where: {
          serialNumbers: { hasSome: soldNumbers },
          invoice: { tenantId, status: 'FINALIZED' },
        },
        select: {
          serialNumbers: true,
          invoice: { select: { id: true, invoiceNumber: true, createdAt: true } },
        },
        orderBy: { invoice: { createdAt: 'desc' } },
      });

      for (const line of lines) {
        for (const sn of line.serialNumbers) {
          if (soldNumbers.includes(sn) && !invoiceBySerial.has(sn)) {
            invoiceBySerial.set(sn, {
              invoiceId: line.invoice.id,
              invoiceNumber: line.invoice.invoiceNumber,
            });
          }
        }
      }
    }

    return serials.map((s) => {
      const inv = s.status === 'SOLD' ? invoiceBySerial.get(s.serialNumber) : undefined;
      return {
        serialNumber: s.serialNumber,
        status: s.status,
        productId: s.product.id,
        productName: s.product.name,
        productSku: s.product.sku,
        ...(inv ? { invoiceId: inv.invoiceId, invoiceNumber: inv.invoiceNumber } : {}),
      };
    });
  }

  async findByBarcode(tenantId: string, barcode: string) {
    const product = await this.prisma.product.findFirst({
      where: { tenantId, barcode, isActive: true },
      include: { serials: { where: { status: 'IN_STOCK' } } },
    });
    if (!product) throw new NotFoundException(`Product not found for barcode: ${barcode}`);
    return product;
  }

  async findOne(tenantId: string, id: string) {
    const product = await this.prisma.product.findFirst({
      where: { id, tenantId },
      include: { serials: true, stockLedger: { take: 20, orderBy: { createdAt: 'desc' } } },
    });
    if (!product) throw new NotFoundException('Product not found');

    const saleLines = await this.prisma.invoiceLine.findMany({
      where: {
        productId: id,
        invoice: {
          tenantId,
          status: 'FINALIZED',
          type: { in: ['TAX_INVOICE', 'BILL_OF_SUPPLY', 'CREDIT_NOTE'] },
        },
      },
      select: {
        id: true,
        quantity: true,
        total: true,
        productName: true,
        productSku: true,
        serialNumbers: true,
        invoice: {
          select: {
            id: true,
            invoiceNumber: true,
            type: true,
            createdAt: true,
            grandTotal: true,
            customer: {
              select: { id: true, name: true, phone: true, email: true, gstin: true },
            },
          },
        },
      },
      orderBy: { invoice: { createdAt: 'desc' } },
      take: 40,
    });

    const salesHistory = saleLines.map((l) => ({
      lineId: l.id,
      invoiceId: l.invoice.id,
      invoiceNumber: l.invoice.invoiceNumber,
      documentType: l.invoice.type,
      date: l.invoice.createdAt,
      quantity: Number(l.quantity),
      lineTotal: Number(l.total),
      serialNumbers: l.serialNumbers ?? [],
      customer: l.invoice.customer
        ? {
            id: l.invoice.customer.id,
            name: l.invoice.customer.name,
            phone: l.invoice.customer.phone,
            email: l.invoice.customer.email,
            gstin: l.invoice.customer.gstin,
          }
        : null,
      customerName: l.invoice.customer?.name ?? 'Walk-in',
      customerPhone: l.invoice.customer?.phone ?? null,
    }));

    const buyersMap = new Map<
      string,
      { id: string; name: string; phone: string | null; email: string | null; times: number; qty: number }
    >();
    for (const s of salesHistory) {
      if (s.documentType === 'CREDIT_NOTE') continue;
      const key = s.customer?.id ?? `walkin:${s.customerName}`;
      const prev = buyersMap.get(key);
      if (prev) {
        prev.times += 1;
        prev.qty += s.quantity;
      } else {
        buyersMap.set(key, {
          id: s.customer?.id ?? key,
          name: s.customerName,
          phone: s.customerPhone,
          email: s.customer?.email ?? null,
          times: 1,
          qty: s.quantity,
        });
      }
    }

    return {
      ...product,
      salesHistory,
      buyers: Array.from(buyersMap.values()).sort((a, b) => b.times - a.times),
    };
  }

  async create(tenantId: string, dto: CreateProductDto) {
    const created = await this.prisma.product.create({
      data: {
        tenantId,
        sku: dto.sku,
        barcode: dto.barcode,
        name: dto.name,
        hsnCode: dto.hsnCode,
        category: dto.category,
        brand: dto.brand,
        model: dto.model,
        unit: dto.unit ?? 'pcs',
        salePrice: dto.salePrice,
        purchasePrice: dto.purchasePrice ?? 0,
        gstRate: nearestGstSlab(Number(dto.gstRate)),
        stockQty: dto.stockQty ?? 0,
        lowStockThreshold: dto.lowStockThreshold ?? 5,
        trackSerial: dto.trackSerial ?? false,
        trackBatch: dto.trackBatch ?? false,
        parentProductId: dto.parentProductId || null,
        variantLabel: dto.variantLabel?.trim() || null,
        imageUrl: dto.imageUrl?.trim() || null,
        attachments: (dto.attachments ?? []) as unknown as Prisma.InputJsonValue,
      },
    });
    await this.ensureCategoryMaster(tenantId, dto.category);
    return created;
  }

  async update(tenantId: string, id: string, dto: UpdateProductDto) {
    await this.findOne(tenantId, id);
    const data: Prisma.ProductUpdateInput = {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.barcode !== undefined ? { barcode: dto.barcode } : {}),
      ...(dto.hsnCode !== undefined ? { hsnCode: dto.hsnCode } : {}),
      ...(dto.category !== undefined ? { category: dto.category } : {}),
      ...(dto.brand !== undefined ? { brand: dto.brand } : {}),
      ...(dto.model !== undefined ? { model: dto.model } : {}),
      ...(dto.unit !== undefined ? { unit: dto.unit } : {}),
      ...(dto.salePrice !== undefined ? { salePrice: dto.salePrice } : {}),
      ...(dto.purchasePrice !== undefined ? { purchasePrice: dto.purchasePrice } : {}),
      ...(dto.gstRate !== undefined ? { gstRate: nearestGstSlab(Number(dto.gstRate)) } : {}),
      ...(dto.lowStockThreshold !== undefined ? { lowStockThreshold: dto.lowStockThreshold } : {}),
      ...(dto.trackSerial !== undefined ? { trackSerial: dto.trackSerial } : {}),
      ...(dto.trackBatch !== undefined ? { trackBatch: dto.trackBatch } : {}),
      ...(dto.parentProductId !== undefined ? { parentProductId: dto.parentProductId || null } : {}),
      ...(dto.variantLabel !== undefined ? { variantLabel: dto.variantLabel?.trim() || null } : {}),
      ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
      ...(dto.imageUrl !== undefined ? { imageUrl: dto.imageUrl } : {}),
      ...(dto.attachments !== undefined
        ? { attachments: dto.attachments as unknown as Prisma.InputJsonValue }
        : {}),
    };
    const updated = await this.prisma.product.update({ where: { id }, data });
    if (dto.category !== undefined) {
      await this.ensureCategoryMaster(tenantId, dto.category);
    }
    await this.syncEnrichmentAfterProductEdit(tenantId, updated);
    return updated;
  }

  /** When catalog edit fills barcode / sale price / model, close PENDING enrichments. */
  private async syncEnrichmentAfterProductEdit(
    tenantId: string,
    product: {
      id: string;
      barcode: string | null;
      salePrice: unknown;
      model: string | null;
      needsEnrichment: boolean;
    },
  ) {
    const missing: string[] = [];
    if (!product.barcode?.trim()) missing.push('barcode');
    if (!(Number(product.salePrice) > 0)) missing.push('salePrice');
    // Model is only forced for newly created stock-in SKUs; if still flagged, keep model check soft.
    const pending = await this.prisma.productEnrichment.findMany({
      where: { tenantId, productId: product.id, status: 'PENDING' },
    });
    const needsModel = pending.some((p) => (p.missingFields ?? []).includes('model'));
    if (needsModel && !product.model?.trim()) missing.push('model');

    const stillNeeds = missing.length > 0;
    if (product.needsEnrichment !== stillNeeds) {
      await this.prisma.product.update({
        where: { id: product.id },
        data: { needsEnrichment: stillNeeds },
      });
    }
    if (!stillNeeds && pending.length) {
      await this.prisma.productEnrichment.updateMany({
        where: { tenantId, productId: product.id, status: 'PENDING' },
        data: { status: 'DONE', missingFields: [] },
      });
    } else if (stillNeeds && pending.length) {
      await this.prisma.productEnrichment.updateMany({
        where: { tenantId, productId: product.id, status: 'PENDING' },
        data: { missingFields: missing },
      });
    }
  }

  /** Store an uploaded product file; optionally append to an existing product. */
  async storeAttachment(
    tenantId: string,
    file: Express.Multer.File,
    opts?: { productId?: string; asImage?: boolean },
  ) {
    const url = `/uploads/products/${file.filename}`;
    const attachment: ProductAttachment = {
      url,
      name: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
    };
    if (!opts?.productId) {
      return { ...attachment, asImage: Boolean(opts?.asImage) };
    }
    const product = await this.findOne(tenantId, opts.productId);
    const existing = Array.isArray(product.attachments)
      ? (product.attachments as ProductAttachment[])
      : [];
    const nextAttachments = [...existing, attachment];
    const updated = await this.prisma.product.update({
      where: { id: product.id },
      data: {
        attachments: nextAttachments as unknown as Prisma.InputJsonValue,
        ...(opts.asImage || !product.imageUrl ? { imageUrl: url } : {}),
      },
    });
    return { ...attachment, product: updated };
  }

  /**
   * Auto-map product label / datasheet OCR text into create-form fields.
   */
  parseLabel(text: string) {
    const raw = String(text ?? '').replace(/\r/g, '\n');
    const lines = raw
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    const joined = lines.join('\n');
    const mapped: Record<string, string | number | boolean | undefined> = {};
    const confidence: Record<string, number> = {};

    const labeled = (keys: string[]) => {
      for (const line of lines) {
        for (const key of keys) {
          const re = new RegExp(`^(?:${key})\\s*[:：\\-]?\\s*(.+)$`, 'i');
          const m = line.match(re);
          if (m?.[1]?.trim()) return m[1].trim();
        }
      }
      return undefined;
    };

    const name =
      labeled(['product name', 'item name', 'particulars', 'description', 'name', 'product']) ||
      lines.find((l) => l.length > 8 && !/^(sku|hsn|gst|mrp|rate|barcode|ean)/i.test(l));
    if (name) {
      mapped.name = name.replace(/\s{2,}/g, ' ').slice(0, 180);
      confidence.name = 0.75;
    }

    const sku = labeled(['sku', 'item code', 'code', 'part no', 'part number']);
    if (sku) {
      mapped.sku = sku.replace(/\s+/g, '').slice(0, 64);
      confidence.sku = 0.9;
    }

    const barcode =
      labeled(['barcode', 'ean', 'upc', 'gtin']) ||
      lines.map((l) => l.replace(/\s/g, '')).find((l) => /^\d{8,14}$/.test(l));
    if (barcode) {
      mapped.barcode = String(barcode).replace(/\D/g, '').slice(0, 32);
      confidence.barcode = 0.9;
    }

    const hsn = labeled(['hsn', 'hsn code', 'hsn/sac', 'sac']);
    if (hsn) {
      mapped.hsnCode = hsn.replace(/\D/g, '').slice(0, 8);
      confidence.hsnCode = 0.85;
    } else {
      const hsnInline = joined.match(/\bHSN\s*[:\/]?\s*(\d{4,8})\b/i);
      if (hsnInline) {
        mapped.hsnCode = hsnInline[1];
        confidence.hsnCode = 0.7;
      }
    }

    const brand = labeled(['brand', 'make', 'manufacturer']);
    if (brand) {
      mapped.brand = brand.slice(0, 80);
      confidence.brand = 0.85;
    }

    const model = labeled(['model', 'model no', 'model number', 'variant']);
    if (model) {
      mapped.model = model.slice(0, 80);
      confidence.model = 0.85;
    }

    const category = labeled(['category', 'group', 'type']);
    if (category) {
      mapped.category = category.slice(0, 80);
      confidence.category = 0.8;
    } else if (/battery|tubular|smf|ah\b/i.test(joined)) {
      mapped.category = 'Battery';
      confidence.category = 0.55;
    } else if (/inverter|ups|sine/i.test(joined)) {
      mapped.category = 'Inverter';
      confidence.category = 0.55;
    } else if (/stabilizer|servo/i.test(joined)) {
      mapped.category = 'Stabilizer';
      confidence.category = 0.55;
    }

    const unit = labeled(['unit', 'uom']);
    if (unit) {
      mapped.unit = unit.slice(0, 20);
      confidence.unit = 0.7;
    }

    let gstRaw: number | undefined;
    const gstLabeled = labeled(['gst', 'gst %', 'tax', 'tax rate']);
    const gstLine =
      joined.match(/\bGST\s*(?:@|rate|:)?\s*(\d+(?:\.\d+)?)\s*%/i) ||
      joined.match(/\b(?:CGST|SGST)\s*@?\s*(\d+(?:\.\d+)?)\s*%/i);
    if (gstLabeled) {
      gstRaw = Number(String(gstLabeled).replace(/[^\d.]/g, ''));
    } else if (gstLine) {
      gstRaw = Number(gstLine[1]);
      if (/cgst|sgst/i.test(gstLine[0]) && gstRaw > 0 && gstRaw <= 14) gstRaw *= 2;
    }
    if (gstRaw != null && Number.isFinite(gstRaw)) {
      mapped.gstRate = nearestGstSlab(gstRaw);
      confidence.gstRate = 0.85;
    }

    const sale =
      labeled(['sale price', 'selling price', 'mrp', 'price', 'rate', 'rsp']) ||
      joined.match(/(?:MRP|Sale|Price|Rate)\s*[:₹Rs.\s]*([\d,]+(?:\.\d+)?)/i)?.[1];
    if (sale) {
      const n = Number(String(sale).replace(/,/g, ''));
      if (Number.isFinite(n) && n >= 0) {
        mapped.salePrice = n;
        confidence.salePrice = 0.8;
      }
    }

    const purchase =
      labeled(['purchase price', 'cost', 'landing', 'dealer price', 'dp']) ||
      joined.match(/(?:Purchase|Cost|DP)\s*[:₹Rs.\s]*([\d,]+(?:\.\d+)?)/i)?.[1];
    if (purchase) {
      const n = Number(String(purchase).replace(/,/g, ''));
      if (Number.isFinite(n) && n >= 0) {
        mapped.purchasePrice = n;
        confidence.purchasePrice = 0.75;
      }
    }

    if (/serial|imei|track\s*serial/i.test(joined)) {
      mapped.trackSerial = true;
      confidence.trackSerial = 0.6;
    }

    // Auto SKU from brand+model or name if missing
    if (!mapped.sku && (mapped.brand || mapped.model || mapped.name)) {
      const base = [mapped.brand, mapped.model || mapped.name]
        .filter(Boolean)
        .join('-')
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, '-')
        .replace(/^-|-$/g, '')
        .slice(0, 24);
      if (base) {
        mapped.sku = base;
        confidence.sku = 0.45;
      }
    }

    return {
      mapped,
      confidence,
      fieldsFilled: Object.keys(mapped).length,
      preview: raw.slice(0, 400),
    };
  }

  private async ensureCategoryMaster(tenantId: string, category?: string | null) {
    const name = category?.trim().replace(/\s+/g, ' ');
    if (!name) return;
    const existing = await this.prisma.productCategory.findFirst({
      where: { tenantId, name: { equals: name, mode: 'insensitive' } },
    });
    if (existing) {
      if (!existing.isActive) {
        await this.prisma.productCategory.update({
          where: { id: existing.id },
          data: { isActive: true },
        });
      }
      return;
    }
    try {
      await this.prisma.productCategory.create({
        data: { tenantId, name },
      });
    } catch {
      /* race — already exists */
    }
  }

  /** Soft-remove product from catalog. Allowed only when stock is zero. History + buyers stay forever. */
  async remove(tenantId: string, id: string) {
    const product = await this.findOne(tenantId, id);
    if (Number(product.stockQty) > 0) {
      throw new BadRequestException('Remove is only allowed when stock quantity is 0');
    }
    if (!product.isActive) {
      return product;
    }
    return this.prisma.product.update({
      where: { id },
      data: { isActive: false, archivedAt: new Date(), purgedAt: null },
    });
  }

  /** Inactive / archived catalog products. Kept forever (no auto-delete cron). */
  async listInactive(tenantId: string) {
    const products = await this.prisma.product.findMany({
      where: { tenantId, isActive: false, purgedAt: null },
      orderBy: { archivedAt: 'desc' },
      take: 200,
    });
    if (!products.length) return [];

    const ids = products.map((p) => p.id);
    const lines = await this.prisma.invoiceLine.findMany({
      where: {
        productId: { in: ids },
        invoice: {
          tenantId,
          status: 'FINALIZED',
          type: { in: ['TAX_INVOICE', 'BILL_OF_SUPPLY'] },
        },
      },
      select: {
        productId: true,
        quantity: true,
        invoice: {
          select: {
            createdAt: true,
            invoiceNumber: true,
            customer: { select: { id: true, name: true, phone: true } },
          },
        },
      },
      orderBy: { invoice: { createdAt: 'desc' } },
    });

    const byProduct = new Map<
      string,
      {
        soldQty: number;
        invoiceCount: number;
        customers: Map<string, { id: string; name: string; phone: string | null; times: number }>;
        lastSoldAt: Date | null;
        lastInvoiceNumber: string | null;
        lastCustomerName: string | null;
      }
    >();

    for (const line of lines) {
      if (!line.productId) continue;
      let agg = byProduct.get(line.productId);
      if (!agg) {
        agg = {
          soldQty: 0,
          invoiceCount: 0,
          customers: new Map(),
          lastSoldAt: null,
          lastInvoiceNumber: null,
          lastCustomerName: null,
        };
        byProduct.set(line.productId, agg);
      }
      agg.soldQty += Number(line.quantity || 0);
      agg.invoiceCount += 1;
      const cust = line.invoice.customer;
      if (cust) {
        const prev = agg.customers.get(cust.id);
        if (prev) prev.times += 1;
        else agg.customers.set(cust.id, { id: cust.id, name: cust.name, phone: cust.phone, times: 1 });
      }
      if (!agg.lastSoldAt) {
        agg.lastSoldAt = line.invoice.createdAt;
        agg.lastInvoiceNumber = line.invoice.invoiceNumber;
        agg.lastCustomerName = cust?.name ?? 'Walk-in';
      }
    }

    return products.map((p) => {
      const sales = byProduct.get(p.id);
      const buyers = sales
        ? Array.from(sales.customers.values()).sort((a, b) => b.times - a.times)
        : [];
      return {
        ...p,
        soldQty: sales?.soldQty ?? 0,
        invoiceCount: sales?.invoiceCount ?? 0,
        customerCount: buyers.length,
        lastSoldAt: sales?.lastSoldAt ?? null,
        lastInvoiceNumber: sales?.lastInvoiceNumber ?? null,
        lastCustomerName: sales?.lastCustomerName ?? null,
        buyers: buyers.slice(0, 8),
      };
    });
  }

  async restore(tenantId: string, id: string) {
    const product = await this.findOne(tenantId, id);
    if (product.isActive) return product;
    if (product.purgedAt) {
      throw new BadRequestException('This product was permanently removed from archive and cannot be restored');
    }
    return this.prisma.product.update({
      where: { id },
      data: { isActive: true, archivedAt: null, purgedAt: null },
    });
  }

  /**
   * @deprecated Product archives are permanent. Kept for manual/admin tools only —
   * the daily cron no longer calls this. Never hard-deletes products with document history.
   */
  async purgeExpiredArchived(retentionDays = 30) {
    return {
      scanned: 0,
      deleted: 0,
      purged: 0,
      retentionDays: Math.max(1, retentionDays),
      skipped: true,
      reason: 'Product archives are kept forever for invoice/customer history',
    };
  }

  async adjustStock(
    tenantId: string,
    productId: string,
    quantity: number,
    type: 'PURCHASE' | 'ADJUSTMENT' | 'RETURN',
    notes?: string,
  ) {
    if (!quantity) {
      throw new BadRequestException('Adjustment quantity cannot be zero');
    }
    const product = await this.findOne(tenantId, productId);
    void product;
    const updated = await this.prisma.$transaction(async (tx) => {
      const p = await tx.product.update({
        where: { id: productId },
        data: { stockQty: { increment: quantity } },
      });
      await tx.stockLedger.create({
        data: { tenantId, productId, type, quantity, notes },
      });
      return p;
    });
    return updated;
  }

  async lowStock(tenantId: string) {
    const products = await this.prisma.product.findMany({
      where: { tenantId, isActive: true },
    });
    return products.filter((p) => Number(p.stockQty) <= Number(p.lowStockThreshold));
  }

  async exportCsv(tenantId: string) {
    const items = await this.prisma.product.findMany({
      where: { tenantId },
      orderBy: { name: 'asc' },
    });

    const rows = items.map((p) => ({
      sku: p.sku,
      barcode: p.barcode ?? '',
      name: p.name,
      hsnCode: p.hsnCode,
      category: p.category ?? '',
      brand: p.brand ?? '',
      model: p.model ?? '',
      unit: p.unit,
      salePrice: Number(p.salePrice),
      purchasePrice: Number(p.purchasePrice),
      gstRate: Number(p.gstRate),
      stockQty: Number(p.stockQty),
      lowStockThreshold: Number(p.lowStockThreshold),
      trackSerial: p.trackSerial,
      isActive: p.isActive,
    }));

    return {
      filename: `products-${new Date().toISOString().slice(0, 10)}.csv`,
      csv: buildProductCsv(rows),
    };
  }

  templateCsv() {
    return {
      filename: 'products-import-template.csv',
      csv: buildProductTemplateCsv(),
    };
  }

  async importFile(
    tenantId: string,
    file: { buffer: Buffer; originalname: string },
    options: { updateStock?: boolean; dryRun?: boolean } = {},
  ) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('File is empty. Upload a CSV or Excel with a header row and data.');
    }

    const updateStock = options.updateStock !== false;
    const dryRun = options.dryRun === true;
    const { rows, errors: parseErrors } = parseProductSpreadsheet(
      file.buffer,
      file.originalname || 'upload.csv',
    );

    if (!rows.length && parseErrors.length) {
      throw new BadRequestException({
        message: 'Could not parse file',
        errors: parseErrors,
      });
    }

    const created: string[] = [];
    const updated: string[] = [];
    const stockAdjusted: string[] = [];
    const rowErrors: Array<{ row: number; sku?: string; message: string }> = [...parseErrors];

    for (const row of rows) {
      try {
        await this.applyImportRow(tenantId, row, {
          updateStock,
          dryRun,
          created,
          updated,
          stockAdjusted,
        });
      } catch (e) {
        rowErrors.push({
          row: row._row,
          sku: row.sku,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }

    return {
      dryRun,
      updateStock,
      totalRows: rows.length,
      created: created.length,
      updated: updated.length,
      stockAdjusted: stockAdjusted.length,
      createdSkus: created,
      updatedSkus: updated,
      errors: rowErrors,
    };
  }

  private async applyImportRow(
    tenantId: string,
    row: ProductImportRow,
    ctx: {
      updateStock: boolean;
      dryRun: boolean;
      created: string[];
      updated: string[];
      stockAdjusted: string[];
    },
  ) {
    const existing = await this.prisma.product.findUnique({
      where: { tenantId_sku: { tenantId, sku: row.sku } },
    });

    if (!existing) {
      if (!row.name?.trim()) throw new Error('name is required to create a product');
      if (!row.hsnCode?.trim()) throw new Error('hsnCode is required to create a product');
      if (row.salePrice == null) throw new Error('salePrice is required to create a product');
      if (row.gstRate == null) throw new Error('gstRate is required to create a product');

      if (ctx.dryRun) {
        ctx.created.push(row.sku);
        return;
      }

      await this.ensureCategoryMaster(tenantId, row.category);

      await this.prisma.product.create({
        data: {
          tenantId,
          sku: row.sku,
          barcode: row.barcode,
          name: row.name.trim(),
          hsnCode: row.hsnCode.trim(),
          category: row.category,
          brand: row.brand,
          model: row.model,
          unit: row.unit?.trim() || 'pcs',
          salePrice: row.salePrice,
          purchasePrice: row.purchasePrice ?? 0,
          gstRate: row.gstRate,
          stockQty: ctx.updateStock ? (row.stockQty ?? 0) : 0,
          lowStockThreshold: row.lowStockThreshold ?? 5,
          trackSerial: row.trackSerial ?? false,
          isActive: row.isActive ?? true,
        },
      });

      if (ctx.updateStock && (row.stockQty ?? 0) !== 0) {
        const created = await this.prisma.product.findUnique({
          where: { tenantId_sku: { tenantId, sku: row.sku } },
        });
        if (created) {
          await this.prisma.stockLedger.create({
            data: {
              tenantId,
              productId: created.id,
              type: 'PURCHASE',
              quantity: row.stockQty ?? 0,
              notes: 'CSV/Excel import opening stock',
            },
          });
          ctx.stockAdjusted.push(row.sku);
        }
      }

      ctx.created.push(row.sku);
      return;
    }

    const data: Record<string, unknown> = {};
    if (row.name != null && row.name !== '') data.name = row.name;
    if (row.barcode !== undefined) data.barcode = row.barcode || null;
    if (row.hsnCode != null && row.hsnCode !== '') data.hsnCode = row.hsnCode;
    if (row.category !== undefined) data.category = row.category || null;
    if (row.brand !== undefined) data.brand = row.brand || null;
    if (row.model !== undefined) data.model = row.model || null;
    if (row.unit != null && row.unit !== '') data.unit = row.unit;
    if (row.salePrice != null) data.salePrice = row.salePrice;
    if (row.purchasePrice != null) data.purchasePrice = row.purchasePrice;
    if (row.gstRate != null) data.gstRate = row.gstRate;
    if (row.lowStockThreshold != null) data.lowStockThreshold = row.lowStockThreshold;
    if (row.trackSerial != null) data.trackSerial = row.trackSerial;
    if (row.isActive != null) data.isActive = row.isActive;

    const stockDelta =
      ctx.updateStock && row.stockQty != null
        ? row.stockQty - Number(existing.stockQty)
        : 0;

    if (ctx.dryRun) {
      if (Object.keys(data).length) ctx.updated.push(row.sku);
      if (stockDelta !== 0) ctx.stockAdjusted.push(row.sku);
      return;
    }

    if (row.category !== undefined) {
      await this.ensureCategoryMaster(tenantId, row.category);
    }

    await this.prisma.$transaction(async (tx) => {
      if (Object.keys(data).length) {
        await tx.product.update({ where: { id: existing.id }, data });
        ctx.updated.push(row.sku);
      }

      if (stockDelta !== 0) {
        await tx.product.update({
          where: { id: existing.id },
          data: { stockQty: row.stockQty },
        });
        await tx.stockLedger.create({
          data: {
            tenantId,
            productId: existing.id,
            type: 'ADJUSTMENT',
            quantity: stockDelta,
            notes: 'CSV/Excel import stock set',
          },
        });
        ctx.stockAdjusted.push(row.sku);
      }
    });
  }

  async listBatches(tenantId: string, productId: string) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, tenantId } });
    if (!product) throw new NotFoundException('Product not found');
    return this.prisma.productBatch.findMany({
      where: { tenantId, productId },
      orderBy: [{ expiryDate: 'asc' }, { batchNumber: 'asc' }],
    });
  }

  /** FEFO: earliest expiry first with qty > 0 */
  async fefoBatches(tenantId: string, productId: string) {
    const batches = await this.listBatches(tenantId, productId);
    return batches
      .filter((b) => Number(b.quantity) > 0)
      .sort((a, b) => {
        if (!a.expiryDate && !b.expiryDate) return 0;
        if (!a.expiryDate) return 1;
        if (!b.expiryDate) return -1;
        return a.expiryDate.getTime() - b.expiryDate.getTime();
      });
  }

  async upsertBatch(
    tenantId: string,
    productId: string,
    data: { batchNumber: string; expiryDate?: string; quantity: number },
  ) {
    const product = await this.prisma.product.findFirst({ where: { id: productId, tenantId } });
    if (!product) throw new NotFoundException('Product not found');
    const batchNumber = data.batchNumber?.trim();
    if (!batchNumber) throw new BadRequestException('batchNumber required');
    const qty = Number(data.quantity);
    if (!Number.isFinite(qty) || qty < 0) throw new BadRequestException('Invalid quantity');
    const expiryDate = data.expiryDate ? new Date(data.expiryDate) : null;
    return this.prisma.productBatch.upsert({
      where: { productId_batchNumber: { productId, batchNumber } },
      create: {
        tenantId,
        productId,
        batchNumber,
        expiryDate: expiryDate && !Number.isNaN(expiryDate.getTime()) ? expiryDate : null,
        quantity: qty,
      },
      update: {
        expiryDate: expiryDate && !Number.isNaN(expiryDate.getTime()) ? expiryDate : null,
        quantity: qty,
      },
    });
  }

  async listVariants(tenantId: string, parentProductId: string) {
    return this.prisma.product.findMany({
      where: { tenantId, parentProductId, isActive: true },
      orderBy: { variantLabel: 'asc' },
    });
  }

  async listExpiringBatches(tenantId: string, withinDays = 30) {
    const until = new Date(Date.now() + withinDays * 86400000);
    return this.prisma.productBatch.findMany({
      where: {
        tenantId,
        expiryDate: { lte: until, gte: new Date() },
        quantity: { gt: 0 },
      },
      include: { product: { select: { id: true, name: true, sku: true } } },
      orderBy: { expiryDate: 'asc' },
      take: 100,
    });
  }
}
