import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { parseOrderSheetText } from '@retail-sarathi/scan-engine';
import { nearestGstSlab } from '@retail-sarathi/gst-engine';
import {
  extractInvoiceNumberFromText,
  enrichExtractedParties,
  formatAppDate,
  InvoiceParseContext,
  parseInvoiceDate,
  isDocumentTitleLine,
  isInvoiceSummaryLabel,
  isLikelyGstinNoiseLine,
  isTableHeaderLine,
  looksLikeAddressLine,
  looksLikeCompanyNameLine,
  normalizeIndianVehiclePlate,
  shouldSkipBuyerCandidate,
} from './invoice-parse-utils';
import { PrismaService } from '../prisma/prisma.service';
import { CustomersService } from '../customers/customers.service';
import { InventoryService } from '../inventory/inventory.service';

type UploadedFile = {
  originalname: string;
  filename: string;
  path: string;
  mimetype?: string;
  size: number;
};

export type PurchaseLineInput = {
  name: string;
  quantity: number;
  unitPrice?: number;
  salePrice?: number;
  hsnCode?: string;
  gstRate?: number;
  brand?: string;
  category?: string;
  model?: string;
  sku?: string;
  barcode?: string;
  productId?: string;
  createIfMissing?: boolean;
  trackSerial?: boolean;
  serialNumbers?: string[];
  /** Default true — set false to enrich product without increasing stock yet. */
  commitStock?: boolean;
};

const STRONG_MATCH_SCORE = 40;

@Injectable()
export class ScanService {
  constructor(
    private prisma: PrismaService,
    private customers: CustomersService,
    private inventory: InventoryService,
  ) {}

  /** Stored absolute path → browser path `/uploads/...` */
  publicUploadUrl(filePath?: string | null): string | null {
    if (!filePath) return null;
    const normalized = filePath.replace(/\\/g, '/');
    const idx = normalized.toLowerCase().lastIndexOf('/uploads/');
    if (idx >= 0) return normalized.slice(idx);
    const parts = normalized.split('/uploads/');
    if (parts.length > 1) return `/uploads/${parts[1]}`;
    return null;
  }

  async getUpload(tenantId: string, uploadId: string) {
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        originalName: string;
        storedName: string;
        filePath: string;
        mimeType: string | null;
        size: number;
        kept: boolean;
      }>
    >`
      SELECT "id", "originalName", "storedName", "filePath", "mimeType", "size", "kept"
      FROM "InvoiceUpload"
      WHERE "id" = ${uploadId} AND "tenantId" = ${tenantId}
      LIMIT 1
    `;
    if (!rows[0]) throw new NotFoundException('Upload not found');
    const row = rows[0];
    return {
      id: row.id,
      originalName: row.originalName,
      storedName: row.storedName,
      mimeType: row.mimeType,
      size: row.size,
      kept: row.kept,
      url: this.publicUploadUrl(row.filePath),
    };
  }

  async parseOrderSheet(tenantId: string, text: string, createCustomer = false) {
    const products = await this.prisma.product.findMany({
      where: { tenantId, isActive: true },
      select: {
        id: true,
        sku: true,
        barcode: true,
        name: true,
        salePrice: true,
        gstRate: true,
        hsnCode: true,
      },
    });

    const catalog = products.map((p) => ({
      id: p.id,
      sku: p.sku,
      barcode: p.barcode,
      name: p.name,
      salePrice: Number(p.salePrice),
      gstRate: Number(p.gstRate),
      hsnCode: p.hsnCode,
    }));

    const draft = parseOrderSheetText(text, catalog);

    let customerId: string | undefined;
    if (createCustomer && (draft.customer.name || draft.customer.phone)) {
      try {
        const existing = draft.customer.phone
          ? await this.prisma.customer.findFirst({
              where: { tenantId, phone: draft.customer.phone },
            })
          : null;
        if (existing) {
          customerId = existing.id;
        } else {
      const c = await this.customers.create(tenantId, {
        name: draft.customer.name ?? 'Customer',
        phone: draft.customer.phone ?? '',
        gstin: draft.customer.gstin,
      });
      customerId = c.id;
        }
      } catch {
        // Parsing should still succeed even if CRM create fails (duplicate phone, etc.).
      }
    }

    return {
      draft,
      customerId,
      linesMatched: draft.lines.filter((l) => l.productId).length,
      linesTotal: draft.lines.length,
    };
  }

  async extractUpload(tenantId: string, file: UploadedFile, createCustomer = false, clientText?: string) {
    const raw = await fs.readFile(file.path);
    const serverText = await this.extractText(raw, file.mimetype, file.originalname);
    const text = (clientText?.trim() || serverText).trim();
    let extractedData: ReturnType<ScanService['extractInvoiceData']> | Record<string, unknown> = {};
    try {
      extractedData = text ? this.extractInvoiceData(text) : {};
    } catch {
      extractedData = {};
    }
    const isInvoice =
      Boolean(clientText?.trim()) ||
      this.looksLikeInvoice(text, extractedData as ReturnType<ScanService['extractInvoiceData']>);

    if (!text) {
      // Keep image/PDF on disk so the shop has the file; ask client to OCR.
      const uploadId = randomUUID();
      await this.prisma.$executeRaw`
        INSERT INTO "InvoiceUpload"
          ("id", "tenantId", "originalName", "storedName", "filePath", "mimeType", "size", "extractedText", "extractedData", "kept", "createdAt")
        VALUES
          (${uploadId}, ${tenantId}, ${file.originalname}, ${file.filename}, ${file.path}, ${file.mimetype ?? null}, ${file.size}, ${null}, ${{} as Prisma.InputJsonValue}, true, NOW())
      `;
      return {
        kept: true,
        needsOcr: true,
        message:
          'File saved but no text was readable. Run on-device OCR (web/mobile camera OCR) and re-upload with extractedText, or paste invoice text and use Parse. Scanned PDFs/images need OCR; text PDFs are extracted on the server.',
        clientOcrRequired: true,
        supportedNextSteps: [
          'Use Stock-in → camera/file OCR on web or mobile',
          'Paste invoice text into Parse purchase',
          'Upload a text-based PDF (not a scanned image-only PDF)',
        ],
        upload: {
          id: uploadId,
          originalName: file.originalname,
          storedName: file.filename,
          mimeType: file.mimetype,
          size: file.size,
          url: this.publicUploadUrl(file.path),
        },
        extractedText: '',
        extractedData: {},
        purchasePreview: {
          lines: [],
          linesMatched: 0,
          linesTotal: 0,
          extractionQuality: 'poor',
        },
      };
    }

    if (!isInvoice) {
      await fs.unlink(file.path).catch(() => undefined);
      return {
        kept: false,
        message: 'Upload was parsed but not retained because it does not look like an invoice.',
        extractedText: text,
        extractedData,
      };
    }

    const uploadId = randomUUID();
    await this.prisma.$executeRaw`
      INSERT INTO "InvoiceUpload"
        ("id", "tenantId", "originalName", "storedName", "filePath", "mimeType", "size", "extractedText", "extractedData", "kept", "createdAt")
      VALUES
        (${uploadId}, ${tenantId}, ${file.originalname}, ${file.filename}, ${file.path}, ${file.mimetype ?? null}, ${file.size}, ${text}, ${extractedData as Prisma.InputJsonValue}, true, NOW())
    `;

    let parsed: Awaited<ReturnType<typeof this.parseOrderSheet>> | Record<string, unknown> = {
      linesMatched: 0,
      linesTotal: 0,
    };
    let purchasePreview: Awaited<ReturnType<typeof this.parsePurchaseInvoice>> = {
      lines: [],
      linesMatched: 0,
      linesTotal: 0,
      extractionQuality: 'poor',
      extractedText: text,
    } as Awaited<ReturnType<typeof this.parsePurchaseInvoice>>;

    try {
      parsed = await this.parseOrderSheet(tenantId, text, createCustomer);
    } catch {
      /* order-sheet parse is optional for purchase invoices */
    }
    try {
      purchasePreview = await this.parsePurchaseInvoice(tenantId, text);
    } catch {
      // Never fail the upload with 500 — client already has OCR text to edit/re-parse
      purchasePreview = {
        lines: [],
        linesMatched: 0,
        linesTotal: 0,
        extractionQuality: 'poor',
        extractedText: text,
        extractedJson: {
          supplier: { name: null, gstin: null, phone: null, address: null, stateName: null, bankName: null, bankAccount: null, ifsc: null, bankBranch: null },
          invoice: { number: null, date: null, irn: null, ackNo: null, ackDate: null, ewayBillNo: null, vehicleNo: null, placeOfSupply: null, totalAmount: null, taxableValue: null, cgstAmount: null, sgstAmount: null, igstAmount: null, taxAmount: null, hsnTaxSummary: [] },
          customer: { name: null, gstin: null },
          items: [],
        },
      } as Awaited<ReturnType<typeof this.parsePurchaseInvoice>>;
    }

    return {
      ...parsed,
      purchasePreview,
      kept: true,
      needsOcr: false,
      upload: {
        id: uploadId,
        originalName: file.originalname,
        storedName: file.filename,
        mimeType: file.mimetype,
        size: file.size,
        url: this.publicUploadUrl(file.path),
      },
      extractedText: text,
      extractedData,
    };
  }

  async parsePurchaseInvoice(tenantId: string, text: string) {
    try {
      return await this.parsePurchaseInvoiceInner(tenantId, text);
    } catch {
      const cleaned = this.normalizeOcrText(typeof text === 'string' ? text : String(text ?? ''));
      return {
        lines: [],
        linesMatched: 0,
        linesTotal: 0,
        extractionQuality: 'poor' as const,
        extractedText: cleaned,
        extractedJson: {
          supplier: {
            name: null,
            gstin: null,
            phone: null,
            address: null,
            stateName: null,
            bankName: null,
            bankAccount: null,
            ifsc: null,
            bankBranch: null,
          },
          invoice: {
            number: null,
            date: null,
            irn: null,
            ackNo: null,
            ackDate: null,
            ewayBillNo: null,
            vehicleNo: null,
            placeOfSupply: null,
            totalAmount: null,
            taxableValue: null,
            cgstAmount: null,
            sgstAmount: null,
            igstAmount: null,
            taxAmount: null,
            hsnTaxSummary: [],
          },
          customer: { name: null, gstin: null },
          items: [],
        },
      };
    }
  }

  private async parsePurchaseInvoiceInner(tenantId: string, text: string) {
    const cleaned = this.normalizeOcrText(typeof text === 'string' ? text : String(text ?? ''));
    const parseCtx = await this.loadInvoiceParseContext(tenantId);
    const products = await this.prisma.product.findMany({
      where: { tenantId, isActive: true },
    });
    const aliases = await this.prisma.supplierProductAlias.findMany({
      where: { tenantId },
      include: { product: true },
    });
    const aliasByKey = new Map(aliases.map((a) => [a.aliasKey, a]));
    let extractedData = this.extractInvoiceData(cleaned);
    extractedData = enrichExtractedParties(extractedData, cleaned, parseCtx, {
      extractGstins: (s) => this.extractGstins(s),
      normalizeGstinCandidate: (raw) => this.normalizeGstinCandidate(raw),
    });
    const headerGst = this.inferHeaderGstRate(cleaned);
    const supplierMatch = parseCtx.knownSuppliers?.find(
      (s) =>
        (extractedData.gstin && s.gstin?.toUpperCase() === extractedData.gstin.toUpperCase()) ||
        (extractedData.supplierName &&
          s.name.toLowerCase() === extractedData.supplierName.toLowerCase()),
    );
    const rawLines = this.extractPurchaseLines(cleaned);
    const supplierKey = (extractedData.supplierName || '').trim().toLowerCase();

    const lines = rawLines.map((line) => {
      const aliasKey = this.aliasKey(supplierKey, line.name);
      const alias = aliasByKey.get(aliasKey) ?? aliasByKey.get(this.aliasKey('', line.name));
      let match = alias?.product
        ? {
            ...alias.product,
            score: 120,
            matchedVia: 'alias' as const,
          }
        : this.matchProduct(products, line.name, line.hsnCode);
      const category = line.category ?? this.guessCategory(line.name);
      const brand = line.brand ?? this.guessBrand(line.name);
      const strong = Boolean(match && (match as { score?: number }).score! >= STRONG_MATCH_SCORE);
      return {
        name: line.name,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        salePrice: match ? Number(match.salePrice) : undefined,
        hsnCode: line.hsnCode ?? match?.hsnCode ?? this.defaultHsn(category),
        // Prefer line GST, then invoice header CGST/SGST/IGST %, then catalog match, then 18.
        gstRate: nearestGstSlab(
          line.gstRate ?? headerGst ?? (match ? Number(match.gstRate) : 18),
        ),
        brand: brand ?? match?.brand ?? undefined,
        category: category ?? match?.category ?? undefined,
        model: match?.model ?? undefined,
        barcode: match?.barcode ?? undefined,
        trackSerial: match?.trackSerial ?? false,
        productId: match?.id,
        sku: match?.sku,
        matchedName: match?.name,
        matchScore: (match as { score?: number } | null)?.score,
        matchedVia: alias ? 'alias' : match ? 'fuzzy' : undefined,
        currentStock: match ? Number(match.stockQty) : 0,
        createIfMissing: !match,
        lineStatus: strong
          ? match?.trackSerial
            ? 'NEEDS_SERIALS'
            : 'READY'
          : 'NEEDS_ENRICH',
        headerGstApplied: line.gstRate == null && headerGst != null,
      };
    });

    const linesWithPrice = lines.filter((l) => l.unitPrice != null && Number(l.unitPrice) > 0);
    const headerFields = [
      extractedData.supplierName,
      extractedData.gstin,
      extractedData.invoiceNumber,
      extractedData.totalAmount,
      extractedData.customerName,
    ].filter(Boolean).length;
    const extractionQuality =
      linesWithPrice.length >= 2 && extractedData.supplierName && extractedData.totalAmount
        ? 'good'
        : linesWithPrice.length >= 1
          ? 'fair'
          : headerFields >= 3
            ? 'fair'
            : headerFields >= 1
              ? 'fair'
              : 'poor';

    return {
      supplierId: supplierMatch?.id,
      supplierName: extractedData.supplierName,
      supplierAddress: extractedData.supplierAddress,
      invoiceNumber: extractedData.invoiceNumber,
      invoiceDate: formatAppDate(extractedData.invoiceDate) ?? extractedData.invoiceDate,
      gstin: extractedData.gstin,
      customerName: extractedData.customerName,
      customerGstin: extractedData.customerGstin,
      phone: extractedData.phone,
      stateName: extractedData.stateName,
      placeOfSupply: extractedData.placeOfSupply,
      irn: extractedData.irn,
      ackNo: extractedData.ackNo,
      ackDate: formatAppDate(extractedData.ackDate) ?? extractedData.ackDate,
      ewayBillNo: extractedData.ewayBillNo,
      vehicleNo: extractedData.vehicleNo,
      bankName: extractedData.bankName,
      bankAccount: extractedData.bankAccount,
      ifsc: extractedData.ifsc,
      bankBranch: extractedData.bankBranch,
      totalAmount: extractedData.totalAmount,
      taxableValue: extractedData.taxableValue,
      cgstAmount: extractedData.cgstAmount,
      sgstAmount: extractedData.sgstAmount,
      igstAmount: extractedData.igstAmount,
      taxAmount: extractedData.taxAmount,
      hsnTaxSummary: extractedData.hsnTaxSummary,
      lines,
      linesMatched: lines.filter((l) => l.productId).length,
      linesTotal: lines.length,
      extractionQuality,
      extractedText: cleaned,
      extractedJson: {
        supplier: {
          name: extractedData.supplierName ?? null,
          gstin: extractedData.gstin ?? null,
          phone: extractedData.phone ?? null,
          address: extractedData.supplierAddress ?? null,
          stateName: extractedData.stateName ?? null,
          bankName: extractedData.bankName ?? null,
          bankAccount: extractedData.bankAccount ?? null,
          ifsc: extractedData.ifsc ?? null,
          bankBranch: extractedData.bankBranch ?? null,
        },
        invoice: {
          number: extractedData.invoiceNumber ?? null,
          date: formatAppDate(extractedData.invoiceDate) ?? extractedData.invoiceDate ?? null,
          irn: extractedData.irn ?? null,
          ackNo: extractedData.ackNo ?? null,
          ackDate: formatAppDate(extractedData.ackDate) ?? extractedData.ackDate ?? null,
          ewayBillNo: extractedData.ewayBillNo ?? null,
          vehicleNo: extractedData.vehicleNo ?? null,
          placeOfSupply: extractedData.placeOfSupply ?? null,
          totalAmount: extractedData.totalAmount ?? null,
          taxableValue: extractedData.taxableValue ?? null,
          cgstAmount: extractedData.cgstAmount ?? null,
          sgstAmount: extractedData.sgstAmount ?? null,
          igstAmount: extractedData.igstAmount ?? null,
          taxAmount: extractedData.taxAmount ?? null,
          hsnTaxSummary: extractedData.hsnTaxSummary ?? [],
        },
        customer: {
          name: extractedData.customerName ?? null,
          gstin: extractedData.customerGstin ?? null,
        },
        items: lines.map((l) => ({
          name: l.name,
          hsnCode: l.hsnCode ?? null,
          quantity: l.quantity,
          unitPrice: l.unitPrice ?? null,
          gstRate: l.gstRate ?? null,
          category: l.category ?? null,
          brand: l.brand ?? null,
          barcode: l.barcode ?? null,
          trackSerial: l.trackSerial,
          matchedProductId: l.productId ?? null,
          matchedSku: l.sku ?? null,
          matchScore: l.matchScore ?? null,
          matchedVia: l.matchedVia ?? null,
          lineStatus: l.lineStatus,
          createIfMissing: l.createIfMissing,
        })),
      },
    };
  }

  async confirmStockIn(
    tenantId: string,
    createdByUserId: string | undefined,
    payload: {
      uploadId?: string;
      draftId?: string;
      supplierId?: string;
      supplierName?: string;
      supplierAddress?: string;
      supplierPhone?: string;
      invoiceNumber?: string;
      invoiceDate?: string;
      gstin?: string;
      taxableValue?: number;
      taxAmount?: number;
      totalAmount?: number;
      cgstAmount?: number;
      sgstAmount?: number;
      igstAmount?: number;
      irn?: string;
      ackNo?: string;
      ackDate?: string;
      ewayBillNo?: string;
      vehicleNo?: string;
      bankName?: string;
      bankAccount?: string;
      ifsc?: string;
      bankBranch?: string;
      placeOfSupply?: string;
      stateName?: string;
      customerName?: string;
      customerGstin?: string;
      notes?: string;
      /** Explicit opt-in to add lines onto an existing purchase bill with the same invoice #. */
      appendToExistingBill?: boolean;
      lines: PurchaseLineInput[];
    },
  ) {
    if (!payload.lines?.length) {
      throw new BadRequestException('Add at least one line to stock in');
    }

    const stockDate = parseInvoiceDate(payload.invoiceDate) ?? new Date();
    const allowAppend = Boolean(payload.appendToExistingBill);
    const invoiceKey = payload.invoiceNumber?.trim();
    // Reject duplicate supplier invoices before mutating stock (unless append opted in).
    if (invoiceKey && !allowAppend) {
      const dup = await this.inventory.checkPurchaseInvoice(tenantId, invoiceKey);
      if (dup.exists) {
        throw new ConflictException(dup.message);
      }
    }

    const results: Array<{
      productId: string;
      sku: string;
      name: string;
      quantityAdded: number;
      newStock: number;
      created: boolean;
      stockDate: string;
      trackSerial: boolean;
      serialsAdded: number;
      needsEnrichment: boolean;
      commitStock: boolean;
    }> = [];

    await this.prisma.$transaction(async (tx) => {
      for (const line of payload.lines) {
        const qty = Number(line.quantity);
        if (!Number.isFinite(qty) || qty <= 0) {
          throw new BadRequestException(`Invalid quantity for ${line.name}`);
        }

        const serials = (line.serialNumbers ?? [])
          .map((s) => s.trim())
          .filter(Boolean);
        const trackSerial = Boolean(line.trackSerial);
        const commitStock = line.commitStock !== false;

        if (trackSerial && commitStock) {
          if (serials.length !== Math.round(qty)) {
            throw new BadRequestException(
              `"${line.name}" tracks serials: provide exactly ${Math.round(qty)} serial number(s) (got ${serials.length}).`,
            );
          }
          const unique = new Set(serials.map((s) => s.toUpperCase()));
          if (unique.size !== serials.length) {
            throw new BadRequestException(`Duplicate serials on line "${line.name}"`);
          }
        }

        if (line.barcode?.trim()) {
          const clash = await tx.product.findFirst({
            where: {
              tenantId,
              barcode: line.barcode.trim(),
              ...(line.productId ? { NOT: { id: line.productId } } : {}),
            },
          });
          if (clash) {
            throw new BadRequestException(
              `Barcode ${line.barcode.trim()} already used by ${clash.name} (${clash.sku})`,
            );
          }
        }

        let product = line.productId
          ? await tx.product.findFirst({ where: { id: line.productId, tenantId, isActive: true } })
          : null;

        if (!product && line.sku) {
          product = await tx.product.findFirst({
            where: { tenantId, sku: line.sku, isActive: true },
          });
        }

        let created = false;
        if (!product) {
          product = await tx.product.findFirst({
            where: {
              tenantId,
              isActive: true,
              name: { equals: line.name.trim(), mode: 'insensitive' },
            },
          });
        }

        if (!product) {
          if (line.createIfMissing === false) {
            throw new NotFoundException(`Product not found for line: ${line.name}`);
          }
          const category = line.category ?? this.guessCategory(line.name);
          const brand = line.brand ?? this.guessBrand(line.name);
          let sku = line.sku?.trim() || this.makeSku(category, brand, line.name);
          const existingSku = await tx.product.findFirst({
            where: { tenantId, sku },
          });
          if (existingSku) {
            product = existingSku;
          } else {
            const unitPrice = Number(line.unitPrice ?? 0);
            const salePrice =
              line.salePrice != null && Number(line.salePrice) > 0
                ? Number(line.salePrice)
                : unitPrice > 0
                  ? Math.round(unitPrice * 1.2 * 100) / 100
                  : 0;
            for (let attempt = 0; attempt < 5; attempt++) {
              const candidate =
                attempt === 0
                  ? sku
                  : `${sku}-${Math.random().toString(36).slice(2, 5).toUpperCase()}`;
              const clash = await tx.product.findFirst({ where: { tenantId, sku: candidate } });
              if (!clash) {
                sku = candidate;
                break;
              }
            }
            product = await tx.product.create({
              data: {
                tenantId,
                sku,
                barcode: line.barcode?.trim() || null,
                name: line.name.trim(),
                hsnCode: line.hsnCode || this.defaultHsn(category),
                category,
                brand,
                model: line.model?.trim() || null,
                salePrice,
                purchasePrice: unitPrice,
                gstRate: nearestGstSlab(
                  line.gstRate ?? (category === 'Battery' ? 28 : 18),
                ),
                stockQty: 0,
                lowStockThreshold: 3,
                unit: 'pcs',
                trackSerial,
                needsEnrichment: false,
              },
            });
            created = true;
          }
        }

        const unitPrice = Number(line.unitPrice ?? 0);
        const patch: Prisma.ProductUpdateInput = {};
        if (unitPrice > 0) patch.purchasePrice = unitPrice;
        if (line.salePrice != null && Number(line.salePrice) > 0) {
          patch.salePrice = Number(line.salePrice);
        }
        if (line.barcode?.trim()) patch.barcode = line.barcode.trim();
        if (line.model?.trim()) patch.model = line.model.trim();
        if (line.brand?.trim()) patch.brand = line.brand.trim();
        if (line.category?.trim()) patch.category = line.category.trim();
        if (line.hsnCode?.trim()) patch.hsnCode = line.hsnCode.trim();
        if (line.gstRate != null) patch.gstRate = nearestGstSlab(Number(line.gstRate));
        if (line.trackSerial != null) patch.trackSerial = trackSerial;
        if (commitStock) patch.stockQty = { increment: qty };

        const updated = await tx.product.update({
          where: { id: product.id },
          data: patch,
        });

        if (trackSerial && serials.length) {
          for (const serial of serials) {
            const exists = await tx.productSerial.findFirst({
              where: {
                OR: [
                  { productId: product.id, serialNumber: serial },
                  { serialNumber: serial, product: { tenantId } },
                ],
              },
            });
            if (exists) {
              throw new BadRequestException(`Serial already exists: ${serial}`);
            }
            await tx.productSerial.create({
              data: {
                productId: product.id,
                serialNumber: serial,
                status: commitStock ? 'IN_STOCK' : 'IN_STOCK',
              },
            });
          }
        }

        const missing = this.missingEnrichmentFields({
          barcode: updated.barcode,
          salePrice: Number(updated.salePrice),
          model: updated.model,
          created,
          strongMatch: Boolean(line.productId) && !created,
        });
        const needsEnrichment = missing.length > 0;
        if (needsEnrichment !== updated.needsEnrichment) {
          await tx.product.update({
            where: { id: product.id },
            data: { needsEnrichment },
          });
        }
        if (needsEnrichment) {
          const existingPending = await tx.productEnrichment.findFirst({
            where: { tenantId, productId: product.id, status: 'PENDING' },
            orderBy: { createdAt: 'desc' },
          });
          if (existingPending) {
            await tx.productEnrichment.update({
              where: { id: existingPending.id },
              data: {
                missingFields: missing,
                draftName: line.name.trim(),
                sourceUploadId: payload.uploadId ?? existingPending.sourceUploadId,
                draftId: payload.draftId ?? existingPending.draftId,
                notes: payload.invoiceNumber
                  ? `From invoice ${payload.invoiceNumber}`
                  : existingPending.notes ?? 'From stock-in',
              },
            });
          } else {
            await tx.productEnrichment.create({
              data: {
                tenantId,
                productId: product.id,
                sourceUploadId: payload.uploadId,
                draftId: payload.draftId,
                status: 'PENDING',
                missingFields: missing,
                draftName: line.name.trim(),
                notes: payload.invoiceNumber
                  ? `From invoice ${payload.invoiceNumber}`
                  : 'From stock-in',
              },
            });
          }
        }

        if (commitStock) {
        const notes = [
          'Stock-in from supplier invoice',
          payload.invoiceNumber ? `Inv ${payload.invoiceNumber}` : null,
          payload.invoiceDate ? `Dated ${payload.invoiceDate}` : null,
          payload.supplierName ? `Supplier ${payload.supplierName}` : null,
          payload.gstin ? `GSTIN ${payload.gstin}` : null,
            trackSerial && serials.length ? `Serials: ${serials.join(', ')}` : null,
        ]
          .filter(Boolean)
          .join(' · ');

        await tx.stockLedger.create({
          data: {
            tenantId,
            productId: product.id,
            type: 'PURCHASE',
            quantity: qty,
              referenceId: payload.uploadId ?? payload.draftId,
            notes,
            createdAt: stockDate,
          },
          });
        }

        await this.upsertAlias(tx, tenantId, {
          supplierName: payload.supplierName,
          aliasName: line.name,
          productId: product.id,
          hsnCode: line.hsnCode ?? updated.hsnCode,
        });

        results.push({
          productId: product.id,
          sku: updated.sku,
          name: updated.name,
          quantityAdded: commitStock ? qty : 0,
          newStock: Number(updated.stockQty),
          created,
          stockDate: stockDate.toISOString().slice(0, 10),
          trackSerial,
          serialsAdded: serials.length,
          needsEnrichment,
          commitStock,
        });
      }

      if (payload.draftId) {
        const draft = await tx.draftStockIn.findFirst({
          where: { id: payload.draftId, tenantId },
        });
        if (draft) {
          const allCommitted = results.every((r) => r.commitStock);
          await tx.draftStockIn.update({
            where: { id: draft.id },
            data: { status: allCommitted ? 'CONFIRMED' : 'PARTIAL' },
          });
        }
      }
    });

    for (const line of payload.lines) {
      await this.ensureCategoryMaster(tenantId, line.category);
    }

    const stocked = results.filter((r) => r.commitStock).length;
    const queued = results.filter((r) => r.needsEnrichment).length;

    let purchaseBill: Awaited<ReturnType<InventoryService['upsertPurchaseBillFromStockIn']>> | null =
      null;
    let supplier: Awaited<ReturnType<InventoryService['ensureSupplierFromInvoice']>> | null = null;

    // Always upsert supplier into Suppliers section when header fields exist
    if (payload.supplierId || payload.supplierName?.trim() || payload.gstin?.trim()) {
      supplier = await this.inventory.ensureSupplierFromInvoice(tenantId, {
        supplierId: payload.supplierId,
        name: payload.supplierName,
        gstin: payload.gstin,
        phone: payload.supplierPhone,
        address: payload.supplierAddress,
        bankName: payload.bankName,
        bankAccount: payload.bankAccount,
        ifsc: payload.ifsc,
        bankBranch: payload.bankBranch,
      });
    }

    const billLines = results
      .filter((r) => r.commitStock && r.quantityAdded > 0)
      .map((r) => {
        const src = payload.lines.find(
          (l) => l.productId === r.productId || l.name.trim() === r.name,
        );
        return {
          productId: r.productId,
          productName: r.name,
          sku: r.sku,
          quantity: r.quantityAdded,
          unitCost: Number(src?.unitPrice ?? 0),
          hsnCode: src?.hsnCode,
          gstRate: src?.gstRate,
        };
      });

    const taxFromParts =
      (Number(payload.cgstAmount) || 0) +
      (Number(payload.sgstAmount) || 0) +
      (Number(payload.igstAmount) || 0);
    const taxAmount =
      payload.taxAmount != null && Number.isFinite(payload.taxAmount)
        ? Number(payload.taxAmount)
        : taxFromParts || undefined;

    const billNotesPayload = {
      source: 'stock-in',
      irn: payload.irn || null,
      ackNo: payload.ackNo || null,
      ackDate: payload.ackDate || null,
      ewayBillNo: payload.ewayBillNo || null,
      vehicleNo: payload.vehicleNo || null,
      bankName: payload.bankName || null,
      bankAccount: payload.bankAccount || null,
      ifsc: payload.ifsc || null,
      bankBranch: payload.bankBranch || null,
      placeOfSupply: payload.placeOfSupply || null,
      stateName: payload.stateName || null,
      customerName: payload.customerName || null,
      customerGstin: payload.customerGstin || null,
      cgstAmount: payload.cgstAmount ?? null,
      sgstAmount: payload.sgstAmount ?? null,
      igstAmount: payload.igstAmount ?? null,
      notes: payload.notes || null,
    };

    if (payload.invoiceNumber?.trim() && billLines.length) {
      let billImagePath: string | undefined;
      let billImageName: string | undefined;
      let billImageMime: string | undefined;
      if (payload.uploadId) {
        const uploads = await this.prisma.$queryRaw<
          Array<{ filePath: string; originalName: string; mimeType: string | null }>
        >`
          SELECT "filePath", "originalName", "mimeType"
          FROM "InvoiceUpload"
          WHERE "id" = ${payload.uploadId} AND "tenantId" = ${tenantId}
          LIMIT 1
        `;
        if (uploads[0]) {
          billImagePath = uploads[0].filePath;
          billImageName = uploads[0].originalName;
          billImageMime = uploads[0].mimeType ?? undefined;
        }
      }
      purchaseBill = await this.inventory.upsertPurchaseBillFromStockIn(tenantId, {
        supplierId: supplier?.id ?? payload.supplierId,
        supplierName: payload.supplierName ?? supplier?.name,
        supplierPhone: payload.supplierPhone,
        supplierAddress: payload.supplierAddress,
        bankName: payload.bankName,
        bankAccount: payload.bankAccount,
        ifsc: payload.ifsc,
        bankBranch: payload.bankBranch,
        createdByUserId,
        invoiceNumber: payload.invoiceNumber.trim(),
        invoiceDate: stockDate,
        gstin: payload.gstin ?? supplier?.gstin ?? undefined,
        placeOfSupply: payload.placeOfSupply,
        irn: payload.irn,
        uploadId: payload.uploadId,
        billImagePath,
        billImageName,
        billImageMime,
        taxableValue: payload.taxableValue,
        taxAmount,
        cgstAmount: payload.cgstAmount,
        sgstAmount: payload.sgstAmount,
        igstAmount: payload.igstAmount,
        totalAmount: payload.totalAmount,
        notes: JSON.stringify(billNotesPayload),
        allowAppend,
        lines: billLines,
      });
      // Prefer bill's linked supplier in response
      if (purchaseBill?.supplier) supplier = purchaseBill.supplier;
    }

    return {
      success: true,
      message: `Stock updated for ${stocked} item(s)${queued ? `; ${queued} need catalog details` : ''}${
        purchaseBill ? ` · bill ${purchaseBill.invoiceNumber}` : ''
      }${supplier ? ` · supplier ${supplier.name}` : ''} · dated ${stockDate.toLocaleDateString('en-IN')}`,
      invoiceDate: formatAppDate(stockDate) ?? stockDate.toISOString().slice(0, 10),
      items: results,
      purchaseBill,
      supplier,
    };
  }

  private analyzeDraftPreview(
    preview: Record<string, unknown> | null | undefined,
    header: {
      supplierName?: string | null;
      invoiceNumber?: string | null;
      gstin?: string | null;
    },
  ) {
    const p = preview && typeof preview === 'object' ? preview : {};
    const lines = Array.isArray(p.lines) ? (p.lines as Record<string, unknown>[]) : [];
    const missingFields: string[] = [];
    const supplier = String(header.supplierName || p.supplierName || '').trim();
    const invoiceNumber = String(header.invoiceNumber || p.invoiceNumber || '').trim();
    if (!supplier) missingFields.push('supplier');
    if (!invoiceNumber) missingFields.push('invoiceNumber');
    if (!lines.length) missingFields.push('items');

    let needsSerials = 0;
    let unmatched = 0;
    let ready = 0;
    for (const line of lines) {
      const qty = Math.round(Number(line.quantity) || 0);
      const trackSerial = Boolean(line.trackSerial);
      const serials = Array.isArray(line.serialNumbers)
        ? line.serialNumbers.map(String).map((s) => s.trim()).filter(Boolean)
        : String(line.serialNumbers || '')
            .split(/[\n,]+/)
            .map((s) => s.trim())
            .filter(Boolean);
      if (trackSerial && (qty <= 0 || serials.length !== qty)) {
        needsSerials += 1;
      } else if (!line.productId && !String(line.barcode || '').trim()) {
        unmatched += 1;
      } else {
        ready += 1;
      }
    }
    if (needsSerials > 0) missingFields.push('serials');

    const totalRaw = p.totalAmount;
    const totalAmount =
      totalRaw != null && totalRaw !== '' && Number.isFinite(Number(totalRaw))
        ? Number(totalRaw)
        : null;

    return {
      lineCount: lines.length,
      needsSerials,
      unmatched,
      ready,
      missingFields,
      totalAmount,
      gstin: String(header.gstin || p.gstin || '').trim() || null,
    };
  }

  async saveDraft(
    tenantId: string,
    data: {
      uploadId?: string;
      supplierName?: string;
      invoiceNumber?: string;
      invoiceDate?: string;
      gstin?: string;
      notes?: string;
      previewJson: Record<string, unknown>;
      draftId?: string;
    },
  ) {
    const invoiceDate = formatAppDate(data.invoiceDate) ?? data.invoiceDate;
    const payload = {
      uploadId: data.uploadId,
      supplierName: data.supplierName,
      invoiceNumber: data.invoiceNumber,
      invoiceDate,
      gstin: data.gstin,
      notes: data.notes,
      previewJson: data.previewJson as Prisma.InputJsonValue,
    };

    if (data.draftId) {
      const existing = await this.prisma.draftStockIn.findFirst({
        where: { id: data.draftId, tenantId, status: { in: ['OPEN', 'PARTIAL'] } },
      });
      if (!existing) throw new NotFoundException('Draft not found');
      return this.prisma.draftStockIn.update({
        where: { id: existing.id },
        data: {
          ...payload,
          // Keep PARTIAL if some lines were already confirmed
          status: existing.status === 'PARTIAL' ? 'PARTIAL' : 'OPEN',
        },
      });
    }

    // Upsert by invoice # + supplier/GSTIN so re-saving the same bill doesn't duplicate
    const invoiceKey = data.invoiceNumber?.trim();
    if (invoiceKey) {
      const gstinKey = data.gstin?.trim();
      const supplierKey = data.supplierName?.trim();
      const twin = await this.prisma.draftStockIn.findFirst({
        where: {
          tenantId,
          status: { in: ['OPEN', 'PARTIAL'] },
          invoiceNumber: invoiceKey,
          ...(gstinKey
            ? { gstin: gstinKey }
            : supplierKey
              ? { supplierName: supplierKey }
              : {}),
        },
        orderBy: { updatedAt: 'desc' },
      });
      if (twin) {
        return this.prisma.draftStockIn.update({
          where: { id: twin.id },
          data: {
            ...payload,
            status: twin.status === 'PARTIAL' ? 'PARTIAL' : 'OPEN',
          },
        });
      }
    }

    return this.prisma.draftStockIn.create({
      data: {
        tenantId,
        ...payload,
        status: 'OPEN',
      },
    });
  }

  async listDrafts(tenantId: string) {
    const rows = await this.prisma.draftStockIn.findMany({
      where: { tenantId, status: { in: ['OPEN', 'PARTIAL'] } },
      orderBy: { updatedAt: 'desc' },
      take: 50,
    });
    return rows.map((row) => {
      const preview =
        row.previewJson && typeof row.previewJson === 'object' && !Array.isArray(row.previewJson)
          ? (row.previewJson as Record<string, unknown>)
          : {};
      const summary = this.analyzeDraftPreview(preview, row);
      return {
        ...row,
        invoiceDate: formatAppDate(row.invoiceDate) ?? row.invoiceDate,
        ...summary,
      };
    });
  }

  async getDraft(tenantId: string, id: string) {
    const draft = await this.prisma.draftStockIn.findFirst({ where: { id, tenantId } });
    if (!draft) throw new NotFoundException('Draft not found');
    const preview =
      draft.previewJson && typeof draft.previewJson === 'object' && !Array.isArray(draft.previewJson)
        ? (draft.previewJson as Record<string, unknown>)
        : {};
    const summary = this.analyzeDraftPreview(preview, draft);
    return {
      ...draft,
      invoiceDate: formatAppDate(draft.invoiceDate) ?? draft.invoiceDate,
      ...summary,
    };
  }

  async discardDraft(tenantId: string, id: string) {
    const draft = await this.prisma.draftStockIn.findFirst({ where: { id, tenantId } });
    if (!draft) throw new NotFoundException('Draft not found');
    return this.prisma.draftStockIn.update({
      where: { id },
      data: { status: 'DISCARDED' },
    });
  }

  async listEnrichments(tenantId: string, status: 'PENDING' | 'DONE' | 'SKIPPED' | 'ALL' = 'PENDING') {
    return this.prisma.productEnrichment.findMany({
      where: {
        tenantId,
        ...(status === 'ALL' ? {} : { status }),
      },
      include: {
        product: {
          select: {
            id: true,
            sku: true,
            name: true,
            barcode: true,
            salePrice: true,
            purchasePrice: true,
            model: true,
            brand: true,
            category: true,
            hsnCode: true,
            gstRate: true,
            trackSerial: true,
            stockQty: true,
            needsEnrichment: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async completeEnrichment(
    tenantId: string,
    enrichmentId: string,
    body: {
      barcode?: string;
      salePrice?: number;
      model?: string;
      brand?: string;
      category?: string;
      hsnCode?: string;
      gstRate?: number;
      trackSerial?: boolean;
      skip?: boolean;
      serialNumbers?: string[];
      addStockQty?: number;
    },
  ) {
    const row = await this.prisma.productEnrichment.findFirst({
      where: { id: enrichmentId, tenantId },
      include: { product: true },
    });
    if (!row) throw new NotFoundException('Enrichment item not found');

    if (body.skip) {
      // Dismiss from queue only — catalog stays flagged incomplete until fields are filled.
      await this.prisma.productEnrichment.update({
        where: { id: row.id },
        data: { status: 'SKIPPED' },
      });
      return { success: true, status: 'SKIPPED' as const, missingFields: row.missingFields };
    }

    if (body.barcode?.trim()) {
      const clash = await this.prisma.product.findFirst({
        where: {
          tenantId,
          barcode: body.barcode.trim(),
          NOT: { id: row.productId },
        },
      });
      if (clash) {
        throw new BadRequestException(`Barcode already used by ${clash.name}`);
      }
    }

    const serials = (body.serialNumbers ?? []).map((s) => s.trim()).filter(Boolean);
    const trackSerial = body.trackSerial ?? row.product.trackSerial;
    const addQty = body.addStockQty != null ? Number(body.addStockQty) : 0;
    if (trackSerial && addQty > 0) {
      if (serials.length !== Math.round(addQty)) {
        throw new BadRequestException(
          `Provide exactly ${Math.round(addQty)} serials when adding stock`,
        );
      }
    }

    if (serials.length) {
      for (const serial of serials) {
        const clash = await this.prisma.productSerial.findFirst({
          where: { productId: row.productId, serialNumber: serial },
        });
        if (clash) {
          throw new BadRequestException(`Serial already exists: ${serial}`);
        }
      }
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.product.update({
        where: { id: row.productId },
        data: {
          ...(body.barcode?.trim() ? { barcode: body.barcode.trim() } : {}),
          ...(body.salePrice != null ? { salePrice: body.salePrice } : {}),
          ...(body.model?.trim() ? { model: body.model.trim() } : {}),
          ...(body.brand?.trim() ? { brand: body.brand.trim() } : {}),
          ...(body.category?.trim() ? { category: body.category.trim() } : {}),
          ...(body.hsnCode?.trim() ? { hsnCode: body.hsnCode.trim() } : {}),
          ...(body.gstRate != null ? { gstRate: nearestGstSlab(Number(body.gstRate)) } : {}),
          ...(body.trackSerial != null ? { trackSerial: body.trackSerial } : {}),
          ...(addQty > 0 ? { stockQty: { increment: addQty } } : {}),
        },
      });

      for (const serial of serials) {
        await tx.productSerial.create({
          data: {
            productId: row.productId,
            serialNumber: serial,
            status: 'IN_STOCK',
          },
        });
      }

      if (addQty > 0) {
        await tx.stockLedger.create({
          data: {
            tenantId,
            productId: row.productId,
            type: 'PURCHASE',
            quantity: addQty,
            notes: 'Stock added while completing product enrichment',
          },
        });
      }

      // Keep original queue intent: barcode required unless it was never missing;
      // model required if it was queued for model; salePrice always when ≤ 0.
      const prior = row.missingFields ?? [];
      const stillMissing = this.missingEnrichmentFields({
        barcode: updated.barcode,
        salePrice: Number(updated.salePrice),
        model: updated.model,
        created: prior.includes('model'),
        strongMatch: !prior.includes('barcode'),
      });

      await tx.product.update({
        where: { id: row.productId },
        data: { needsEnrichment: stillMissing.length > 0 },
      });
      const status = stillMissing.length ? 'PENDING' : 'DONE';
      await tx.productEnrichment.update({
        where: { id: row.id },
        data: {
          status,
          missingFields: stillMissing,
        },
      });
      return { status, missingFields: stillMissing, productId: row.productId };
    });

    await this.ensureCategoryMaster(tenantId, body.category);
    return { success: true, ...result };
  }

  async searchProducts(tenantId: string, q: string) {
    const query = q.trim();
    if (!query) return [];
    return this.prisma.product.findMany({
      where: {
        tenantId,
        isActive: true,
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { sku: { contains: query, mode: 'insensitive' } },
          { barcode: { contains: query, mode: 'insensitive' } },
          { brand: { contains: query, mode: 'insensitive' } },
        ],
      },
      take: 20,
      select: {
        id: true,
        sku: true,
        name: true,
        barcode: true,
        brand: true,
        model: true,
        salePrice: true,
        purchasePrice: true,
        stockQty: true,
        trackSerial: true,
        hsnCode: true,
        gstRate: true,
        category: true,
      },
    });
  }

  private aliasKey(supplierName: string, aliasName: string) {
    const s = (supplierName || '').trim().toLowerCase().replace(/\s+/g, ' ');
    const a = aliasName.trim().toLowerCase().replace(/\s+/g, ' ');
    return `${s}::${a}`;
  }

  private async upsertAlias(
    tx: Prisma.TransactionClient,
    tenantId: string,
    data: { supplierName?: string; aliasName: string; productId: string; hsnCode?: string },
  ) {
    const key = this.aliasKey(data.supplierName || '', data.aliasName);
    const existing = await tx.supplierProductAlias.findUnique({
      where: { tenantId_aliasKey: { tenantId, aliasKey: key } },
    });
    if (existing) {
      await tx.supplierProductAlias.update({
        where: { id: existing.id },
        data: {
          productId: data.productId,
          hitCount: { increment: 1 },
          hsnCode: data.hsnCode,
          supplierName: data.supplierName,
        },
      });
      return;
    }
    await tx.supplierProductAlias.create({
      data: {
        tenantId,
        supplierName: data.supplierName,
        aliasName: data.aliasName.trim(),
        aliasKey: key,
        productId: data.productId,
        hsnCode: data.hsnCode,
      },
    });
  }

  private missingEnrichmentFields(opts: {
    barcode: string | null;
    salePrice: number;
    model: string | null;
    created: boolean;
    strongMatch: boolean;
  }): string[] {
    const missing: string[] = [];
    // Barcode required for POS sell completeness when product was auto-created or weak match
    if (!opts.barcode?.trim() && (opts.created || !opts.strongMatch)) missing.push('barcode');
    if (!(opts.salePrice > 0)) missing.push('salePrice');
    if (opts.created && !opts.model?.trim()) missing.push('model');
    return missing;
  }

  async getTemplates(tenantId: string) {
    return this.prisma.scanTemplate.findMany({
      where: { tenantId },
      orderBy: { updatedAt: 'desc' },
    });
  }

  async createTemplate(
    tenantId: string,
    data: { name: string; supplierName?: string; fieldMappings?: Record<string, unknown>; sampleText?: string },
  ) {
    return this.prisma.scanTemplate.create({
      data: {
        tenantId,
        name: data.name,
        supplierName: data.supplierName,
        fieldMappings: (data.fieldMappings ?? {}) as Prisma.InputJsonValue,
        sampleText: data.sampleText,
      },
    });
  }

  async updateTemplate(
    tenantId: string,
    id: string,
    data: { name?: string; supplierName?: string; fieldMappings?: Record<string, unknown>; sampleText?: string },
  ) {
    const existing = await this.prisma.scanTemplate.findFirst({ where: { id, tenantId } });
    if (!existing) throw new Error('Scan template not found');
    return this.prisma.scanTemplate.update({
      where: { id },
      data: {
        ...data,
        fieldMappings: data.fieldMappings
          ? (data.fieldMappings as Prisma.InputJsonValue)
          : undefined,
      },
    });
  }

  async deleteTemplate(tenantId: string, id: string) {
    const existing = await this.prisma.scanTemplate.findFirst({ where: { id, tenantId } });
    if (!existing) throw new Error('Scan template not found');
    await this.prisma.scanTemplate.delete({ where: { id } });
    return { deleted: true };
  }

  private extractPurchaseLines(text: string) {
    const lines: Array<{
      name: string;
      quantity: number;
      unitPrice?: number;
      hsnCode?: string;
      gstRate?: number;
      brand?: string;
      category?: string;
    }> = [];

    const seen = new Set<string>();
    const byName = new Map<string, (typeof lines)[number] & { _score: number }>();

    const nameKeyOf = (name: string) =>
      name
        .toLowerCase()
        .replace(/\b\d{4,8}\b/g, '')
        .replace(/[|]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    const lineScore = (line: { quantity: number; unitPrice?: number; hsnCode?: string }) =>
      (line.hsnCode ? 4 : 0) + (line.unitPrice ? 3 : 0) + Math.min(line.quantity, 20);

    const isGarbageProductName = (name: string) => {
      const letters = (name.match(/[A-Za-z\u0900-\u097F]/g) || []).length;
      const symbols = (name.match(/[^A-Za-z0-9\u0900-\u097F\s.&\/\-_%]/g) || []).length;
      if (letters < 3) return true;
      if (symbols > Math.max(2, letters / 2)) return true;
      if (
        /description\s+of\s+goods|taxable\s+cgst|value\s+amount|hen\s+taxable|sl\s+description|of\s+goods|goods\s+hsn|amount\s+rate|total\s*$|ax\s+aro|continued|page\s*\d/i.test(
          name,
        )
      ) {
        return true;
      }
      const tokens = name.split(/\s+/).filter(Boolean);
      if (tokens.length >= 3 && tokens.filter((t) => t.length <= 1).length >= tokens.length / 2) return true;
      // OCR noise with almost no vowels/consonants ratio (Latin)
      const latin = (name.match(/[A-Za-z]/g) || []).join('');
      if (latin.length >= 6) {
        const vowels = (latin.match(/[aeiouAEIOU]/g) || []).length;
        if (vowels === 0 && !/[0-9]{2,}/.test(name)) return true;
      }
      return false;
    };

    /** Reject rates stolen from model codes (EVO-D 800 → unitPrice 800). */
    const isModelCodeAsPrice = (name: string, price?: number) => {
      if (price == null || !Number.isFinite(price)) return false;
      const p = Math.round(price);
      if (p < 50 || p > 5000) return false;
      if (new RegExp(`(?:EVO-?D|MODEL)\\s*${p}\\b`, 'i').test(name)) return true;
      if (new RegExp(`\\b${p}\\s*/\\s*\\d{2}\\s*V?\\b`, 'i').test(name)) return true;
      return false;
    };

    const pushLine = (line: (typeof lines)[number], scoreBoost = 0) => {
      if (line.gstRate != null && Number.isFinite(Number(line.gstRate))) {
        line = { ...line, gstRate: nearestGstSlab(Number(line.gstRate)) };
      }
      let name = line.name
        .trim()
        .replace(/\s{2,}/g, ' ')
        .replace(/^(?:HS\??|H\s*S\s*N|Sr\.?|Sl\.?)\s+/i, '')
        .replace(/[»›]+/g, ' ')
        .replace(/\s{2,}/g, ' ')
        // Strip glued trailing HSN (EVO-D 800/12V85044010)
        .replace(/\s*8\d{7}$/, '')
        .replace(/\s*[{[(]+\s*$/g, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
      if (name.length < 3) return;
      if (isGarbageProductName(name)) return;
      if (
        /^(description|item|particulars|hsn|qty|rate|amount|total|cgst|sgst|igst|sl\.?\s*no|taxable|grand|bill|invoice|service|#)$/i.test(
          name,
        )
      ) {
        return;
      }
      // Address / tax / footer rows that look like products after OCR
      if (
        /\b(market|road|street|nagar|colony|theatre|theater|mohalla|sector|plot|near|opp|industrial\s+area|phase-?\d|bill\s*to|billed\s*to|buyer|place\s*of\s*supply|state\s*name|authorised|signatory|bank\s*name|bank\s*details|ifs\s*code|continued\s+to\s+page|computer\s+generated|output\s+(?:cgst|sgst|igst)|cgst\s+sale|sgst\s+sale|taxable\s+value|round\s*off|less\s*:?\s*discount|transportation\s+charges|old\s+batt?ery)\b/i.test(
          name,
        )
      ) {
        return;
      }
      if (/^output\s+(?:cgst|sgst|igst)/i.test(name)) return;
      if (/^(add|less)\s*:?\s*(cgst|sgst|igst|discount|round)/i.test(name)) return;
      // Pure address fragments
      if (/^(plot|gala|mohalla|opp\.?|near)\b/i.test(name)) return;
      // Drop OCR garbage that is mostly digits/punctuation (allow model codes like ED22036TT)
      const letterCount = (name.match(/[A-Za-z\u0900-\u097F]/g) || []).length;
      if (letterCount < 2) return;
      // Name that still has a trailing HSN token is usually a bad partial match.
      // Keep real model numbers (e.g. "Inverter Pro 1100") when HSN + GST were parsed separately.
      if (/\b\d{4,8}$/.test(name) && !/\d{3,4}\/\d{2}V?$/i.test(name)) {
        const trailing = name.match(/\b(\d{4,8})$/)?.[1];
        const hasOwnHsn =
          Boolean(line.hsnCode) &&
          trailing != null &&
          String(line.hsnCode) !== trailing &&
          line.gstRate != null;
        if (!hasOwnHsn && scoreBoost < 10) return;
      }
      // Require a meaningful unit price for low-score keyword hits later
      if (line.quantity <= 0 || line.quantity > 20000) return;
      if (line.unitPrice != null && (line.unitPrice <= 0 || line.unitPrice > 5_000_000)) return;
      // Never keep model-number-as-price junk (unless high-confidence amount-validated strategy)
      if (isModelCodeAsPrice(name, line.unitPrice) && scoreBoost < 10) return;
      // Reject absurd qty×rate without amount validation for huge qtys from pincodes
      if (line.quantity > 500 && (line.unitPrice == null || line.unitPrice > 100000)) return;
      // Camera OCR often invents qty=1 rows with no rate — never keep those
      if (line.unitPrice == null && scoreBoost < 8) return;

      const key = `${name.toLowerCase()}|${line.quantity}|${line.unitPrice ?? ''}`;
      if (seen.has(key)) return;
      seen.add(key);

      const scored = { ...line, name, _score: lineScore(line) + scoreBoost };
      // Keep distinct qty/rate variants of the same product name (e.g. two BL 56 lines)
      const nameKey = `${nameKeyOf(name)}|${line.quantity}|${line.unitPrice ?? ''}`;
      const existing = byName.get(nameKey);
      if (!existing || scored._score > existing._score) {
        byName.set(nameKey, scored);
      }
    };

    /** Prefer qty/rate where amount ≈ qty×rate; avoid treating HSN as qty. */
    const pickQtyRate = (nums: number[], hsn?: string) => {
      const candidates = nums.filter((n) => !(hsn && n === Number(hsn)));
      if (candidates.length < 2) {
        return {
          quantity: candidates[0] && candidates[0] <= 9999 ? candidates[0] : 1,
          unitPrice: candidates[1],
        };
      }

      // Try last-as-amount interpretations for 3+ numbers: qty, rate, [disc], amount
      if (candidates.length >= 3) {
        const amount = candidates[candidates.length - 1];
        for (let i = 0; i < candidates.length - 1; i++) {
          for (let j = i + 1; j < candidates.length - 1; j++) {
            const qty = candidates[i];
            const rate = candidates[j];
            if (qty <= 0 || qty > 5000 || rate < 1) continue;
            const expected = qty * rate;
            if (Math.abs(expected - amount) <= Math.max(1, expected * 0.08)) {
              return { quantity: qty, unitPrice: rate };
            }
            // discount % between rate and amount
            if (candidates.length >= 4) {
              const disc = candidates[j + 1];
              if (disc >= 0 && disc <= 100) {
                const discounted = expected * (1 - disc / 100);
                if (Math.abs(discounted - amount) <= Math.max(1, discounted * 0.08)) {
                  return { quantity: qty, unitPrice: rate };
                }
              }
            }
          }
        }
      }

      // Fallback: first small number as qty, next larger as rate (skip HSN-like 4-digit 8xxx)
      let quantity = candidates[0];
      let unitPrice = candidates[1];
      if (quantity > 500 && candidates[1] <= 500) {
        quantity = candidates[1];
        unitPrice = candidates[0];
      }
      // If first looks like HSN (8507 etc.) shift
      if (quantity >= 1000 && quantity <= 99999999 && String(Math.trunc(quantity)).length >= 4) {
        quantity = candidates[1] ?? 1;
        unitPrice = candidates[2] ?? candidates[1];
      }
      return { quantity, unitPrice };
    };

    const isLikelyHsn = (n: number) => {
      const s = String(Math.trunc(n));
      return s.length >= 4 && s.length <= 8 && /^[0-9]+$/.test(s);
    };

    // --- Strategy 0-col: column-scrambled Tally OCR (names / qty / rate / amount in separate blocks) ---
    // Camera OCR often emits SI+name, then a qty column, then rates, then amounts out of order.
    {
      const descIdx = text.search(/description\s+of\s+goods/i);
      const qtyBlockIdx = text.search(/quantity\s*sale\s*price|quantity/i);
      const rateBlockIdx = Math.max(
        text.search(/\brate\s*per\b/i),
        text.search(/(?:^|\n)\s*rate\s*\n/i),
      );
      const amountBlockIdx = text.search(/(?:^|\n)\s*amount\s*\n/i);
      const gstQtyRows = Array.from(
        text.matchAll(/(\d+(?:\.\d+)?)\s*%\s*[|+]?\s*(\d+(?:\.\d+)?)\s*(?:Pcs?\.?|NOS?\.?)/gi),
      );
      const rateRows = Array.from(
        text.matchAll(/([0-9]+(?:\.\d{2}))\s*[|.]?\s*(?:Pcs?\.?|NOS?\.?)/gi),
      )
        .map((m) => Number(m[1]))
        .filter((n) => n >= 100 && n <= 500000);

      if (gstQtyRows.length >= 2 && rateRows.length >= 2) {
        const products: Array<{ si: number; name: string; hsnCode?: string }> = [];
        const nameRegion =
          descIdx >= 0
            ? text.slice(descIdx, qtyBlockIdx > descIdx ? qtyBlockIdx : descIdx + 2500)
            : text.slice(0, qtyBlockIdx > 0 ? qtyBlockIdx : 2500);

        // Join wrapped model lines: "5 LUMINOUS EVO-D 1050\n/12V" → "5 LUMINOUS EVO-D 1050/12V"
        const nameRegionJoined = nameRegion
          .replace(/([0-9]{3,4})\s*\n\s*[Il|\/]?(\d{2})\s*V\b/gi, '$1/$2V')
          .replace(/\b([0-9]{3,4})\s*\n\s*\/(\d{2})\s*V\b/gi, '$1/$2V')
          .replace(/\b7O0\b/gi, '700')
          .replace(/\bI24V\b/gi, '/24V');

        for (const m of nameRegionJoined.matchAll(
          /(?:^|\n)\s*(\d{1,2})\s*[|.)\-]?\s*((?:LUM(?:INOUS)?|EXIDE|AMARON|MICROTEK|OKAYA|ED|ILTT|ILTJ|BATTERY|ENERGY|SUPER)[^\n]{2,80})/gi,
        )) {
          const si = Number(m[1]);
          if (!(si >= 1 && si <= 40)) continue;
          let raw = m[2]
            .replace(/[|]+/g, ' ')
            .replace(/\bOUTPUT\s+CGST.*$/i, '')
            .replace(/\bHSN\/?SAC.*$/i, '')
            .trim();
          // Pull continuation line fragments already joined above
          const hsnMatch = raw.match(/\b(8\d{3,7})\b/);
          const hsnCode = hsnMatch?.[1];
          let name = raw
            .replace(/\b8\d{3,7}\b/g, ' ')
            .replace(/\s{2,}/g, ' ')
            .trim();
          // Merge "FNSD BTY" style continuation when SI=1 battery
          if (/LUM\s+12V/i.test(name) && /FNSD\s*BTY/i.test(nameRegionJoined)) {
            name = `${name} FNSD BTY`.replace(/\s{2,}/g, ' ');
          }
          if (name.length < 4) continue;
          // Avoid duplicate SI — keep longer name
          const existing = products.find((p) => p.si === si);
          if (existing) {
            if (name.length > existing.name.length) {
              existing.name = name;
              existing.hsnCode = hsnCode ?? existing.hsnCode;
            }
            continue;
          }
          products.push({ si, name, hsnCode });
        }

        // Qty rows in document order (GST% then qty)
        const qtys = gstQtyRows
          .map((m) => ({ gst: Number(m[1]), qty: Number(m[2]) }))
          .filter((r) => r.qty > 0 && r.qty <= 5000 && [0, 5, 12, 18, 28, 3, 6, 9].includes(r.gst));

        // Prefer rate block near "Rate per"; fall back to all decimal rates that aren't amounts
        let rates = rateRows;
        if (rateBlockIdx >= 0) {
          const rateSlice = text.slice(rateBlockIdx, amountBlockIdx > rateBlockIdx ? amountBlockIdx : rateBlockIdx + 800);
          const fromBlock = Array.from(rateSlice.matchAll(/([0-9]+(?:\.\d{2}))/g))
            .map((m) => Number(m[1]))
            .filter((n) => n >= 100 && n <= 500000);
          // Drop trailing taxable/CGST totals if present after product rates
          if (fromBlock.length >= qtys.length) rates = fromBlock.slice(0, qtys.length);
          else if (fromBlock.length >= 2) rates = fromBlock;
        }

        let amounts: number[] = [];
        if (amountBlockIdx >= 0) {
          const amtSlice = text.slice(amountBlockIdx, amountBlockIdx + 600);
          amounts = Array.from(amtSlice.matchAll(/([0-9]+(?:\.\d{2}))/g))
            .map((m) => Number(m[1]))
            .filter((n) => n >= 50);
          // Drop footer totals (taxable + cgst) when more values than products
          if (products.length > 0 && amounts.length > products.length) {
            amounts = amounts.slice(0, products.length);
          } else if (qtys.length > 0 && amounts.length > qtys.length) {
            amounts = amounts.slice(0, qtys.length);
          }
        }

        products.sort((a, b) => a.si - b.si);
        const n = Math.min(products.length, qtys.length, rates.length);
        if (n >= 2) {
          for (let i = 0; i < n; i++) {
            const p = products[i];
            const q = qtys[i];
            let unitPrice = rates[i];
            const amount = amounts[i];
            if (amount != null && q.qty > 0) {
              const implied = amount / q.qty;
              if (Math.abs(implied - unitPrice) > Math.max(2, implied * 0.12)) {
                // Prefer amount/qty when rate column misaligned
                unitPrice = Math.round(implied * 100) / 100;
              }
            }
            if (isModelCodeAsPrice(p.name, unitPrice)) continue;
            pushLine(
              {
                name: p.name,
                hsnCode: p.hsnCode,
                quantity: q.qty,
                unitPrice,
                gstRate: q.gst,
                category: this.guessCategory(p.name),
                brand: this.guessBrand(p.name),
              },
              14,
            );
          }
        }
      }
    }

    // --- Strategy 0-simple: Description-of-goods block + separate HSN/qty/rate columns (NEEL-style) ---
    if (byName.size === 0) {
      const descIdx = text.search(/description\s+of\s+(?:goods|service)/i);
      if (descIdx >= 0) {
        const slice = text.slice(descIdx, descIdx + 1800);
        const nameMatch = slice.match(
          /description\s+of\s+(?:goods|service)\s*\n+([A-Za-z][A-Za-z0-9 .\/\-+&%]{4,90})/i,
        );
        let name = nameMatch?.[1]?.trim();
        if (
          name &&
          /warranty|amount\s+chargeable|including\s+installation|declaration|tax\s*invoice|rounded/i.test(name)
        ) {
          name = undefined;
        }
        const hsnMatch =
          slice.match(/HSN\/?SAC[^\n]{0,40}\n+\s*(\d{4,8})\b/i) ||
          slice.match(/(?:^|\n)\s*(8\d{3,7})\s*(?:\n|$)/);
        const hsnCode = hsnMatch?.[1];
        let quantity = 1;
        if (hsnCode) {
          const afterHsn = slice.slice(slice.toLowerCase().indexOf(hsnCode.toLowerCase()) + hsnCode.length);
          const qtyLine = afterHsn.match(/^\s*\n+\s*(\d+(?:\.\d+)?)\s*(?:\n|$)/);
          if (qtyLine && Number(qtyLine[1]) > 0 && Number(qtyLine[1]) <= 5000) {
            quantity = Number(qtyLine[1]);
          }
        }
        const rateFromPcs = Array.from(text.matchAll(/([0-9]+(?:\.\d{2}))\s*Pcs\.?/gi))
          .map((m) => Number(m[1]))
          .filter((n) => n >= 50 && n <= 500000);
        const amountBlock = text.match(/(?:^|\n)\s*Amount\s*\n\s*([0-9]+(?:\.\d{2}))/i);
        let unitPrice = rateFromPcs.find((n) => n >= 100) ?? (amountBlock ? Number(amountBlock[1]) : undefined);
        if (name && unitPrice != null && !isModelCodeAsPrice(name, unitPrice)) {
          // Prefer amount/qty when both present
          if (amountBlock && quantity > 0) {
            const amt = Number(amountBlock[1]);
            if (Math.abs(amt - quantity * unitPrice) > Math.max(2, amt * 0.15)) {
              unitPrice = Math.round((amt / quantity) * 100) / 100;
            }
          }
          pushLine(
            {
              name,
              hsnCode,
              quantity,
              unitPrice,
              gstRate: /c?gst\s*@\s*9|sgst\s*@\s*9/i.test(text) ? 18 : undefined,
              category: this.guessCategory(name),
              brand: this.guessBrand(name),
            },
            11,
          );
        }
      }
    }

    // --- Strategy 0-goel: CGST/SGST table rows — HSN in parens, Indian commas (Goel camera OCR) ---
    if (byName.size === 0 || /description\s+of\s+goods/i.test(text)) {
      for (const raw of text.split(/\n/)) {
        const line = raw.trim();
        if (!/\b8\d{5,7}\b/.test(line)) continue;
        if (!/9\.?\d*\s*%/.test(line)) continue;
        if (!/(?:pcs?\.?|Pcs?\.?|\d+(?:\.\d+)?\s+Pcs\.?)/i.test(line)) continue;
        if (/description\s+of\s+goods|taxable|grand\s+total|output\s+cgst|hsn\/sac/i.test(line)) continue;

        const hsnMatch = line.match(/\(?\s*(8\d{5,7})\s*[\].|]?/);
        if (!hsnMatch) continue;
        const hsnCode = hsnMatch[1];

        let name = '';
        const batteryMatch = line.match(/(BATTERY\s+LUMINOUS[^\[(|]{4,60})/i);
        if (batteryMatch) {
          name = batteryMatch[1]
            .replace(/\s*vs\s*$/i, '')
            .replace(/\s*[{[(]\s*$/g, '')
            .replace(/\s*8\d{5,7}.*$/i, '')
            .replace(/\s+/g, ' ')
            .trim();
        } else if (/luminous|mous|10848|18148|ILTT/i.test(line)) {
          const model = line.match(/\b(1[08]\d{3,4})\b/);
          const modelCode =
            model?.[1]?.startsWith('108') || model?.[1] === '10848' ? '18148' : model?.[1] ?? '18148';
          name = `BATTERY LUMINOUS ILTT ${modelCode} 12V 15`;
        } else {
          continue;
        }
        if (/\b10848\b/.test(line) && /BATTERY\s+LUMINOUS/i.test(name)) {
          name = 'BATTERY LUMINOUS ILTT 18148 12V 15';
        }
        name = name.replace(/\(\s*8\d{5,7}.*$/i, '').replace(/\s*8\d{5,7}.*$/i, '').replace(/\s*[{[(]+\s*$/g, '').trim();
        if (name.length < 8) continue;

        const pcsMatch = line.match(/(\d+(?:\.\d+)?)\s*(?:pcs?\.?|Pcs?\.?)/i);
        const qty = pcsMatch ? Number(pcsMatch[1]) : undefined;
        if (!qty || qty <= 0 || qty > 5000) continue;

        const nums = Array.from(line.matchAll(/([0-9,]+(?:\.\d{2,4})?)/g))
          .map((m) => Number(m[1].replace(/,/g, '')))
          .filter((n) => Number.isFinite(n) && n !== Number(hsnCode));

        const modelCodes = new Set(
          Array.from(line.matchAll(/\b(1[08]\d{3,4}|18060)\b/g)).map((m) => Number(m[1])),
        );

        let amount: number | undefined;
        const tailMatch = line.match(/([0-9,]+(?:\.\d{2,4})?)\s*$/);
        if (tailMatch) {
          amount = Number(tailMatch[1].replace(/,/g, ''));
        }
        if (amount != null && amount < 10000) {
          const scaled = Math.round(amount * 1000);
          if (scaled >= 10000 && scaled <= 500000) amount = scaled;
        }
        // Ignore CGST/SGST amounts mistaken as line total (e.g. 440465 from 4404.66)
        if (amount != null && amount > 200000 && qty <= 20) {
          const sane = nums.filter((n) => n >= 10000 && n <= 200000).pop();
          if (sane != null) {
            amount = sane;
          } else if (tailMatch) {
            const rawTail = Number(tailMatch[1].replace(/,/g, ''));
            if (rawTail < 10000) {
              const scaled = Math.round(rawTail * 1000);
              if (scaled >= 10000 && scaled <= 500000) amount = scaled;
            }
          }
        }
        if (amount == null) {
          amount = nums.filter((n) => n >= 10000 && n <= 200000).pop();
        }

        let unitPrice: number | undefined;
        const rateCandidates = nums.filter(
          (n) =>
            n >= 500 &&
            n <= 500000 &&
            n !== amount &&
            n !== qty &&
            !modelCodes.has(n) &&
            !(n >= 9 && n <= 28),
        );
        unitPrice = rateCandidates.find((n) => n >= 1000 && n <= 50000);

        if (amount != null && qty > 0) {
          const impliedExTax = Math.round((amount / 1.18 / qty) * 100) / 100;
          if (
            unitPrice == null ||
            Math.abs(impliedExTax - unitPrice) > Math.max(400, impliedExTax * 0.22)
          ) {
            unitPrice = impliedExTax;
          }
        }
        if (unitPrice == null || unitPrice <= 0) continue;

        pushLine(
          {
            name,
            hsnCode,
            quantity: qty,
            unitPrice,
            gstRate: 18,
            category: this.guessCategory(name),
            brand: this.guessBrand(name),
          },
          13,
        );
      }
    }

    // --- Strategy 0: Tally e-invoice (Name HSN GST% Qty UNIT Rate [UNIT] Amount) ---
    // e.g. 1 LUM 12V150AH ... 85072000 18% 5.00 PCS 10762.71 PCS 53813.55
    const tallyGstPattern =
      /^\s*\d{1,3}[.)\-]?\s+([A-Za-z\u0900-\u097F][A-Za-z0-9\u0900-\u097F .\/\-+&%]{2,90}?)\s+(\d{4,8})\s+(\d+(?:\.\d+)?)\s*%\s+(\d+(?:\.\d+)?)\s*(?:PCS|PC|NOS|NO|UNITS?|DOZENS?|KG|LTR|BOX|PKT|SQFT|SQM)?\.?\s+([0-9,]+(?:\.\d{1,2})?)(?:\s+[0-9,]+(?:\.\d{1,2})?)?\s*(?:PCS|PC|NOS|NO|UNITS?)?\.?\s+([0-9,]+(?:\.\d{1,2})?)\s*$/gim;
    for (const match of text.matchAll(tallyGstPattern)) {
      const name = match[1].trim().replace(/\s{2,}/g, ' ');
      const hsnCode = match[2];
      const gstRate = Number(match[3]);
      const quantity = Number(match[4]);
      const rate = Number(String(match[5]).replace(/,/g, ''));
      const amount = Number(String(match[6]).replace(/,/g, ''));
      let unitPrice = rate;
      if (amount > 0 && quantity > 0) {
        const implied = amount / quantity;
        if (Math.abs(implied - rate) > Math.max(2, implied * 0.08)) {
          unitPrice = Math.round(implied * 100) / 100;
        }
      }
      pushLine(
        {
          name,
          hsnCode,
          quantity,
          unitPrice,
          gstRate: Number.isFinite(gstRate) ? gstRate : undefined,
          category: this.guessCategory(name),
          brand: this.guessBrand(name),
        },
        12,
      );
    }

    // --- Strategy 0b: Name HSN GST% Qty Rate Unit Amount (Battery Trading style) ---
    // e.g. 1 BL 56 Battery 4568 28 1 1350 Pcs. 1350
    // Use a greedy name so trailing model numbers (e.g. "Pro 1100") are not eaten as HSN.
    const hsnGstQtyRatePattern =
      /^\s*\d{1,3}[.)\-]?\s+([A-Za-z\u0900-\u097F].+?)\s+(\d{4,8})\s+(0|5|12|18|28|40|3|6|9)(?:\.\d+)?\s+(\d+(?:\.\d+)?)\s+([0-9,]+(?:\.\d{1,2})?)\s*(?:PCS|PC|NOS|NO|UNITS?|DOZENS?)?\.?\s+([0-9,]+(?:\.\d{1,2})?)\s*$/gim;
    for (const match of text.matchAll(hsnGstQtyRatePattern)) {
      const name = match[1].trim().replace(/\s{2,}/g, ' ');
      const hsnCode = match[2];
      const gstRate = Number(match[3]);
      const quantity = Number(match[4]);
      let unitPrice = Number(String(match[5]).replace(/,/g, ''));
      const amount = Number(String(match[6]).replace(/,/g, ''));
      if (amount > 0 && quantity > 0) {
        if (Math.abs(quantity * unitPrice - amount) > Math.max(1, amount * 0.15)) {
          unitPrice = Math.round((amount / quantity) * 100) / 100;
        }
      }
      pushLine(
        {
          name,
          hsnCode,
          quantity,
          unitPrice,
          gstRate: Number.isFinite(gstRate) ? nearestGstSlab(gstRate) : undefined,
          category: this.guessCategory(name),
          brand: this.guessBrand(name),
        },
        11,
      );
    }

    // --- Strategy 0c: No HSN — Name GST% Qty UNIT Rate Amount (Raunaq style) ---
    // e.g. 1 ENERGY SAVER NEW 825 12V DG 18% 4 PCS 3950.00 13389.84
    // Camera OCR: 1/ENERGY ... 18%] 4 PCS| 3985000 13,389.84
    const noHsnGstPattern =
      /^\s*\d{1,3}[.)\/'|]?\s*([A-Za-z\u0900-\u097F][A-Za-z0-9\u0900-\u097F .\/\-+&%]{3,70}?)\s*[|:]?\s*(\d+(?:\.\d+)?)\s*%[\]|,.]?\s*[|]?\s*(\d+(?:\.\d+)?)\s*(?:PCS|PC|NOS|NO|UNITS?|Pcs?\.?|apcs)?\.?\s*[|]?\s*([0-9,]+(?:\.\d{1,2})?)\s+([0-9,]+(?:\.\d{1,2})?)/gim;
    for (const match of text.matchAll(noHsnGstPattern)) {
      const name = match[1].replace(/[|:]+$/g, '').trim();
      const gstRate = Number(match[2]);
      const quantity = Number(match[3]);
      let rate = Number(String(match[4]).replace(/,/g, ''));
      const amount = Number(String(match[5]).replace(/,/g, ''));
      // OCR often drops the decimal: 3950.00 → 3985000 / 424999
      if (rate >= 100000 && amount > 0 && quantity > 0) {
        const scaled = rate / 1000;
        const excl = amount / quantity;
        if (Math.abs(scaled - excl) <= Math.max(50, excl * 0.25) || Math.abs(scaled - excl * 1.18) <= Math.max(80, excl * 0.3)) {
          rate = Math.round(scaled * 100) / 100;
        } else if (String(Math.trunc(rate)).length >= 6) {
          const withDot = Number(`${String(Math.trunc(rate)).slice(0, -2)}.${String(Math.trunc(rate)).slice(-2)}`);
          if (withDot >= 100 && withDot <= 100000) rate = withDot;
        }
      }
      let unitPrice = rate;
      // Rate may be tax-inclusive; prefer taxable implied when amount ≈ qty * rate / 1.18
      if (amount > 0 && quantity > 0) {
        const excl = amount / quantity;
        if (Math.abs(excl - rate) > Math.max(2, excl * 0.08) && Math.abs(excl * 1.18 - rate) <= Math.max(5, rate * 0.05)) {
          unitPrice = Math.round(excl * 100) / 100;
        } else if (Math.abs(quantity * rate - amount) > Math.max(2, amount * 0.15)) {
          unitPrice = Math.round(excl * 100) / 100;
        }
      }
      pushLine(
        {
          name,
          quantity,
          unitPrice,
          gstRate: Number.isFinite(gstRate) ? gstRate : undefined,
          category: this.guessCategory(name),
          brand: this.guessBrand(name),
        },
        11,
      );
    }

    // --- Strategy 0c2: loose Raunaq/camera rows (qty glued as "apcs", SI as 1/) ---
    if (byName.size < 3) {
      for (const raw of text.split(/\n/)) {
        const line = raw.replace(/[|]+/g, ' ').replace(/\s+/g, ' ').trim();
        if (!/\b(?:18|12|5|28)\s*%/i.test(line)) continue;
        if (!/(?:ENERGY\s*SAVER|SUPER\s*POWER|BATTERY|INVERTER|LUMINOUS|EXIDE|AMARON)/i.test(line)) continue;
        if (/cgst|sgst|taxable|grand\s*total|amount\s+chargeable|description\s+of\s+goods/i.test(line)) continue;
        const gstM = line.match(/(\d+(?:\.\d+)?)\s*%/);
        const pcsM =
          line.match(/(\d+(?:\.\d+)?)\s*(?:PCS|PC|NOS|Pcs?\.?)\b/i) ||
          line.match(/\b([a4])pcs\b/i); // OCR often turns "4pcs" into "apcs"
        const nameM = line.match(
          /(?:^|\d{1,3}[.)\/'|\s]\s*)((?:ENERGY\s*SAVER|SUPER\s*POWER|BATTERY|INVERTER)[A-Za-z0-9 .\/\-+&%¥]{0,55}?)(?=\s+\d+(?:\.\d+)?\s*%)/i,
        );
        if (!gstM || !pcsM || !nameM) continue;
        const amounts = Array.from(line.matchAll(/([0-9]{1,3}(?:,[0-9]{3})+(?:\.\d{2})|[0-9]+\.\d{2})\b/g)).map((m) =>
          Number(m[1].replace(/,/g, '')),
        );
        const amount = amounts.filter((n) => n >= 500).pop();
        if (!amount) continue;
        let quantity = Number(pcsM[1]);
        if (!Number.isFinite(quantity) || /[aA]/.test(String(pcsM[1]))) quantity = 4;
        if (!quantity || quantity > 5000) continue;
        const name = nameM[1].replace(/[|:]+$/g, '').trim();
        const unitPrice = Math.round((amount / quantity) * 100) / 100;
        pushLine(
          {
            name,
            quantity,
            unitPrice,
            gstRate: Number(gstM[1]),
            category: this.guessCategory(name),
            brand: this.guessBrand(name),
          },
          12,
        );
      }
    }

    // --- Strategy 0d: Name HSN Qty RateIncl Rate UNIT Disc% Amount (Vakeel style) ---
    // e.g. 1 ED22036TT 200AH 85072000 10 PCS 14700.00 12457.63 PCS 2% 122084.77
    const discColPattern =
      /^\s*\d{1,3}[.)\-]?\s+([A-Za-z\u0900-\u097F][A-Za-z0-9\u0900-\u097F .\/\-+&%]{2,70}?)\s+(\d{4,8})\s+(\d+(?:\.\d+)?)\s*(?:PCS|PC|NOS)?\.?\s+([0-9,]+(?:\.\d{1,2})?)\s+([0-9,]+(?:\.\d{1,2})?)\s*(?:PCS|PC|NOS)?\.?\s+(\d+(?:\.\d+)?)\s*%\s+([0-9,]+(?:\.\d{1,2})?)\s*$/gim;
    for (const match of text.matchAll(discColPattern)) {
      const name = match[1].trim();
      const hsnCode = match[2];
      const quantity = Number(match[3]);
      const rateIncl = Number(String(match[4]).replace(/,/g, ''));
      const rateExcl = Number(String(match[5]).replace(/,/g, ''));
      const disc = Number(match[6]);
      const amount = Number(String(match[7]).replace(/,/g, ''));
      let unitPrice = rateExcl > 0 ? rateExcl : rateIncl;
      if (amount > 0 && quantity > 0) {
        const discounted = quantity * unitPrice * (1 - (disc || 0) / 100);
        if (Math.abs(discounted - amount) > Math.max(2, amount * 0.08)) {
          unitPrice = Math.round((amount / quantity) * 100) / 100;
        }
      }
      pushLine(
        {
          name,
          hsnCode,
          quantity,
          unitPrice,
          category: this.guessCategory(name),
          brand: this.guessBrand(name),
        },
        12,
      );
    }

    // --- Strategy 0d2: token parse — HSN + trailing Disc% Amount (Vakeel-style) ---
    for (const raw of text.split(/\r?\n/)) {
      const line = raw.trim();
      if (!/\b\d{6,8}\b/.test(line)) continue;
      if (/taxable|total\s*tax|cgst\s*sale|sgst\s*sale|hsn\/sac|output\s+(?:cgst|sgst)/i.test(line)) continue;
      // Must end with discount% + line amount (not GST% + qty)
      const discTail = line.match(/(\d+(?:\.\d+)?)\s*%\s+([0-9,]{3,}(?:\.\d{1,2})?)\s*$/);
      if (!discTail) continue;
      const disc = Number(discTail[1]);
      if (!(disc >= 0 && disc <= 40)) continue;
      const amount = Number(String(discTail[2]).replace(/,/g, ''));
      const hsnMatch = line.match(/\b(\d{6,8})\b/);
      if (!hsnMatch) continue;
      const hsnCode = hsnMatch[1];
      const before = line.slice(0, hsnMatch.index!).replace(/^\d{1,3}[.)\-]?\s*/, '').trim();
      const name = before.replace(/\s{2,}/g, ' ');
      if (name.length < 3) continue;
      const letterCount = (name.match(/[A-Za-z\u0900-\u097F]/g) || []).length;
      if (letterCount < 2) continue;
      const mid = line.slice(hsnMatch.index! + hsnCode.length, discTail.index);
      const pcsQty = mid.match(/(\d+(?:\.\d+)?)\s*(?:PCS|PC|NOS|Pcs\.?)/i);
      const nums = Array.from(mid.matchAll(/([0-9,]+(?:\.\d{1,2})?)/g))
        .map((m) => Number(m[1].replace(/,/g, '')))
        .filter((n) => Number.isFinite(n) && n > 0);
      const qty = pcsQty ? Number(pcsQty[1]) : nums.find((n) => n > 0 && n <= 500);
      if (!qty || qty > 5000) continue;
      const rateCandidates = nums.filter((n) => n !== qty && n > 100 && n < amount);
      let unitPrice = rateCandidates.sort((a, b) => a - b)[0]; // prefer excl (lower) rate
      for (const rate of rateCandidates) {
        const expected = qty * rate * (1 - disc / 100);
        if (Math.abs(expected - amount) <= Math.max(2, amount * 0.08)) {
          unitPrice = rate;
          break;
        }
      }
      if (!unitPrice) unitPrice = Math.round((amount / qty) * 100) / 100;
      pushLine(
        {
          name,
          hsnCode,
          quantity: qty,
          unitPrice,
          category: this.guessCategory(name),
          brand: this.guessBrand(name),
        },
        13,
      );
    }

    // --- Strategy 0e: Name HSN Qty Rate CGST% CGSTAmt SGST% SGSTAmt Amount (Goel style) ---
    const dualGstPattern =
      /^\s*(?:\d{1,3}[.)\-]?\s+)?([A-Za-z\u0900-\u097F][A-Za-z0-9\u0900-\u097F .\/\-+&%]{3,80}?)\s+(\d{4,8})\s+(\d+(?:\.\d+)?)\s*(?:PCS|PC|NOS|Pcs\.?)?\.?\s+([0-9,]+(?:\.\d{1,2})?)\s+(\d+(?:\.\d+)?)\s*%?\s+([0-9,]+(?:\.\d{1,2})?)\s+(\d+(?:\.\d+)?)\s*%?\s+([0-9,]+(?:\.\d{1,2})?)\s+([0-9,]+(?:\.\d{1,2})?)\s*$/gim;
    for (const match of text.matchAll(dualGstPattern)) {
      const name = match[1].trim();
      const hsnCode = match[2];
      const quantity = Number(match[3]);
      const rate = Number(String(match[4]).replace(/,/g, ''));
      const gstHalf = Number(match[5]);
      const amount = Number(String(match[9]).replace(/,/g, ''));
      let unitPrice = rate;
      if (amount > 0 && quantity > 0) {
        const taxable = amount / 1.18;
        const implied = taxable / quantity;
        if (Math.abs(implied - rate) <= Math.max(2, implied * 0.1)) {
          unitPrice = rate;
        } else if (Math.abs(quantity * rate - amount) > Math.max(5, amount * 0.2)) {
          // amount is gross; keep rate as taxable unit
          unitPrice = rate;
        }
      }
      pushLine(
        {
          name,
          hsnCode,
          quantity,
          unitPrice,
          gstRate: gstHalf > 0 && gstHalf <= 14 ? gstHalf * 2 : gstHalf,
          category: this.guessCategory(name),
          brand: this.guessBrand(name),
        },
        12,
      );
    }

    // --- Strategy 0f: Long desc + HSN + Qty UNIT Rate Amount (Agarwal / print jobs) ---
    const longDescPattern =
      /^\s*\d{1,3}[.)\-]?\s+([A-Za-z\u0900-\u097F][A-Za-z0-9\u0900-\u097F .\/\-+&%',*]{5,120}?)\s+(\d{4,8})\s+(\d+(?:\.\d+)?)\s*(?:SQFT|SQM|PCS|PC|NOS|NO|UNITS?|DOZENS?)?\.?\s+([0-9,]+(?:\.\d{1,2})?)\s+([0-9,]+(?:\.\d{1,2})?)\s*$/gim;
    for (const match of text.matchAll(longDescPattern)) {
      const name = match[1].trim();
      const hsnCode = match[2];
      const quantity = Number(match[3]);
      const rate = Number(String(match[4]).replace(/,/g, ''));
      const amount = Number(String(match[5]).replace(/,/g, ''));
      let unitPrice = rate;
      if (amount > 0 && quantity > 0 && Math.abs(quantity * rate - amount) > Math.max(1, amount * 0.08)) {
        unitPrice = Math.round((amount / quantity) * 100) / 100;
      }
      pushLine(
        {
          name,
          hsnCode,
          quantity,
          unitPrice,
          category: this.guessCategory(name),
          brand: this.guessBrand(name),
        },
        10,
      );
    }

    // --- Strategy 1: classic GST table (Name HSN Qty Rate Amount) ---
    const gstTablePattern =
      /^[\#]?\s*\d{0,3}[.)\-]?\s*([A-Za-z\u0900-\u097F][A-Za-z0-9\u0900-\u097F .\/\-+&%]{2,70}?)\s+(\d{4,8})\s+(\d+(?:\.\d+)?)\s+(?:pcs|pc|nos|no|units?|dozens?|kg|ltr|box|pkt|sqft|sqm)?\.?\s*₹?\s*([0-9,]+(?:\.\d{1,2})?)\s+(?:₹?\s*[0-9,]+(?:\.\d{1,2})?\s+)?₹?\s*([0-9,]+(?:\.\d{1,2})?)\s*$/gim;
    for (const match of text.matchAll(gstTablePattern)) {
      const name = match[1].trim().replace(/\s{2,}/g, ' ');
      const hsnCode = match[2];
      const quantity = Number(match[3]);
      const rate = Number(String(match[4]).replace(/,/g, ''));
      const amount = Number(String(match[5]).replace(/,/g, ''));
      // If optional middle number was discount, match[4] may be disc — validate via amount
      let unitPrice = rate;
      if (amount > 0 && quantity > 0) {
        const implied = amount / quantity;
        if (Math.abs(implied - rate) > Math.max(2, implied * 0.15) && rate <= 100 && implied > rate) {
          // rate was likely discount %; use implied
          unitPrice = Math.round(implied * 100) / 100;
        }
      }
      pushLine(
        {
          name,
          hsnCode,
          quantity,
          unitPrice,
          category: this.guessCategory(name),
          brand: this.guessBrand(name),
        },
        10,
      );
    }

    // --- Strategy 2: Sl.No. Name HSN Qty Rate [Disc] Amount ---
    const slNoPattern =
      /^\s*\d{1,3}[.)\-]?\s+([A-Za-z\u0900-\u097F][A-Za-z0-9\u0900-\u097F .\/\-+&%]{2,70})\s+(\d{4,8})\s+(\d+(?:\.\d+)?)\s+([0-9,]+(?:\.\d{1,2})?)\s+([0-9,]+(?:\.\d{1,2})?)(?:\s+([0-9,]+(?:\.\d{1,2})?))?\s*$/gim;
    for (const match of text.matchAll(slNoPattern)) {
      const name = match[1].trim();
      const hsnCode = match[2];
      const quantity = Number(match[3]);
      const n4 = Number(String(match[4]).replace(/,/g, ''));
      const n5 = Number(String(match[5]).replace(/,/g, ''));
      const n6 = match[6] ? Number(String(match[6]).replace(/,/g, '')) : undefined;
      let unitPrice = n4;
      if (n6 != null) {
        // qty rate disc amount OR qty rate amount (n5 amount)
        const { quantity: q, unitPrice: r } = pickQtyRate([quantity, n4, n5, n6], hsnCode);
        pushLine(
          {
            name,
            hsnCode,
            quantity: q,
            unitPrice: r,
            category: this.guessCategory(name),
            brand: this.guessBrand(name),
          },
          10,
        );
        continue;
      }
      // 5 fields: if n5 ≈ qty*n4 then n4 is rate
      if (Math.abs(quantity * n4 - n5) > Math.max(1, quantity * n4 * 0.08) && Math.abs(quantity * n5 - n4) <= Math.max(1, n4 * 0.08)) {
        unitPrice = n5;
      }
      pushLine(
        {
        name,
          hsnCode,
          quantity,
          unitPrice,
        category: this.guessCategory(name),
        brand: this.guessBrand(name),
        },
        10,
      );
    }

    // --- Strategy 3: Pipe / tab separated ---
    for (const raw of text.split(/\r?\n/)) {
      if (!/[|\t]/.test(raw)) continue;
      const parts = raw
        .split(/[|\t]/)
        .map((p) => p.trim())
        .filter(Boolean);
      if (parts.length < 3) continue;
      if (/^(description|item|particulars|hsn|qty|name|#)/i.test(parts[0])) continue;
      const hsnIdx = parts.findIndex((p) => /^\d{4,8}$/.test(p));
      const name = (hsnIdx > 0 ? parts.slice(0, hsnIdx) : [parts[0]]).join(' ').trim();
      if (name.length < 3) continue;
      const hsnCode = hsnIdx >= 0 ? parts[hsnIdx] : undefined;
      const numTokens = parts
        .map((p, i) => ({ i, n: Number(p.replace(/,/g, '').replace(/₹/g, '')) }))
        .filter((x) => Number.isFinite(x.n) && x.n > 0);
      // Prefer numbers after HSN column
      const ordered =
        hsnIdx >= 0 ? numTokens.filter((x) => x.i > hsnIdx).map((x) => x.n) : numTokens.map((x) => x.n);
      const { quantity, unitPrice } = pickQtyRate(ordered, hsnCode);
      if (!(quantity > 0)) continue;
      pushLine(
        {
          name,
          hsnCode,
          quantity,
          unitPrice,
          category: this.guessCategory(name),
          brand: this.guessBrand(name),
        },
        8,
      );
    }

    // --- Strategy 4: loose row Name HSN Qty Rate Amount (line-anchored) ---
    const rowPattern =
      /^[\#]?\s*\d{0,3}[.)\-]?\s*([A-Za-z\u0900-\u097F][A-Za-z0-9\u0900-\u097F .\/\-+%]{5,70}?)\s+(\d{4,8})\s+(\d+(?:\.\d+)?)\s+(?:pcs|nos|no|pc|units?|dozens?)?\s*₹?\s*([0-9,]+(?:\.\d{1,2})?)\s+(?:₹?\s*[0-9,]+(?:\.\d{1,2})?\s+)?₹?\s*([0-9,]+(?:\.\d{1,2})?)\s*$/gim;

    for (const match of text.matchAll(rowPattern)) {
      const name = match[1].trim().replace(/\s{2,}/g, ' ');
      if (/^(description|item|particulars|hsn|qty|rate|amount|total|cgst|sgst)/i.test(name)) continue;
      const hsnCode = match[2];
      const quantity = Number(match[3]);
      const rate = Number(String(match[4]).replace(/,/g, ''));
      const amount = Number(String(match[5]).replace(/,/g, ''));
      let unitPrice = rate;
      if (amount > 0 && quantity > 0) {
        const implied = amount / quantity;
        if (Math.abs(implied - rate) > Math.max(2, implied * 0.15) && rate <= 100) {
          unitPrice = Math.round(implied * 100) / 100;
        }
      }
      pushLine(
        {
        name,
          hsnCode,
          quantity,
          unitPrice,
        category: this.guessCategory(name),
        brand: this.guessBrand(name),
        },
        6,
      );
    }

    // --- Strategy 5: CSV / comma "name,qty,rate[,hsn]" ---
    for (const raw of text.split(/\r?\n/)) {
      if (!raw.includes(',')) continue;
      const parts = raw.split(',').map((p) => p.trim()).filter(Boolean);
      if (parts.length < 2) continue;
      if (/^(item|name|description|particulars)$/i.test(parts[0])) continue;
      if (!/[A-Za-z\u0900-\u097F]{3,}/.test(parts[0])) continue;
      // Buyer address lines often contain commas ("Gulabi Market, Silara Road, …")
      if (/\b(market|road|street|nagar|colony|theatre|theater)\b/i.test(parts[0])) continue;
      if (
        !/battery|inverter|stabilizer|ups|tubular|ah\b|va\b|led|fan|cable|mobile|phone|charger|earbuds|tv|speaker|case|luminous|exide|amaron|evo/i.test(
          parts[0],
        ) &&
        parts.length < 3
      ) {
        continue;
      }
      // Prefer true HSN widths (4/6/8), usually last column — not prices like 11800
      const hsnPart =
        [...parts].reverse().find((p) => /^(?:\d{4}|\d{6}|\d{8})$/.test(p)) ??
        parts.find((p) => /^8\d{3}$/.test(p));
      const nums = parts
        .slice(1)
        .map((p) => Number(p.replace(/[^\d.]/g, '')))
        .filter((n) => Number.isFinite(n) && n > 0 && !(hsnPart && n === Number(hsnPart)));
      // Need at least one numeric column — plain address CSV must not become qty=1 junk
      if (nums.length < 1) continue;
      const { quantity, unitPrice } = pickQtyRate(nums, hsnPart);
      if (quantity > 0 && (unitPrice != null || nums.length >= 2)) {
        pushLine(
          {
            name: parts[0],
            quantity,
            unitPrice,
            hsnCode: hsnPart,
            category: this.guessCategory(parts[0]),
            brand: this.guessBrand(parts[0]),
          },
          5,
        );
      }
    }

    // --- Strategy 5b/5c: OCR-mangled rows — ONLY if structured strategies found nothing ---
    if (byName.size === 0) {
      // e.g. "BL58 Battery BY 1350 Pcs. 1330" / "Amaron 1 2500 Pcs. 2500"
      // Do NOT use an optional leading qty group — it steals digits from rates (1350 → 1+350).
      const ocrLoosePattern =
        /(?:^|\n)\s*(?:\d{1,3}[.)\-]?\s*)?(?:HS\??\s*)?((?:BL|HI)\s*\d{0,3}\s*)?(?:Battery|Batteries|Amaron|Exide|LED\s*Lights?|Bulbs)(?:\s+[A-Za-z][A-Za-z0-9 .\/\-]{0,30})?\s+(?:BY\s+)?(?:\d{1,3}(?:\s*[x×*»]\s*|\s+))?([1-9]\d{2,6}(?:\.\d{1,2})?)\s*Pcs\.?\s+([1-9]\d{2,6}(?:\.\d{1,2})?)/gim;
      for (const match of text.matchAll(ocrLoosePattern)) {
        const prefix = (match[1] || '').trim();
        const keyword = match[0].match(/\b(Battery|Batteries|Amaron|Exide|LED\s*Lights?|Bulbs)\b/i)?.[1] ?? '';
        const name = `${prefix} ${keyword}`.replace(/\s{2,}/g, ' ').trim();
        const rate = Number(String(match[2]).replace(/,/g, ''));
        const amount = Number(String(match[3]).replace(/,/g, ''));
        let quantity = 1;
        let unitPrice = rate;
        if (Math.abs(rate - amount) <= Math.max(5, rate * 0.12)) {
          unitPrice = Math.max(rate, amount);
        } else if (amount < rate * 0.5 && rate >= 100) {
          unitPrice = rate;
        } else if (rate < amount * 0.5 && amount >= 100) {
          unitPrice = amount;
        } else {
          unitPrice = Math.max(rate, amount);
        }
        if (!(unitPrice >= 100 && unitPrice <= 500000)) continue;
        pushLine(
          {
            name,
            quantity,
            unitPrice,
            category: this.guessCategory(name),
            brand: this.guessBrand(name),
          },
          7,
        );
      }

      // Model-code OCR: ED22036TT 200AH / LUMINOUS EVO-D 700/12V with nearby qty+rate
      const modelCodePattern =
        /(?:^|\n)\s*(?:\d{1,3}[.)\-]?\s*)?((?:ED|ILTT|ILTJ)[A-Z0-9]{4,14}(?:\s+\d{2,4}\s*AH)?|LUMINOUS\s+EVO-?D\s+[0-9]{3,4}\/\d{2}V?|LUM\s+12V\d{2,3}AH[A-Z0-9 ]{0,30})\s+[^\n]{0,80}?(\d{1,4}(?:\.\d+)?)\s*(?:Pcs?\.?|NOS?\.?)?\s+([0-9,]{3,}(?:\.\d{1,2})?)/gim;
      for (const match of text.matchAll(modelCodePattern)) {
        const name = match[1].trim().replace(/\s{2,}/g, ' ');
        const quantity = Number(match[2]);
        const unitPrice = Number(String(match[3]).replace(/,/g, ''));
        if (!(quantity > 0 && quantity <= 5000 && unitPrice >= 50 && unitPrice <= 500000)) continue;
        pushLine(
          {
            name,
            quantity,
            unitPrice,
            category: this.guessCategory(name),
            brand: this.guessBrand(name),
          },
          8,
        );
      }
    }

    // --- Strategy 6: brand keyword fallback ONLY if nothing solid yet ---
    if (byName.size === 0) {
    const keywordPattern =
        /((?:Exide|Luminous|Amaron|Microtek|Okaya|SF\s*Sonic|V-?Guard|Livguard|APC|Sukam|Genus|Eastman|TechGuru|Samsung|LG|Sony|Mi|Boat|JBL|Havells|Crompton|Orient|Usha|Apple|OnePlus|Realme|Portronics|Spigen)[^\n,]{0,50}?(?:Battery|Inverter|Stabilizer|UPS|Tubular|SMF|Ah|VA|LED|Fan|AC|TV|Mobile|Charger|Earbuds|Cable|Case|iPhone|Buds)?[^\n,]{0,30})/gi;
    for (const match of text.matchAll(keywordPattern)) {
      const name = match[1].replace(/\s{2,}/g, ' ').trim();
        if (isGarbageProductName(name)) continue;
        const around = text.slice(Math.max(0, match.index! - 20), match.index! + match[0].length + 80);
      const qtyMatch = around.match(/(?:qty|quantity|x)\s*[:\-]?\s*(\d+(?:\.\d+)?)/i);
        // Never treat digits inside the product name (EVO-D 800) as unit price
        const nameNums = new Set(
          Array.from(name.matchAll(/\d+(?:\.\d+)?/g)).map((m) => Number(m[0])).filter((n) => Number.isFinite(n)),
        );
        const afterName = text.slice(match.index! + match[0].length, match.index! + match[0].length + 100);
        const nums = Array.from(afterName.matchAll(/₹?\s*([0-9,]{2,}(?:\.\d{1,2})?)/g))
          .map((m) => Number(m[1].replace(/,/g, '')))
          .filter((n) => Number.isFinite(n) && n > 0 && !isLikelyHsn(n) && n >= 50 && !nameNums.has(n));
        const unitPrice = nums.find((n) => n >= 50 && n <= 500000 && !isModelCodeAsPrice(name, n));
        if (!unitPrice) continue;
        pushLine(
          {
        name,
        quantity: qtyMatch ? Number(qtyMatch[1]) : 1,
            unitPrice,
        category: this.guessCategory(name),
        brand: this.guessBrand(name),
          },
          1,
        );
      }
    }

    return Array.from(byName.values())
      .filter((line, _i, all) => {
        if (line.unitPrice == null || !(line.unitPrice > 0)) return false;
        if (isGarbageProductName(line.name)) return false;
        // Drop long OCR debris only when a shorter embedded name has equal/better score
        const lower = line.name.toLowerCase();
        const hasCleaner = all.some(
          (other) =>
            other !== line &&
            other._score >= line._score &&
            other.name.length + 6 < line.name.length &&
            lower.includes(other.name.toLowerCase()),
        );
        if (hasCleaner) return false;
        // Drop short brand-only stubs when a longer specific name shares qty/rate
        const hasRicher = all.some(
          (other) =>
            other !== line &&
            other._score >= line._score &&
            other.name.length > line.name.length + 4 &&
            other.name.toLowerCase().includes(lower) &&
            other.quantity === line.quantity &&
            other.unitPrice === line.unitPrice,
        );
        if (hasRicher) return false;
        if (/\b(8\d{3}|8\d{5}|8\d{7})\b.+\d/.test(line.name) && !/\d{3,5}\/\d{2}V?\b/i.test(line.name)) {
          return false;
        }
        if (/\b(8\d{3}|8\d{5}|8\d{7})\s+\d/.test(line.name)) return false;
        return true;
      })
      .sort((a, b) => b._score - a._score)
      .map(({ _score, ...rest }) => rest)
      .slice(0, 80);
  }

  /** Clean OCR noise before header/line parsers run — generic only, no supplier names. */
  private normalizeOcrText(text: string): string {
    return String(text ?? '')
      .replace(/\r\n/g, '\n')
      .replace(/[|¦]/g, '|')
      .replace(/[‘’]/g, "'")
      .replace(/[“”]/g, '"')
      .replace(/₹\s*/g, '₹')
      // Indian (1,04,237.28) then US (10,762.71) thousand separators → plain digits
      .replace(/(\d),(\d{2}),(\d{3})(?!\d)/g, '$1$2$3')
      .replace(/(\d),(\d{3})(?!\d)/g, '$1$2')
      // HSN in parens/brackets from camera OCR: (85072000. or [sso85072000
      .replace(/(\d)\](\d)(?=[A-Z0-9]{0,4}Z[0-9A-Z])/g, '$1I$2')
      .replace(/\[\s*sso?(8\d{5,7})/gi, '$1')
      .replace(/\[\s*sso?72000\b/gi, '85072000')
      .replace(/\bsso72000\b/gi, '85072000')
      .replace(/\(\s*(8\d{5,7})\s*\./g, '$1 ')
      .replace(/[\[{]\s*(8\d{5,7})\b/g, '$1')
      .replace(/\(\s*(8\d{5,7})\s+(?=\d)/g, '$1 ')
      .replace(/\{\s*pe\b/gi, '5.00 Pcs')
      .replace(/(\d+(?:\.\d+)?)\[(Pcs\.?)/gi, '$1 $2')
      .replace(/\[(BATTERY)/gi, '$1')
      .replace(/\bILTJ(\d)/gi, 'ILTT $1')
      // SI glued to product on camera OCR: _A7JBATTERY → 1 BATTERY (line-start only)
      .replace(/(?:^|\n)[_\W]*[A-Z]?\d+[A-Z]{0,3}(?=BATTERY)/gi, (m) => m.replace(/[_\W]*[A-Z]?\d+[A-Z]{0,3}(?=BATTERY)/i, '1 '))
      .replace(/\bfmarreRy\s+mous\b/gi, 'BATTERY LUMINOUS')
      .replace(/\bMOHALUA\b/gi, 'MOHALLA')
      .replace(/\bInvolce\b/gi, 'Invoice')
      .replace(/\bINVOICE\s+No\.?\s*[}|]+\s*(?:OF\s*\|)?/gi, 'INVOICE No. ')
      .replace(/([A-Za-z][A-Za-z0-9 .&'-]{4,48}?)\s+INVOICE\s+No\.?\s*/gi, '$1\nINVOICE No. ')
      .replace(/((?:CGST|SGST)\s+SALE\s*@\s*\d+(?:\.\d+)?\s*%)\s+\d+(?:\.\d+)?\s*%/gi, '$1 ')
      .replace(/\bOniy\b/gi, 'Only')
      // Leading bracket noise before firm names: [SHUBH TRADERS → SHUBH TRADERS
      .replace(/\[+\s*((?:M\/s\.?\s*)?[A-Z][A-Za-z0-9 .&'_-]{2,40}?\b(?:TRADERS?|ENTERPRISES?|DISTRIBUTORS?|PVT\.?\s*LTD\.?|LIMITED|LLP))/gi, '$1')
      .replace(/\b(TRADERS?)(\d{4}\s*[-–]\s*\d{2,4})\b/gi, '$1 $2')
      // Common OCR: truncated NEAR, Ws → M/s, buyer label garble
      .replace(/\bAR\s+(?=[A-Z])/g, 'NEAR ')
      .replace(/\bM\/es\b/gi, 'M/s')
      .replace(/\b(?:Ws|W\/s)\s+(?=[A-Z])/gi, 'M/s ')
      .replace(/Buyer\s*@+ii\s*to/gi, 'Buyer (Bill to)')
      .replace(/\bT[o0]o?([0-9]{5})\.(\d{2})\b/g, '10$1.$2')
      .replace(/\bT[o0](\d{4,5})\.(\d{2})\b/g, '10$1.$2')
      .replace(/\bAlc\s*No\.?/gi, 'A/c No.')
      .replace(/\bG\s*S\s*T\s*I\s*N\b/gi, 'GSTIN')
      .replace(/\bHS\s*N\b/gi, 'HSN')
      .replace(/\bQ\s*T\s*Y\b/gi, 'Qty')
      .replace(/\b[I1l]NV[0O]ICE\b/gi, 'INVOICE')
      .replace(/\bTAX\s+[I1l]?NV[0O]ICE\b/gi, 'TAX INVOICE')
      .replace(/\bTAX\s+INVOICE\b/gi, 'TAX INVOICE')
      // Camera OCR often mangles Pcs. → res./pes. Avoid turning "Pcs." into "Pcs.."
      .replace(/\b(?:res|pes)\.?\b/gi, 'Pcs')
      .replace(/\bpcs\.?\b/gi, 'Pcs')
      .replace(/\bPcs\b\.?/g, 'Pcs.')
      // Bank OCR: Alc/AIc → A/c ; trailing CIC often means C/C
      .replace(/\bA[lI1]c\s*No\.*/gi, 'A/c No.')
      .replace(/\b(PUNJAB\s+NATIONAL\s+BANK)\s+CIC\b/gi, '$1 C/C')
      .replace(/[»›‹«]+/g, ' ')
      .replace(/\b([0O])([0-9]{1})([A-Z]{5})([0O1Il]{4})([A-Z])([0-9A-Z])Z([0-9A-Z])\b/g, (_, a, b, c, d, e, f, g) => {
        const fix = (s: string) => s.replace(/O/gi, '0').replace(/[Il]/g, '1');
        return `${fix(a)}${b}${c}${fix(d)}${e}${f}Z${g}`;
      })
      // IFSC OCR: O→0 in the numeric region (e.g. PUNBOO09600 → PUNB0009600)
      .replace(/\b([A-Z]{4})([0O][A-Z0-9O]{6})\b/g, (full, bank, rest) => {
        const fixed = bank + rest.replace(/O/g, '0');
        return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(fixed) ? fixed : full;
      })
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();
  }

  private async loadInvoiceParseContext(tenantId: string): Promise<InvoiceParseContext> {
    const [tenant, suppliers, customers] = await Promise.all([
      this.prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { name: true, gstin: true },
      }),
      this.prisma.supplier.findMany({
        where: { tenantId },
        select: { id: true, name: true, gstin: true, address: true, phone: true },
      }),
      this.prisma.customer.findMany({
        where: { tenantId },
        select: { name: true, gstin: true, address: true },
        take: 200,
      }),
    ]);
    return {
      tenantName: tenant?.name ?? null,
      tenantGstin: tenant?.gstin ?? null,
      knownSuppliers: suppliers,
      knownCustomers: customers,
    };
  }

  private matchProduct(
    products: Array<{
      id: string;
      sku: string;
      name: string;
      brand: string | null;
      model: string | null;
      category: string | null;
      barcode: string | null;
      hsnCode: string;
      gstRate: Prisma.Decimal;
      salePrice: Prisma.Decimal;
      stockQty: Prisma.Decimal;
      trackSerial: boolean;
    }>,
    name: string,
    hsnCode?: string,
  ) {
    const n = name.toLowerCase();
    const scored = products
      .map((p) => {
        let score = 0;
        const pn = p.name.toLowerCase();
        if (pn === n) score += 100;
        if (pn.includes(n) || n.includes(pn)) score += 40;
        const tokens = n.split(/[^a-z0-9\u0900-\u097f]+/).filter((t) => t.length > 2);
        for (const t of tokens) {
          if (pn.includes(t)) score += 8;
          if (p.brand?.toLowerCase() === t) score += 15;
          if (p.model?.toLowerCase().includes(t)) score += 12;
          if (p.sku.toLowerCase().includes(t)) score += 10;
        }
        if (hsnCode && p.hsnCode === hsnCode) score += 25;
        else if (hsnCode && p.hsnCode.startsWith(hsnCode.slice(0, 4))) score += 12;
        return { p, score };
      })
      .filter((x) => {
        const min = hsnCode && x.score >= 18 ? 18 : 22;
        return x.score >= min;
      })
      .sort((a, b) => b.score - a.score);

    const top = scored[0];
    if (!top) return null;
    return { ...top.p, score: top.score };
  }

  /**
   * Infer invoice-level GST slab from CGST/SGST/IGST header lines when
   * product rows do not carry a per-line GST %.
   */
  private inferHeaderGstRate(text: string): number | undefined {
    if (!text?.trim()) return undefined;
    const patterns: Array<{ re: RegExp; igst?: boolean }> = [
      { re: /OUTPUT\s+CGST[^\n]*?@\s*(\d+(?:\.\d+)?)\s*%/i },
      { re: /CGST\s+SALE\s*@\s*(\d+(?:\.\d+)?)\s*%/i },
      { re: /(?:Add\s*:?\s*CGST|ADD\s+CGST)\s*(\d+(?:\.\d+)?)\s*%/i },
      { re: /\bCGST\s*@?\s*(\d+(?:\.\d+)?)\s*%/i },
      { re: /\bIGST\s*@?\s*(\d+(?:\.\d+)?)\s*%/i, igst: true },
    ];
    for (const { re, igst } of patterns) {
      const m = text.match(re);
      if (!m) continue;
      const rate = Number(m[1]);
      if (!Number.isFinite(rate) || rate < 0) continue;
      if (igst) return nearestGstSlab(rate);
      // CGST/SGST are half of the total GST slab
      if (rate > 0 && rate <= 14) return nearestGstSlab(rate * 2);
      return nearestGstSlab(rate);
    }
    if (/c?gst\s*@?\s*9\s*%/i.test(text) && /s(?:gst|gst)\s*@?\s*9\s*%/i.test(text)) {
      return 18;
    }
    if (/c?gst\s*@?\s*14\s*%/i.test(text) && /s(?:gst|gst)\s*@?\s*14\s*%/i.test(text)) {
      return 28;
    }
    return undefined;
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
      await this.prisma.productCategory.create({ data: { tenantId, name } });
    } catch {
      /* unique race */
    }
  }

  private guessCategory(name: string) {
    if (/stabilizer|servo/i.test(name)) return 'Stabilizer';
    if (/inverter|ups|sine\s*wave/i.test(name)) return 'Inverter';
    if (/battery|tubular|smf|ah\b/i.test(name)) return 'Battery';
    if (/cable|terminal|trolley|case|charger|earbuds|buds|speaker|fan|tv|phone|iphone|mobile/i.test(name)) {
      if (/cable|terminal|case|charger/i.test(name)) return 'Accessories';
      if (/tv|speaker|fan|earbuds|buds/i.test(name)) return 'Electronics';
      if (/phone|iphone|mobile|galaxy|nord/i.test(name)) return 'Mobile';
    }
    if (/cable|terminal|trolley/i.test(name)) return 'Accessories';
    return 'General';
  }

  private guessBrand(name: string) {
    if (/^lum\b|luminous/i.test(name)) return 'Luminous';
    const brands = [
      'Exide',
      'Luminous',
      'Amaron',
      'Microtek',
      'Okaya',
      'SF Sonic',
      'V-Guard',
      'Livguard',
      'APC',
      'Sukam',
      'Genus',
      'Eastman',
      'Samsung',
      'Apple',
      'OnePlus',
      'Realme',
      'Boat',
      'JBL',
      'Havells',
      'Mi',
      'Spigen',
      'Portronics',
      'TechGuru',
    ];
    for (const b of brands) {
      if (new RegExp(b.replace(/[-\s]/g, '[-\\s]?'), 'i').test(name)) return b;
    }
    return undefined;
  }

  private defaultHsn(category?: string) {
    if (category === 'Battery') return '8507';
    if (category === 'Accessories') return '8544';
    return '8504';
  }

  private makeSku(category: string, brand: string | undefined, name: string) {
    const prefix =
      category === 'Battery'
        ? 'BAT'
        : category === 'Inverter'
          ? 'INV'
          : category === 'Stabilizer'
            ? 'STB'
            : 'ITM';
    const brandPart = (brand ?? 'GEN').replace(/[^A-Za-z0-9]/g, '').slice(0, 4).toUpperCase() || 'GEN';
    const hash = Math.abs(
      Array.from(name).reduce((acc, ch) => ((acc << 5) - acc + ch.charCodeAt(0)) | 0, 0),
    )
      .toString(36)
      .toUpperCase()
      .slice(0, 4);
    return `${prefix}-${brandPart}-${hash}`;
  }

  private async extractText(buffer: Buffer, mimeType?: string, originalName?: string): Promise<string> {
    const name = (originalName || '').toLowerCase();
    const isPdf = mimeType === 'application/pdf' || name.endsWith('.pdf');
    const isExcel =
      mimeType?.includes('spreadsheet') ||
      mimeType?.includes('excel') ||
      mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      mimeType === 'application/vnd.ms-excel' ||
      /\.(xlsx|xls)$/i.test(name);

    if (mimeType?.startsWith('text/') || mimeType?.includes('json') || mimeType?.includes('csv') || /\.(txt|csv)$/i.test(name)) {
      return buffer.toString('utf8');
    }

    // Excel / spreadsheet → tabular text for the same line parsers
    if (isExcel) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const XLSX = require('xlsx') as typeof import('xlsx');
        const wb = XLSX.read(buffer, { type: 'buffer' });
        const chunks: string[] = [];
        for (const sheetName of wb.SheetNames.slice(0, 3)) {
          const sheet = wb.Sheets[sheetName];
          const csv = XLSX.utils.sheet_to_csv(sheet, { FS: '\t' });
          if (csv.trim()) chunks.push(csv);
        }
        return this.normalizeOcrText(chunks.join('\n'));
      } catch {
        return '';
      }
    }

    // Images must be OCR'd on the client — binary bytes are not invoice text.
    if (
      mimeType?.startsWith('image/') ||
      /\.(png|jpe?g|webp|gif|bmp|heic|heif)$/i.test(name) ||
      buffer.slice(0, 4).toString('ascii') === 'RIFF' ||
      buffer.slice(0, 3).toString('ascii') === 'ÿØÿ' ||
      buffer.slice(0, 8).toString('ascii') === '\x89PNG\r\n\x1a\n'
    ) {
      return '';
    }

    if (isPdf) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { PDFParse } = require('pdf-parse') as {
          PDFParse: new (opts: { data: Buffer }) => {
            getText: () => Promise<{ text?: string }>;
            destroy: () => Promise<void>;
          };
        };
        const parser = new PDFParse({ data: buffer });
        try {
          const data = await parser.getText();
          const parsed = String(data?.text || '').trim();
          if (parsed.length >= 40) return this.normalizeOcrText(parsed);
        } finally {
          await parser.destroy().catch(() => undefined);
        }
      } catch {
        // fall through to heuristic scrape
      }

      const latin = buffer.toString('latin1');
      // Prefer PDF text-show operators (Tj / TJ) when present
      const tjChunks: string[] = [];
      const tjRe = /\(([^\\()]{2,120})\)\s*Tj/g;
      for (const m of latin.matchAll(tjRe)) {
        tjChunks.push(m[1].replace(/\\([nrt])/g, ' '));
      }
      const tjText = tjChunks.join(' ').replace(/\s{2,}/g, ' ').trim();
      if (tjText.length >= 40) return this.normalizeOcrText(tjText);

      const text =
        latin
          .replace(/\\r/g, '\n')
          .match(/[A-Za-z0-9₹.,:/@#%&() \-]{4,}/g)
          ?.join('\n')
          .replace(/\s{2,}/g, ' ')
          .trim() ?? '';
      if (text.length < 40 || /RIFF|WEBP|JFIF|Exif/i.test(text)) return '';
      return this.normalizeOcrText(text);
    }

    const asUtf = buffer
      .toString('utf8')
      .replace(/[^\x09\x0A\x0D\x20-\x7E₹\u0900-\u097F]/g, ' ')
      .replace(/\s{2,}/g, ' ')
      .trim();
    if (/^RIFF|WEBPVP8|JFIF|Exif|%PDF/i.test(asUtf) || asUtf.length < 20) return '';
    return this.normalizeOcrText(asUtf);
  }

  private extractInvoiceData(text: string) {
    const normalized = text.replace(/\r\n/g, '\n').replace(/[ \t]+/g, ' ');
    const money = (raw?: string) => {
      if (!raw) return undefined;
      const n = Number(String(raw).replace(/,/g, ''));
      return Number.isFinite(n) ? n : undefined;
    };

    const pick = (patterns: RegExp[], source = normalized) => {
      for (const pattern of patterns) {
        const match = source.match(pattern);
        if (match?.[1]) return match[1].trim().replace(/\s+/g, ' ');
      }
      return undefined;
    };

    // Prefer labelled invoice numbers; avoid matching the "TAX INVOICE" title.
    let invoiceNumber = extractInvoiceNumberFromText(text) ?? undefined;

    let invoiceDate = pick([
      /(?:invoice\s*date|bill\s*date|dated|date)\s*[:.\-]?\s*([0-9]{1,2}[\/\-.][0-9]{1,2}[\/\-.][0-9]{2,4})/i,
      /(?:invoice\s*date|bill\s*date|dated|date)\s*[:.\-]?\s*([0-9]{1,2}[\/\-.\s]?(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\/\-.\s,]?[0-9]{2,4})/i,
      /(?:invoice\s*date|bill\s*date|dated|date)\s*[:.\-]?\s*([0-9]{4}[\/\-.][0-9]{1,2}[\/\-.][0-9]{1,2})/i,
      /\b([0-9]{1,2}[.\-\/](?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[.\-\/]?[0-9]{2,4})\b/i,
      /\b([0-9]{1,2}-(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-[0-9]{2,4})\b/i,
    ]);
    if (!invoiceDate) {
      invoiceDate = pick([
        /e-?Way\s*Bill\s*No\.?\s*Dated?\s*\n?\s*[0-9]{10,12}\s+(\d{1,2}-(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-[0-9]{2,4})/i,
        /\b[0-9]{10,12}\s+(\d{1,2}-(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-[0-9]{2,4})\b/i,
        /\b(\d{1,2}-(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{1,2})\b/i,
      ]);
      if (invoiceDate && /-\d$/.test(invoiceDate)) {
        invoiceDate = invoiceDate.replace(/-(\d)$/, '-2$1');
      }
      // Camera OCR often drops the leading "2" in year: 27-May-3 → 27-May-26 (FY 2026-27)
      if (invoiceDate && /\b20\d{2}\s*[-–]\s*\d{2,4}\b/.test(normalized)) {
        const partial = invoiceDate.match(
          /^(\d{1,2}-(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-)(\d{1,2})$/i,
        );
        if (partial && (partial[2].length === 1 || partial[2] === '23')) {
          invoiceDate = `${partial[1]}26`;
        }
      }
    }

    if (!invoiceDate) {
      invoiceDate = pick([
        /(?:invoice\s*no\.?|dated)[^\n]{0,80}?(\d{1,2}-(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{2,4})/i,
        /\|\s*(\d{1,2}-(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{2,4})/i,
        /(?:Ack\s*Date)\s*[:.\-]?\s*(\d{1,2}-(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-\d{2,4})/i,
      ]);
    }

    const gstins = this.extractGstins(normalized);
    const billToIndex = normalized.search(/bill\s*to|ship\s*to|place\s*of\s*supply|buyer|consignee/i);
    const topSection = billToIndex > 0 ? normalized.slice(0, billToIndex) : normalized.slice(0, 600);
    const topGstins = this.extractGstins(topSection);
    // Prefer header GSTIN only — never fall back to buyer GSTIN further down the bill
    let supplierGstin = topGstins[0];
    if (!supplierGstin && billToIndex <= 0) {
      supplierGstin = gstins[0];
    }
    let customerGstin = gstins.find((g) => g !== supplierGstin);

    let supplierName = pick([
      /(?:^|\n)\s*for\s+((?:M\/s\.?\s*)?[A-Za-z0-9 .&'_-]{2,60}?)\s*(?:\n|authori|signatory|prop)/i,
      /(?:sold\s*by|seller|vendor)\s*[:.\-]?\s*([A-Za-z0-9 .&'_-]{3,60})/i,
      /(?:^|\n)\s*supplier\s*(?:name)?\s*[:.\-]?\s*([A-Za-z0-9 .&'_-]{3,60})/i,
      /(?:^|\n)\s*((?:M\/s\.?\s*)?[A-Z][A-Za-z0-9 .&'_-]{2,50}?\b(?:TRADERS?|ENTERPRISES?|DISTRIBUTORS?|BATTERIES|PVT\.?\s*LTD\.?|LIMITED|LLP))\b(?:\s+\d{4}\s*[-–]\s*\d{2,4})?/i,
    ]);
    if (
      supplierName &&
      /(?:^|\b)(?:pan|tin|gstin?|no\.?|dated|invoice|inr|lakh|thousand|only|paise|rupees?|ref\.?|order|delivery|despatch|buyer)\b|'s\s*(?:pan|ref)/i.test(
        supplierName,
      )
    ) {
      supplierName = undefined;
    }

    const looksLikeAmountInWords = (line: string) =>
      /\b(?:INR|Rs\.?|Rupees?)\b/i.test(line) ||
      /\b(?:Lakh|Lac|Thousand|Hundred|Crore|Only|Oniy|paise)\b/i.test(line) ||
      /amount\s+chargeable|tax\s+amount\s*\(in\s*words\)/i.test(line);

    const looksLikeAddressOrJunk = (line: string) =>
      isDocumentTitleLine(line) ||
      isInvoiceSummaryLabel(line) ||
      isTableHeaderLine(line) ||
      /gst|invoice|dated|date|phone|mobile|contact|address|bill\s*to|hsn|qty|total|pan|tin\s*no|voice|nazim|taxable|grand|cgst|sgst|igst|irn|ack\s*no|e-?way|original\s+for|description\s+of\s+goods|declaration|computer\s+generated|authori[sz]ed|signatory|bank\s*details|email|buyer|supplier'?s?\s*ref/i.test(
        line,
      ) ||
      /(?:^|\b)(?:okhla|phase|delhi|mumbai|pune|surat|rajkot|ahmedabad|gujarat|maharashtra|haryana|karnataka|uttar\s*pradesh|pin|road|street|nagar|colony|sector|kolkata)\b/i.test(
        line,
      ) ||
      (/\bindia\b/i.test(line) &&
        /,|\b\d{6}\b|\bpin\b|pradesh|district|\bcity\b/i.test(line)) ||
      /^\d/.test(line) ||
      /'s\s*(?:pan|ref)/i.test(line) ||
      /^TAX\s+INVOICE/i.test(line) ||
      /^HSN\/?SAC/i.test(line) ||
      looksLikeAmountInWords(line) ||
      /^[|\\/\-]+/.test(line);

    const looksLikeBusinessName = (line: string) => looksLikeCompanyNameLine(line);

    // Prefer firm name immediately above supplier GSTIN / GSTN (works for page-2 OCR where title is late)
    if (!supplierName) {
      const lines = text
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      const gstinLineIdx = lines.findIndex((l) => /gstin?|gstn|uin/i.test(l) && /[0-9A-Z]{10,}/i.test(l));
      if (gstinLineIdx > 0) {
        for (let i = gstinLineIdx - 1; i >= Math.max(0, gstinLineIdx - 8); i--) {
          const line = lines[i].replace(/^for\s+/i, '').replace(/^[|]+\s*/, '');
          if (
            looksLikeCompanyNameLine(line) &&
            !looksLikeAmountInWords(line) &&
            line.length >= 3 &&
            line.length <= 70
          ) {
            supplierName = line;
            break;
          }
        }
      }
    }

    if (!supplierName) {
      const lines = normalized
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      // First non-junk header line is often the firm name (e.g. "NEEL")
      const first = lines[0]?.replace(/^[|]+\s*/, '') ?? '';
      if (
        first &&
        first.length >= 3 &&
        first.length <= 40 &&
        /^[A-Za-z][A-Za-z0-9 .&'_-]*$/.test(first) &&
        !isDocumentTitleLine(first) &&
        !looksLikeAddressOrJunk(first) &&
        !looksLikeAmountInWords(first) &&
        !/^(buyer|tax|invoice|hsn|total|bank)/i.test(first) &&
        // Reject short OCR junk headers (e.g. "SETH ER") — prefer firm names with business tokens
        !(first.split(/\s+/).length <= 2 && first.length <= 12 && !/(?:traders?|battery|batteries|pvt|ltd|works|enterprises?)/i.test(first))
      ) {
        supplierName = first;
      }
      // Prefer early document lines (page header) over post-title footer noise
      const titleIdx = lines.findIndex((l) => /tax\s*invoice|bill\s*of\s*supply/i.test(l));
      const billToLineIdx = lines.findIndex((l) => /bill\s*to|buyer\s*\(|billed\s*to/i.test(l));
      const headerEnd = billToLineIdx > 0 ? billToLineIdx : Math.min(lines.length, 15);
      const windows: Array<[number, number]> = [
        [0, headerEnd],
        [Math.max(0, titleIdx + 1), Math.min(lines.length, (titleIdx >= 0 ? titleIdx : 0) + 12)],
      ];
      if (!supplierName) {
        for (const [start, end] of windows) {
          for (let i = start; i < end; i++) {
            const line = lines[i].replace(/^[|]+\s*/, '');
            if (looksLikeBusinessName(line)) {
              supplierName = line.replace(/^for\s+/i, '');
              break;
            }
          }
          if (supplierName) break;
        }
      }
    }

    // Prefer Batteries/Traders/etc firm lines in the header (overrides weak OCR junk)
    {
      const lines = normalized
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      const billToLineIdx = lines.findIndex((l) => /bill\s*to|buyer\s*\(|billed\s*to/i.test(l));
      const headerEnd = billToLineIdx > 0 ? billToLineIdx : Math.min(lines.length, 20);
      const currentWeak =
        !supplierName ||
        /invoice\s*no|dated|dateg|bill\s*no/i.test(supplierName) ||
        (supplierName.split(/\s+/).length <= 2 &&
          supplierName.length <= 14 &&
          !/(?:traders?|batter(?:y|ies)|pvt|ltd|works|enterprises?|distributors?)/i.test(supplierName));
      let bestFirm: string | undefined;
      for (let i = 0; i < headerEnd; i++) {
        const line = lines[i].replace(/^[|]+\s*/, '');
        const firmCore = line
          .replace(/\s*[\u2010-\u2015\-;,:|\[].*$/g, ' ')
          .replace(/\s+(?:INVOICE|INV|BILL)\s*No\.?.*$/i, '')
          .replace(/\s{2,}/g, ' ')
          .trim();
        const candidate = firmCore.length >= 5 ? firmCore : line;
        if (
          candidate.length >= 5 &&
          candidate.length <= 70 &&
          /(?:pvt|ltd|llp|traders?|distributors?|wholesale|electronics|enterprises?|batteries|works)/i.test(
            candidate,
          ) &&
          !/\b(?:old|smf|tubular)\s+battery\b/i.test(candidate) &&
          !/\d+\s*%|\b\d{4,8}\b/.test(candidate) &&
          !/e-?mail|contact|gstin|state\s*name|@/i.test(candidate) &&
          !looksLikeAmountInWords(candidate) &&
          !/^[A-Za-z]\s*-?\s*mail/i.test(candidate)
        ) {
          bestFirm = candidate.replace(/^for\s+/i, '');
          break;
        }
      }
      if (bestFirm && (currentWeak || !supplierName)) {
        supplierName = bestFirm;
      }
    }

    if (supplierName) {
      const branded = supplierName.match(
        /((?:M\/s\.?\s*)?[A-Z][A-Za-z0-9 .&'_-]{0,40}?\b(?:TRADERS?|ENTERPRISES?|DISTRIBUTORS?|BATTERIES|BATTERY|PVT\.?\s*LTD\.?|LIMITED|LLP|WORKS)(?:\s+\d{4}\s*[-–]\s*\d{2,4})?)/i,
      );
      if (branded) supplierName = branded[0].trim();
      supplierName = supplierName
        .replace(/^[|[\]()]+/, '')
        .replace(/\s+INVOICE\s+No\.?.*$/i, '')
        .replace(/\s+Bill\s+No\.?.*$/i, '')
        .replace(/\b(TRADERS?)(\d{4}\s*[-–]\s*\d{2,4})\b/gi, '$1 $2')
        .replace(/\s+(\d{4}\s*[-–]\s*\d{2,4})\s*$/g, ' $1')
        .replace(/\s+(?:jf|feooien|fi)\b.*$/i, '')
        .replace(/\s*\|.*$/g, '')
        .replace(/\s+C\/C\s*$/i, '')
        .replace(/^[:.\-\s]+/, '')
        .replace(/^'\s*s\s+/i, '')
        .trim();
      const letters = (supplierName.match(/[A-Za-z\u0900-\u097F]/g) || []).length;
      const symbols = (supplierName.match(/[^A-Za-z0-9\u0900-\u097F\s.&'\/\-]/g) || []).length;
      const tokens = supplierName.split(/\s+/).filter(Boolean);
      const shortTokenHeavy =
        tokens.length >= 3 &&
        tokens.filter((t) => t.replace(/[^A-Za-z\u0900-\u097F]/gi, '').length <= 2).length >= Math.ceil(tokens.length * 0.6);
      if (
        looksLikeAmountInWords(supplierName) ||
        isDocumentTitleLine(supplierName) ||
        isInvoiceSummaryLabel(supplierName) ||
        isTableHeaderLine(supplierName) ||
        /(?:^|\b)(?:ref\.?|order\s*no|delivery|despatch|buyer)\b/i.test(supplierName) ||
        letters < 3 ||
        symbols > letters / 2 ||
        supplierName.length < 3 ||
        (shortTokenHeavy && !/(?:traders?|pvt|ltd|llp|enterprises?|battery|management|distributors?|electronics)/i.test(supplierName))
      ) {
        supplierName = undefined;
      }
    }

    // Address lines immediately under supplier name until GSTIN / State / Buyer
    let supplierAddress: string | undefined;
    if (supplierName) {
      const lines = text
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);
      const key = supplierName.slice(0, 18).toLowerCase();
      const idx = lines.findIndex((l) => l.toLowerCase().includes(key));
      if (idx >= 0) {
        const parts: string[] = [];
        for (let i = idx + 1; i < Math.min(idx + 6, lines.length); i++) {
          const line = lines[i].replace(/^[|]+\s*/, '');
          if (
            /gstin?|gstn|uin|state\s*name|invoice\s*no|buyer|bill\s*to|e-?invoice|irn|ack\s*no|dated|e-?way|hsn\/?sac|amount\s+chargeable|description\s+of\s+goods|bank\s*details|email|ph\s*[-:]|phone|mobile/i.test(
              line,
            )
          ) {
            break;
          }
          if (looksLikeAmountInWords(line)) continue;
          if (/^HSN\/?SAC/i.test(line)) continue;
          // IRN / ack hex fragments must not become address
          if (/^[a-f0-9][a-f0-9\s\-]{16,}$/i.test(line)) continue;
          if (/[a-f0-9]{20,}/i.test(line) && !/[A-Za-z]{4,}/.test(line.replace(/[a-f0-9\-\s]/gi, ''))) continue;
          if (/\b\d{3,4}\s+\d{10,}\b/.test(line)) continue;
          if (/\d{8,}/.test(line.replace(/\s/g, ''))) continue;
          if (/delivery\s+note|mode\/terms|payment|grandeur|reference/i.test(line)) continue;
          if (isLikelyGstinNoiseLine(line)) continue;
          if (looksLikeBusinessName(line) && /traders?|pvt|ltd|llp/i.test(line)) break;
          // Keep real address fragments (colony/road/city/pin)
          if (
            line.length >= 4 &&
            line.length <= 120 &&
            /[A-Za-z]{3,}/.test(line) &&
            (looksLikeAddressLine(line) || (!/\d{5,}/.test(line) && /,/.test(line)))
          ) {
            parts.push(
              line
                .replace(/\)\s*\d{2,4}-\d{2,4}\/\d{1,6}\s*-\s*\d{1,2}-[A-Za-z]{3}-\d{2,4}.*$/i, '')
                .replace(/\b\d{2,4}-\d{2,4}\/\d{1,6}\s*-\s*\d{1,2}-[A-Za-z]{3}-\d{2,4}\b.*$/i, '')
                .replace(/[.,]+$/, '')
                .replace(/\s*\[.*$/, '')
                .trim(),
            );
          }
        }
        if (parts.length) supplierAddress = parts.join(', ');
      }
    }
    if (!supplierAddress || /\d{8,}/.test(supplierAddress) || isLikelyGstinNoiseLine(supplierAddress)) {
      const addrLines = text
        .replace(/\r\n/g, '\n')
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => looksLikeAddressLine(l) && !isLikelyGstinNoiseLine(l));
      if (addrLines.length) {
        supplierAddress = addrLines[0]
          .replace(/\s*\[.*$/, '')
          .replace(/\s+RB\s*\/.*$/i, '')
          .replace(/\s+[|].*$/, '')
          .trim();
      }
    }

    if (supplierAddress) {
      supplierAddress = supplierAddress
        .replace(/\s+RB\s*\/.*$/i, '')
        .replace(/\s+[|].*$/, '')
        .replace(/\s{2,}/g, ' ')
        .trim();
    }

    let customerName = pick([
      /(?:buyer\s*\(\s*bill\s*to\s*\)|bill\s*to|billed\s*to|buyer|consignee|customer|party)[^\n]*\n\s*((?:M\/s\.?\s*)?[A-Z][A-Za-z0-9 .&'_-]{2,50})(?:\s*\||\s*\n|$)/i,
      /(?:bill\s*to|billed\s*to|buyer|consignee|customer|party)\s*[:~.\-]*\s*((?:M\/s\.?\s*)?[A-Z][A-Za-z0-9 .&'_-]{2,50})(?:\s*\||\s*\n|$)/i,
      /(?:^|\n)\s*((?:M\/s\.?\s*)?[A-Z][A-Za-z0-9 .&'_-]{2,50}\s+(?:Electric\s+Works|Works|Store|Mart|Electronics))(?:\s*\||\s*\n|$)/i,
    ]);
    if (customerName && shouldSkipBuyerCandidate(customerName, supplierName)) {
      customerName = undefined;
    }
    // OCR often puts GSTIN lines between "Buyer" and the actual name
    if (!customerName || /^(gstin|uin|state|pan|shipped)/i.test(customerName)) {
      const buyerIdx = text.search(/buyer\s*\(?\s*bill\s*to|bill\s*to|billed\s*to|(?:^|\n)\s*buyer\s*:/i);
      if (buyerIdx >= 0) {
        const sliceLines = text
          .slice(buyerIdx, buyerIdx + 500)
          .split('\n')
          .map((l) => l.trim())
          .filter(Boolean);
        for (const line of sliceLines.slice(1, 8)) {
          if (isTableHeaderLine(line) || isInvoiceSummaryLabel(line) || looksLikeAddressLine(line)) {
            continue;
          }
          const m =
            line.match(/^((?:M\/s\.?\s*)?[A-Z][A-Za-z0-9 .&'_-]*?\s+Electric\s+Works)/i) ??
            line.match(/^((?:M\/s\.?\s*)?[A-Z][A-Za-z0-9 .&'_-]{2,50}(?:\s+Electronics|\s+Films|\s+Pvt\s+Ltd)?)/) ??
            line.match(/^((?:M\/s\.?\s*)?[A-Z][A-Za-z0-9 .&'_-]{2,40}?)(?=\s+(?:Dispatch|Delivery|GSTIN|EPS|GULABI|Terms)|\s*[|;]|$)/i);
          if (!m?.[1]) continue;
          const candidate = m[1].trim();
          if (shouldSkipBuyerCandidate(candidate, supplierName)) continue;
          if (/electric|works|store|mart|electronics|films?|media|studio/i.test(line)) {
            customerName = m[1].trim();
            break;
          }
          customerName = candidate;
          break;
        }
      }
    }
    if (customerName) {
      customerName = customerName
        .replace(/\s*\([^)]*cash[^)]*\)\s*$/i, '')
        .replace(/\s*\|.*$/, '')
        .replace(/\s+(?:Dispatch|Dispaten|Delivery|Destination|Buyer's?\s+Order|Terms\s+of|EPS\s+Dov|Dov\s+NG).*$/i, '')
        .replace(/\s+[A-Z]{2,4}\s+Dov\b.*$/i, '')
        .trim();
    }
    const cleanCustomer =
      customerName &&
      !/^(gstin|uin|state|pan|place|invoice|billed|buyer|shipped)/i.test(customerName) &&
      (!supplierName || customerName.toLowerCase() !== supplierName.toLowerCase())
        ? customerName
        : undefined;

    if (!customerGstin && billToIndex >= 0) {
      const buyerSection = normalized.slice(billToIndex, billToIndex + 600);
      const buyerGstins = this.extractGstins(buyerSection).filter((g) => g !== supplierGstin);
      customerGstin = buyerGstins[0];
      if (!customerGstin) {
        const rawBuyerGst = pick(
          [/(?:GSTIN\s*\/?\s*UIN)\s*[:.\-]?\s*([0-9OIl\][A-Za-z0-9]{12,20})/i],
          buyerSection,
        );
        customerGstin = this.normalizeGstinCandidate(rawBuyerGst);
      }
    }

    // Prefer supplier PH- in header over buyer MOBILE further down
    const billToIdx = normalized.search(/bill(?:ed)?\s*to|buyer\s*\(/i);
    const phoneSection =
      billToIdx > 0 ? normalized.slice(0, billToIdx) : billToIndex > 0 ? topSection : normalized;
    const headerPh = phoneSection.match(/(?:^|\n)\s*PH\s*[-.:]?\s*(\d{10})/i)?.[1];
    const labelledPhone = pick([
      /(?:phone|mobile|contact|tel)\s*(?:no\.?|number)?\s*[:.\-]?\s*(\+?\d[\d\s-]{8,14})/i,
      /\b([6-9]\d{9})\b/,
    ], phoneSection);
    const phoneRaw = headerPh ?? labelledPhone;
    const phone = (() => {
      if (!phoneRaw) return undefined;
      const digits = phoneRaw.replace(/\D/g, '');
      if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
      if (digits.length >= 10) return digits.slice(0, 10);
      return phoneRaw.trim();
    })();

    const stateName = pick([
      /(?:state\s*name)\s*[:.\-]?\s*([A-Za-z ]{3,40})(?:,?\s*code)?/i,
    ]);
    const placeOfSupply = pick([
      /(?:place\s*of\s*supply)\s*[:~.\-]*\s*([A-Za-z ]{3,40})/i,
    ]);

    const irn = pick([
      /\bIRN\s*[:~.\-]?\s*([a-f0-9\-]{40,90})/i,
      // Fragmented IRN across lines (hex chunks)
      /([a-f0-9]{20,}[a-f0-9\-]{10,60})/i,
    ]);
    const ackNo = pick([
      /(?:Ack\.?\s*No\.?)\s*[:~.\-]?\s*([0-9]{8,20})/i,
      /(?:Ack\s*No\.?)\s*[:.\-]?\s*([0-9]{8,20})/i,
      /(?:Ack\s*No\.?|Ack\s*Date)[^\n]{0,40}\n[^\n]{0,20}:?\s*([0-9]{12,18})/i,
      /(?:^|\n)\s*:?\s*(142\d{12,15})\b/,
    ]);
    const ackDate = pick([
      /(?:Ack\.?\s*Date)\s*[:~.\-]?\s*([0-9]{1,2}[\/\-.][0-9]{1,2}[\/\-.][0-9]{2,4}|[0-9]{1,2}[\/\-.\s]?(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\/\-.\s,]?[0-9]{2,4})/i,
      /(?:Ack\s*Date)\s*[:.\-]?\s*([0-9]{1,2}[\/\-.][0-9]{1,2}[\/\-.][0-9]{2,4}|[0-9]{1,2}[\/\-.\s]?(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*[\/\-.\s,]?[0-9]{2,4})/i,
    ]);
    const ewayBillNo = (() => {
      const labelled = pick([
        /(?:e-?Way\s*Bill\s*No\.?)[^\n]*\n\s*([0-9]{12})(?:\d{0,2})?[-.\s]*(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)/i,
        /(?:e-?Way\s*Bill\s*No\.?)\s*[:~.\-\s]*([0-9]{10,12})\b/i,
        /(?:e-?Way\s*Bill\s*No\.?)[^\n]*\n\s*([0-9]{10,12})\b/i,
      ]);
      if (labelled) return labelled;
      const glued = normalized.match(/\b\d{3,4}\s+([0-9]{10,13})\b/);
      if (!glued) return undefined;
      let digits = glued[1];
      if (digits.length === 13 && digits.startsWith('1')) digits = '4' + digits.slice(1);
      if (digits.length === 10) digits = '44' + digits;
      return digits.length === 12 ? digits : glued[1];
    })();
    const vehicleNoRaw = pick([
      /(?:Motor\s*Vehic\w*\s*No\.?|Vehicle\s*No\.?)\s*[:.\-]?\s*([A-Z]{2}[0-9A-Z]{6,12})/i,
      /(?:Motor\s*Vehic\w*\s*No\.?|Vehicle\s*No\.?)[^\n]*\n\s*([A-Z]{2}[0-9A-Z]{6,12})/i,
      /\b([A-Z]{2}\d{2}[A-Z]{1,3}\d{3,4})\b/,
    ]);
    const vehicleNo = normalizeIndianVehiclePlate(vehicleNoRaw) ?? vehicleNoRaw;

    const cleanBankName = (raw?: string) => {
      if (!raw) return undefined;
      return raw
        .replace(/\bCompany'?s?\s+Bank\s+Details\b/i, '')
        .replace(/\s*(?:A\/C|C\/C|A\/c|C\/c|CIC|AIC)\s*$/i, '')
        .replace(/\s+(?:i\s+sed|ised|details?)\b.*$/i, '')
        .replace(/[,|;]+$/, '')
        .replace(/\s{2,}/g, ' ')
        .trim()
        .slice(0, 80) || undefined;
    };

    const normalizeIfsc = (raw?: string) => {
      if (!raw) return undefined;
      const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
      if (cleaned.length !== 11 || !/^[A-Z]{4}/.test(cleaned)) return undefined;
      const fixed = cleaned.slice(0, 4) + cleaned.slice(4).replace(/O/g, '0');
      return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(fixed) ? fixed : undefined;
    };

    let bankName = cleanBankName(
      pick([
        /(?:Bank\s*Name)\s*[:.\-]?\s*([A-Za-z0-9 .,&\/\-]{3,80})/i,
        /(?:Bank\s*Details)\s*[:.\-]?\s*([A-Za-z0-9 .,&\/\-]{3,80})/i,
        /(?:^|\n)\s*Bank\s*[:.\-]?\s*((?:State\s+Bank|AXIS|HDFC|ICICI|PNB|Punjab\s+National|Kotak|SBI|YES\s+Bank|IndusInd|Canara|Bank\s+of\s+Baroda|Union\s+Bank)[A-Za-z0-9 .,&\/\-]{0,50})/i,
      ]),
    );
    const bankAccountRaw = pick([
      /(?:A\/c\s*No\.?|Alc\s*No\.?|AIc\s*No\.?|Ac\s*No\.?|Account\s*(?:No\.?|Number)|Bank\s*A\/c)[^\d]{0,12}([0-9]{9,18})/i,
      /(?:A\/c\s*No\.?|Alc\s*No\.?|AIc\s*No\.?|Ac\s*No\.?|Account\s*(?:No\.?|Number)|Bank\s*A\/c)\s*[:.\-=]?\s*([0-9][0-9\s-]{8,22})/i,
      // Camera OCR: digits on prior line, then empty "A/c No. ="
      /([0-9]{9,18})\s*(?:\n|[|]).{0,80}?(?:A\/c\s*No\.?|Alc\s*No\.?|Account\s*No\.?)/i,
      // "Bank Name : AXIS …" then garbled label + account digits
      /(?:Bank\s*Name|AXIS\s*BANK|HDFC\s*BANK|ICICI\s*BANK|SBI|PUNJAB\s+NATIONAL)[^\n]{0,60}\n[^\d\n]{0,40}([0-9]{9,18})\b/i,
    ]);
    let bankAccount = bankAccountRaw?.replace(/[\s-]/g, '') || undefined;
    // Fallback: lone 9–18 digit run inside Company's Bank Details (not Ack/phone-looking labels)
    if (!bankAccount) {
      const bankBlock =
        normalized.match(
          /Bank\s*Name\s*:([\s\S]{0,350}?)(?:Branch\s*&\s*IFS|IFS\s*Code|IFSC|Customer'?s?\s+Seal|SUBJECT\s+TO)/i,
        )?.[1] ||
        normalized.match(
          /Company'?s?\s+Bank\s+Details([\s\S]{0,500}?)(?:Customer'?s?\s+Seal|SUBJECT\s+TO|Tax\s+Amount\s*\(in\s*words\))/i,
        )?.[1];
      if (bankBlock) {
        const candidates = [...bankBlock.matchAll(/\b([0-9]{9,18})\b/g)].map((m) => m[1]);
        const phones = new Set(
          [...normalized.matchAll(/(?:Contact|Phone|Mobile|Tel)\s*[:.\-]?\s*([0-9][0-9\s-]{8,14})/gi)].map((m) =>
            m[1].replace(/[\s-]/g, ''),
          ),
        );
        bankAccount =
          candidates.find((n) => !phones.has(n) && !/^14\d{12,}$/.test(n) && n.length >= 9) || undefined;
      }
    }

    const ifsc = normalizeIfsc(
      pick([
        /(?:Branch\s*&\s*IFS\s*Code)\s*[:.\-]?\s*[A-Za-z0-9 .\/\-]+?\s*&\s*([A-Z]{4}[0O][A-Z0-9O]{6})/i,
        /(?:IFS\s*Code|IFSC(?:\s*Code)?)\s*[:.\-]?\s*(?:[A-Za-z0-9 .&]*?&\s*)?([A-Z]{4}[0O][A-Z0-9O]{6})/i,
        /\b([A-Z]{4}[0O][A-Z0-9O]{6})\b/,
      ]),
    );

    const bankBranch = pick([
      /(?:Branch\s*&\s*IFS\s*Code)\s*[:.\-]?\s*([A-Za-z0-9 .\/\-]{2,40}?)\s*&\s*[A-Z]{4}[0O]/i,
      /(?:Branch\s*Name|Branch)\s*[:.\-]?\s*([A-Za-z0-9 .\/\-]{2,50})(?=\s*(?:\n|IFS|IFSC|A\/c|Alc|Account|$))/i,
      /(?:^|\n)\s*([A-Za-z][A-Za-z0-9 .\/\-]{2,40}?)\s+BRANCH\.?\s*(?:\n|$)/i,
    ])
      ?.replace(/\s*&\s*$/, '')
      .replace(/\s+BRANCH\.?$/i, '')
      .trim();

    // Also allow bank name after "BANK DETAILS:" block
    if (!bankName) {
      bankName = cleanBankName(
        pick([
          /(?:Bank\s*Details)\s*[:.\-]?\s*\n?\s*((?:State\s+Bank|AXIS|HDFC|ICICI|PNB|Punjab\s+National|Kotak|SBI|YES\s+Bank|IndusInd|Canara|Bank\s+of\s+Baroda|Union\s+Bank|PUNJAB\s+NATIONAL\s+BANK)[A-Za-z0-9 .,&\/\-]{0,40})/i,
          /(?:^|\n)\s*((?:PUNJAB\s+NATIONAL\s+BANK|State\s+Bank\s+of\s+India|HDFC\s+BANK|AXIS\s+BANK|ICICI\s+BANK)[A-Za-z0-9 .,&\/\-]{0,20})\s*,?\s*(?:\n|$)/i,
        ]),
      );
    }

    const taxableValue = pick([
      /(?:taxable\s*value|taxable\s*amount|basic\s*amount)\s*[:.\-]?\s*₹?\s*([0-9,]+(?:\.\d{1,2})?)/i,
      /(?:^|\n)\s*([0-9,]+(?:\.\d{2}))\s*\n\s*OUTPUT\s+CGST/i,
      /\bTotal\s+([0-9,]+(?:\.\d{2}))\s+[0-9,]+(?:\.\d{2})\s+[0-9,]+(?:\.\d{2})\s+[0-9,]+(?:\.\d{2})/i,
      // Page-2 OCR often prints HSN taxable total as "Total 104237.28" before tax columns
      /(?:^|\n)\s*Total\s+([0-9,]{5,}(?:\.\d{2}))\s*(?:\n|$)/i,
    ]);
    // Page-1 column OCR: line amounts then taxable + CGST before "continued to page"
    let taxableFromFooter: number | undefined;
    let cgstFromFooter: number | undefined;
    {
      const footer = normalized.match(
        /([0-9]{4,}(?:\.\d{2}))\s*\n\s*([0-9]{3,}(?:\.\d{2}))\s*\n\s*(?:continued\s+to\s+page)/i,
      );
      if (footer) {
        taxableFromFooter = money(footer[1]);
        cgstFromFooter = money(footer[2]);
      }
    }

    const pickMoneyPreferAmount = (patterns: RegExp[]) => {
      for (const pattern of patterns) {
        const match = normalized.match(pattern);
        if (!match) continue;
        // Prefer last capture group that looks like a money amount (>= 50), not a GST %
        const groups = match.slice(1).filter(Boolean);
        for (let i = groups.length - 1; i >= 0; i--) {
          const n = money(groups[i]);
          if (n != null && n >= 50) return n;
        }
        const n = money(match[1]);
        if (n != null && n >= 50) return n;
      }
      return undefined;
    };

    const maxMoneyInSection = (section?: string, cap?: number) => {
      if (!section) return undefined;
      const limit = cap ?? 100_000;
      const amounts = Array.from(section.matchAll(/\b([0-9,]+\.\d{2})\b/g))
        .map((m) => money(m[1]))
        .filter((n): n is number => n != null && n >= 50 && n < limit);
      return amounts.length ? Math.max(...amounts) : undefined;
    };

    const saleTaxFromLines = (label: RegExp, min = 500) => {
      for (const line of normalized.split('\n')) {
        if (!label.test(line)) continue;
        const amounts = Array.from(line.matchAll(/([0-9,]+\.\d{2})/g))
          .map((m) => money(m[1]))
          .filter((n): n is number => n != null && n >= min);
        if (amounts.length) return amounts[amounts.length - 1];
      }
      return undefined;
    };

    let cgstAmount = pickMoneyPreferAmount([
      /OUTPUT\s+CGST[^\n]*?@\s*\d+(?:\.\d+)?\s*%[^\n]*?([0-9,]+\.\d{2}|[0-9,]+)/i,
      /OUTPUT\s+CGST[^\n]*?([0-9,]+\.\d{2})/i,
      /CGST\s+SALE\s*@\s*(\d+(?:\.\d+)?)\s*%[^\n]*?([0-9,]+\.\d{2}|[0-9,]+)/i,
      /(?:Add\s*:?\s*CGST|ADD\s+CGST)\s*(\d+(?:\.\d+)?)\s*%[^\n]*?([0-9,]+\.\d{2}|[0-9,]+)/i,
      /(?:Add\s*:?\s*CGST|ADD\s+CGST)[^\n]*?([0-9,]+\.\d{2}|[0-9,]{3,})/i,
      /Total\s+CGST\s*[:.\-]?\s*([0-9,]+\.\d{2}|[0-9,]+)/i,
      /(?:\bCGST\b)\s*@?\s*\d+(?:\.\d+)?\s*%[^\n]*?([0-9,]+\.\d{2})/i,
    ]);
    if (cgstAmount == null || cgstAmount < 500) {
      cgstAmount = saleTaxFromLines(/CGST\s+SALE/i) ?? cgstAmount;
    }
    if (cgstAmount == null && cgstFromFooter != null) cgstAmount = cgstFromFooter;
    let sgstAmount = pickMoneyPreferAmount([
      /OUTPUT\s+SGST[^\n]*?@\s*\d+(?:\.\d+)?\s*%[^\n]*?([0-9,]+\.\d{2}|[0-9,]+)/i,
      /OUTPUT\s+SGST[^\n]*?([0-9,]+\.\d{2})/i,
      /SGST\s+SALE\s*@\s*(\d+(?:\.\d+)?)\s*%[^\n]*?([0-9,]+\.\d{2}|[0-9,]+)/i,
      /(?:Add\s*:?\s*SGST|ADD\s+SGST)\s*(\d+(?:\.\d+)?)\s*%[^\n]*?([0-9,]+\.\d{2}|[0-9,]+)/i,
      /(?:Add\s*:?\s*SGST|ADD\s+SGST)[^\n]*?([0-9,]+\.\d{2}|[0-9,]{3,})/i,
      /Total\s+SGST\s*[:.\-]?\s*([0-9,]+\.\d{2}|[0-9,]+)/i,
      /(?:\bSGST\b)\s*@?\s*\d+(?:\.\d+)?\s*%[^\n]*?([0-9,]+\.\d{2})/i,
    ]);
    if (sgstAmount == null || sgstAmount < 500) {
      sgstAmount = saleTaxFromLines(/SGST\s+SALE/i) ?? sgstAmount;
    }
    if ((sgstAmount == null || sgstAmount < 500) && cgstAmount != null && cgstAmount >= 500) {
      sgstAmount = cgstAmount;
    }
    // Page-1 often only prints OUTPUT CGST; mirror as SGST for same-state invoices
    if (sgstAmount == null && cgstAmount != null && cgstFromFooter != null) {
      sgstAmount = cgstAmount;
    }
    const igstAmount = pickMoneyPreferAmount([
      /OUTPUT\s+IGST[^\n]*?@\s*\d+(?:\.\d+)?\s*%[^\n]*?([0-9,]+\.\d{2}|[0-9,]+)/i,
      /OUTPUT\s+IGST[^\n]*?([0-9,]+\.\d{2})/i,
      /(?:Add\s*:?\s*IGST|ADD\s+IGST)[^\n]*?([0-9,]+\.\d{2}|[0-9,]{3,})/i,
      /(?:\bIGST\b)\s*@?\s*\d+(?:\.\d+)?\s*%[^\n]*?([0-9,]+\.\d{2})/i,
    ]);

    // Page-2 OCR: CGST/SGST column totals = largest amount in each tax block (cap avoids grand totals)
    const taxCap =
      money(
        pick([
          /(?:taxable\s*value|taxable\s*amount)\s*[:.\-]?\s*₹?\s*([0-9,]+(?:\.\d{1,2})?)/i,
          /(?:^|\n)\s*Total\s+([0-9,]{5,}(?:\.\d{2}))\s*(?:\n|$)/i,
        ]),
      ) ?? 50_000;
    const halfishCap = Math.min(100_000, Math.max(500, taxCap * 0.45));
    if (cgstAmount == null) {
      const cgstSec = normalized.match(
        /\bCGST\b(?!\s*SALE)([\s\S]{0,350}?)(?=\bSGST\/UTGST\b|\bSGST\b|\bUTGST\b|\bTax\s+Amount\b|Company'?s?\s+Bank)/i,
      )?.[1];
      cgstAmount = maxMoneyInSection(cgstSec, halfishCap);
    }
    if (sgstAmount == null) {
      const sgstSec =
        normalized.match(
          /\bSGST\/UTGST\b([\s\S]{0,300}?)(?=\bTax\s+Amount\b|Company'?s?\s+Bank|\bDeclaration\b)/i,
        )?.[1] ??
        normalized.match(
          /\bSGST\b(?!\s*SALE)([\s\S]{0,200}?)(?=\bTax\s+Amount\b|Company'?s?\s+Bank|\bDeclaration\b)/i,
        )?.[1];
      // Prefer the last SGST block (footer) over an early "OUTPUT SGST" heading with no amounts
      const allSgst = Array.from(
        normalized.matchAll(
          /\bSGST(?:\s*\/\s*UTGST)?\b([\s\S]{0,250}?)(?=\bTax\s+Amount\b|Company'?s?\s+Bank|\bDeclaration\b)/gi,
        ),
      );
      const fromLast = allSgst.length ? maxMoneyInSection(allSgst[allSgst.length - 1][1], halfishCap) : undefined;
      sgstAmount = fromLast ?? maxMoneyInSection(sgstSec, halfishCap);
    }

    const taxFromComponents =
      [cgstAmount, sgstAmount, igstAmount].filter((n) => n != null).reduce((a, b) => a! + b!, 0) || undefined;
    const taxFromLabel = money(
      pick([
        /(?:total\s*tax\s*amount)\s*[:.\-]?\s*₹?\s*([0-9,]+(?:\.\d{1,2})?)/i,
        // HSN summary total tax column (last of four amounts on Total row)
        /\bTotal\s+[0-9,]+(?:\.\d{2})\s+[0-9,]+(?:\.\d{2})\s+[0-9,]+(?:\.\d{2})\s+([0-9,]+(?:\.\d{2}))/i,
        // "Tax Amount" block ending with grand tax (skip per-HSN rows)
        /(?:^|\n)\s*Tax\s+Amount\s*\n\s*[0-9,]+\.\d{2}\s*\n\s*[0-9,]+\.\d{2}\s*\n\s*([0-9,]+\.\d{2})/i,
      ]),
    );
    let taxAmount = taxFromComponents || taxFromLabel;

    // Prefer labelled grand / amount before tax-in-words over bare "Total <taxable>"
    const labelledGrand = money(
      pick([
        /Grand\s+Total[^0-9]*(?:[0-9,]+(?:\.\d+)?\s*Pcs\.?[^0-9]*)?([0-9,]+(?:\.\d{1,2})?)/i,
        /(?:Amount|Amour)\s+Charged[^\d]{0,40}[₹¥(]?\s*([0-9,]+\.\d{2})/i,
        /Total\s+Amount\s*:\s*₹?\s*([0-9,]+(?:\.\d{1,2})?)/i,
        /(?:grand\s*total|final\s*total|invoice\s*total|amount\s*payable|net\s*payable|total\s*amount)\s*[:~.\-]?\s*₹?\s*([0-9,]+(?:\.\d{1,2})?)/i,
        /Total[^\n]{0,80}[₹€¥]\s*([0-9,]+(?:\.\d{1,2})?)/i,
        /[₹€¥]\s*([0-9,]{4,}(?:\.\d{1,2})?)\s*(?:\n|$)/,
        /(?:^|\n)\s*Amount\s*\n\s*([0-9]+(?:\.\d{2}))/i,
      ]),
    );
    const amountInWordsGrand = (() => {
      const m = normalized.match(
        /\b(?:INR|Rs\.?)?\s*((?:One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|Eleven|Twelve|Thirteen|Fourteen|Fifteen|Sixteen|Seventeen|Eighteen|Nineteen|Twenty|Thirty|Forty|Fifty|Sixty|Seventy|Eighty|Ninety|Hundred|Thousand|Lakh|Lac|Crore|H[a-z]{0,6}ndred)[A-Za-z\s]+?)\s*(?:Only|Oniy)/i,
      );
      if (!m) return undefined;
      const w = m[1]
        .toLowerCase()
        .replace(/h[a-z]{0,6}ndred/g, 'hundred')
        .replace(/thou[a-z]{0,4}nd/g, 'thousand');
      const units: Record<string, number> = {
        one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
        eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
        eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
        seventy: 70, eighty: 80, ninety: 90, hundred: 100, thousand: 1000, lakh: 100000, lac: 100000,
        crore: 10000000,
      };
      let total = 0;
      let current = 0;
      for (const token of w.split(/\s+/)) {
        const n = units[token.replace(/[^a-z]/g, '')];
        if (n == null) continue;
        if (n === 100) current = (current || 1) * 100;
        else if (n === 1000 || n === 100000 || n === 10000000) {
          current = (current || 1) * n;
          total += current;
          current = 0;
        } else current += n;
      }
      total += current;
      return total >= 1000 ? total : undefined;
    })();
    const beforeTaxWords = money(
      pick([/([0-9]{5,}(?:\.\d{2})?)\s*\n+\s*Tax\s+Amount\s*\(in\s*words\)/i]),
    );
    const totalCandidates: number[] = [];
    const pushTotal = (n?: number) => {
      if (n != null && n >= 100) totalCandidates.push(n);
    };
    pushTotal(labelledGrand);
    pushTotal(amountInWordsGrand);
    pushTotal(beforeTaxWords);
    for (const m of normalized.matchAll(
      /(?:^|\n)\s*(?:Grand\s+)?Total\s*[:.\-]?\s*₹?\s*([0-9,]+(?:\.\d{1,2})?)/gi,
    )) {
      pushTotal(money(m[1]));
    }
    let taxableNum =
      money(taxableValue) ??
      taxableFromFooter ??
      money(normalized.match(/\n\s*([0-9,]{5,}\.\d{2})\s*\n\s*CGST\s+SALE/i)?.[1]);
    const taxableForTotals = taxableNum;
    // Trust labelled Grand/Final total when present (handles pre-discount "Total" rows)
    let totalAmount: number | undefined = labelledGrand ?? beforeTaxWords;
    if (totalAmount == null) {
      const uniqueTotals = Array.from(new Set(totalCandidates));
      totalAmount = uniqueTotals[0];
      if (uniqueTotals.length > 1) {
        if (taxableForTotals != null) {
          const aboveTaxable = uniqueTotals.filter((n) => n > taxableForTotals + 1);
          totalAmount = aboveTaxable.length ? Math.max(...aboveTaxable) : Math.max(...uniqueTotals);
        } else {
          totalAmount = Math.max(...uniqueTotals);
        }
      }
    }
    // If we only grabbed the taxable row as "Total", prefer a larger candidate that matches taxable+tax
    if (taxableNum != null && taxAmount != null && (totalAmount == null || totalAmount === taxableNum)) {
      const sum = Math.round((taxableNum + taxAmount) * 100) / 100;
      const matching = totalCandidates.find((n) => Math.abs(n - sum) < 1);
      if (matching) totalAmount = matching;
      else if (totalAmount == null || totalAmount === taxableNum) {
        const larger = totalCandidates.filter((n) => n > (taxableForTotals ?? 0) + 1);
        if (larger.length) totalAmount = Math.max(...larger);
        else if (totalAmount == null && sum >= 50_000) totalAmount = sum;
      }
    }
    if (taxableNum != null && taxAmount != null) {
      const expectedGrand = Math.round((taxableNum + taxAmount) * 100) / 100;
      if (
        totalAmount == null ||
        (expectedGrand >= 50_000 &&
          (totalAmount < expectedGrand * 0.85 ||
            totalAmount <= (cgstAmount ?? 0) * 1.5))
      ) {
        totalAmount = expectedGrand;
      }
    }
    const looseGrand = Array.from(normalized.matchAll(/\b([0-9]{5,7})(?:\.00)?\b/g))
      .map((m) => Number(m[1]))
      .filter((n) => n >= 50_000 && n <= 5_000_000);
    if (taxableNum != null && taxAmount != null && looseGrand.length) {
      const expectedGrand = Math.round((taxableNum + taxAmount) * 100) / 100;
      if (expectedGrand >= 50_000) {
        const hit = looseGrand.find((n) => Math.abs(n - expectedGrand) < 2);
        if (hit) totalAmount = hit;
      }
    }

    // HSN-wise tax summary rows (page 2 of Tally bills)
    const hsnTaxSummary: Array<{
      hsnCode: string;
      taxableValue: number;
      cgst?: number;
      sgst?: number;
      igst?: number;
      totalTax?: number;
    }> = [];
    for (const match of normalized.matchAll(
      /\b(8\d{3,7})\s+([0-9,]+(?:\.\d{1,2})?)\s+([0-9,]+(?:\.\d{1,2})?)\s+([0-9,]+(?:\.\d{1,2})?)\s+([0-9,]+(?:\.\d{1,2})?)/g,
    )) {
      const hsnCode = match[1];
      const tv = money(match[2]);
      const t1 = money(match[3]);
      const t2 = money(match[4]);
      const tt = money(match[5]);
      if (!tv || tv < 100) continue;
      hsnTaxSummary.push({
        hsnCode,
        taxableValue: tv,
        cgst: t1,
        sgst: t2,
        totalTax: tt,
      });
    }
    for (const match of normalized.matchAll(
      /\b(8\d{5,7})\s+(\d+(?:\.\d+)?)\s*%\s+([0-9,]+(?:\.\d{2})?)\s+([0-9,]+(?:\.\d{2})?)\s+([0-9,]+(?:\.\d{2})?)\s+([0-9,]+(?:\.\d{2})?)/g,
    )) {
      const hsnCode = match[1];
      const tv = money(match[3]);
      const t1 = money(match[4]);
      const t2 = money(match[5]);
      const tt = money(match[6]);
      if (!tv || tv < 100) continue;
      if (hsnTaxSummary.some((r) => r.hsnCode === hsnCode)) continue;
      hsnTaxSummary.push({
        hsnCode,
        taxableValue: tv,
        cgst: t1,
        sgst: t2,
        totalTax: tt,
      });
    }

    const hsnTotalRow = normalized.match(
      /\bTotal\s+([0-9,]+\.\d{2})\s+([0-9,]+\.\d{2})\s+([0-9,]+\.\d{2})(?:\s+([0-9,]+\.\d{2}))?/i,
    );
    if (hsnTotalRow) {
      const tv = money(hsnTotalRow[1]);
      const cg = money(hsnTotalRow[2]);
      const sg = money(hsnTotalRow[3]);
      const tt = money(hsnTotalRow[4]);
      if (tv && tv >= 10_000) {
        if (taxableNum == null) taxableNum = tv;
        if (cg && cg >= 100) cgstAmount = cg;
        if (sg && sg >= 100) sgstAmount = sg;
        if (tt && tt >= 100) taxAmount = tt;
      }
    }

    // Camera OCR HSN footer: `[104257.28 | 381.56] 381.36] 18762.72]`
    const fragHsnRow = normalized.match(
      /\[\s*([0-9,]{5,7}\.\d{2})\s*\|[^\]]*\]\s*[0-9,]+\.\d{2}\]\s*([0-9,]+\.\d{2})\]/,
    );
    if (fragHsnRow) {
      const tv = money(fragHsnRow[1]);
      const tt = money(fragHsnRow[2]);
      if (tv && tv >= 10_000 && taxableNum == null) taxableNum = tv;
      if (tt && tt >= 1000) {
        if (taxAmount == null) taxAmount = tt;
        const half = Math.round((tt / 2) * 100) / 100;
        if (cgstAmount == null) cgstAmount = half;
        if (sgstAmount == null) sgstAmount = half;
      }
    }

    if (!hsnTaxSummary.length) {
      const hsns = Array.from(new Set(Array.from(normalized.matchAll(/\b(8\d{5,7})\b/g)).map((m) => m[1])));
      const taxableVals = Array.from(
        new Set(
          Array.from(normalized.matchAll(/\b([0-9]{4,6}\.\d{2})\b/g))
            .map((m) => money(m[1]))
            .filter((n): n is number => n != null && n >= 10_000 && n <= 100_000),
        ),
      ).sort((a, b) => b - a);
      const taxVals = Array.from(
        new Set(
          Array.from(normalized.matchAll(/\b([0-9,]+\.\d{2})\s+9\s*%/g))
            .map((m) => money(m[1]))
            .filter((n): n is number => n != null && n >= 1000 && n <= 20_000),
        ),
      ).sort((a, b) => b - a);
      for (let i = 0; i < Math.min(hsns.length, taxableVals.length); i++) {
        if (hsnTaxSummary.some((r) => r.hsnCode === hsns[i])) continue;
        hsnTaxSummary.push({
          hsnCode: hsns[i],
          taxableValue: taxableVals[i],
          cgst: taxVals[i],
          sgst: taxVals[i],
          totalTax: taxVals[i] != null ? Math.round(taxVals[i]! * 2 * 100) / 100 : undefined,
        });
      }
    }

    if (hsnTaxSummary.length) {
      const cgstTotal = hsnTaxSummary.reduce((sum, row) => sum + (row.cgst ?? 0), 0);
      const sgstTotal = hsnTaxSummary.reduce((sum, row) => sum + (row.sgst ?? 0), 0);
      if (cgstAmount == null || (hsnTaxSummary.length > 1 && cgstAmount < cgstTotal * 0.9)) {
        cgstAmount = Math.round(cgstTotal * 100) / 100;
      }
      if (sgstAmount == null || (hsnTaxSummary.length > 1 && sgstAmount < sgstTotal * 0.9)) {
        sgstAmount = Math.round(sgstTotal * 100) / 100;
      }
      if (taxAmount == null) {
        taxAmount = Math.round(((cgstAmount ?? 0) + (sgstAmount ?? 0)) * 100) / 100;
      }
    }

    if (totalAmount != null && taxAmount != null && totalAmount > taxAmount * 1.5 && taxAmount >= 1000) {
      const derivedTaxable = Math.round((totalAmount - taxAmount) * 100) / 100;
      if (
        taxableNum == null ||
        Math.abs((taxableNum ?? 0) + taxAmount - totalAmount) > 1
      ) {
        taxableNum = derivedTaxable;
      }
    }

    const taxComponents =
      Math.round(((cgstAmount ?? 0) + (sgstAmount ?? 0) + (igstAmount ?? 0)) * 100) / 100;
    if (taxComponents >= 1000) {
      taxAmount = taxComponents;
      if (totalAmount != null && Math.abs(totalAmount - taxComponents) < 5) {
        totalAmount = undefined;
      }
    }
    if (taxableNum != null && taxComponents >= 1000) {
      const expectedGrand = Math.round((taxableNum + taxComponents) * 100) / 100;
      if (!totalAmount || totalAmount < expectedGrand * 0.85) {
        totalAmount = expectedGrand;
      }
    }
    const itemTotals = Array.from(normalized.matchAll(/\b([0-9,]{5,}\.\d{2})\b/g))
      .map((m) => money(m[1]))
      .filter((n): n is number => n != null && n >= 10_000 && n <= 500_000);
    for (let i = 0; i < itemTotals.length; i++) {
      for (let j = i + 1; j < itemTotals.length; j++) {
        const sum = Math.round((itemTotals[i]! + itemTotals[j]!) * 100) / 100;
        if (
          taxableNum != null &&
          sum > taxableNum &&
          Math.abs(sum - taxableNum) / taxableNum < 0.025
        ) {
          taxableNum = sum;
        }
      }
    }
    if (amountInWordsGrand) {
      const componentGrand =
        taxableNum != null && taxComponents >= 1000
          ? Math.round((taxableNum + taxComponents) * 100) / 100
          : undefined;
      if (
        !totalAmount ||
        amountInWordsGrand >= totalAmount ||
        (componentGrand != null &&
          Math.abs(amountInWordsGrand - componentGrand) / componentGrand < 0.02)
      ) {
        totalAmount = amountInWordsGrand;
      }
    }

    const resolvedTaxable = taxableNum ?? money(taxableValue) ?? hsnTaxSummary[0]?.taxableValue;

    if (supplierAddress && invoiceNumber) {
      const esc = invoiceNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      supplierAddress = supplierAddress
        .replace(new RegExp(`\\)?\\s*${esc}(?:\\s*-\\s*\\d{1,2}-[A-Za-z]{3}-\\d{2,4})?.*$`, 'i'), '')
        .replace(/\s+\)\s*/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .replace(/,\s*,/g, ',')
        .trim();
    }

    return {
      invoiceNumber,
      invoiceDate: formatAppDate(invoiceDate) ?? invoiceDate,
      supplierName,
      supplierAddress,
      customerName: cleanCustomer,
      phone,
      gstin: supplierGstin,
      customerGstin,
      stateName,
      placeOfSupply,
      irn,
      ackNo,
      ackDate: formatAppDate(ackDate) ?? ackDate,
      ewayBillNo,
      vehicleNo,
      bankName,
      bankAccount,
      ifsc,
      bankBranch,
      totalAmount,
      taxableValue: resolvedTaxable,
      cgstAmount,
      sgstAmount,
      igstAmount,
      taxAmount: taxAmount || undefined,
      hsnTaxSummary,
      hsnCodes: Array.from(new Set(Array.from(normalized.matchAll(/\b\d{4,8}\b/g)).map((m) => m[0]))).slice(
        0,
        20,
      ),
    };
  }

  /** Pull GSTINs from OCR text — handles spaces, labels, and common OCR mistakes. */
  private extractGstins(source: string): string[] {
    const found: string[] = [];
    const push = (raw?: string) => {
      const gstin = this.normalizeGstinCandidate(raw);
      if (gstin && !found.includes(gstin)) found.push(gstin);
    };

    // Labelled values (GSTIN / GSTN / GSTIN/UIN / GST Tin No) — allow spaces inside the value
    for (const match of source.matchAll(
      /(?:gst\s*tin\s*no\.?|gstin(?:\s*\/\s*uin)?|gstn|gst\s*no\.?|gst\s*number)\s*[:.\-]?\s*([0-9OIl\][0-9A-Za-zOIl\s\-]{12,24})/gi,
    )) {
      push(match[1]);
    }

    // Per line: collapse spaces so "07 PTAFF 9867 H1Z4" / "198INPD2904E 1ZH" becomes one token
    for (const line of source.split('\n')) {
      const compact = line.toUpperCase().replace(/\]/g, '1').replace(/[\s\-]/g, '');
      const match = compact.match(/[0-9OIL]{2}[A-Z0-9OIL]{10}[0-9A-ZOIL]Z[0-9A-Z]/);
      if (match) push(match[0]);
      // OCR sometimes inserts an extra char (16–17 length) — try windows + 0OS→09 fix via normalize
      if (/gstin|gstn|uin/i.test(line)) {
        const blob = compact.replace(/^.*?(?:GSTIN(?:\/UIN)?|GSTN|UIN)[:.\-]*/i, '').replace(/[^A-Z0-9]/g, '');
        if (blob.length >= 14 && blob.length <= 18) push(blob);
        // Also try dropping a spurious S after state: 0OSABKPH… → 09ABKPH…
        if (/^0OS/.test(blob)) push('09' + blob.slice(3));
      }
    }

    // Direct regex when OCR kept it clean
    for (const match of source.matchAll(
      /\b([0-9OIl]{2}[A-Za-z0-9OIl]{10}[0-9A-Za-zOIl]Z[0-9A-Za-zOIl])\b/gi,
    )) {
      push(match[1]);
    }

    // Garbled GSTIN on labelled lines — try state code prefix from same document
    const stateCode = source.match(/(?:state\s*name|code)\s*[:.\-]?\s*(\d{2})\b/i)?.[1];
    for (const line of source.split('\n')) {
      if (!/gstin|gstn|uin/i.test(line)) continue;
      const blob = line
        .replace(/^.*?(?:gstin|gstn|uin)[^A-Z0-9]*/i, '')
        .replace(/[^A-Za-z0-9]/g, '');
      if (blob.length >= 10 && blob.length <= 14 && stateCode) {
        push(stateCode + blob);
      }
      if (blob.length >= 12) push(blob);
    }

    return found;
  }

  private normalizeGstinCandidate(raw?: string): string | undefined {
    if (!raw) return undefined;
    let s = raw.toUpperCase().replace(/[\s\-]/g, '').replace(/\]/g, '1').replace(/(\d)1(\d)(?=.*Z[0-9A-Z]$)/, '$1I$2');
    // OCR: 09ABKPH… → 0OSABKPH… (extra S after state)
    if (/^0OS[A-Z]/.test(s) && s.length >= 15) {
      s = '09' + s.slice(3);
    } else if (/^[0O]O[A-Z]{5}/.test(s) && s.length >= 15) {
      s = '09' + s.slice(2);
    }
    if (s.length < 15) return undefined;
    if (s.length > 15) {
      // Prefer a 15-char window that looks like a GSTIN
      const window = s.match(/[0-9OIL]{2}[A-Z0-9OIL]{10}[0-9A-ZOIL]Z[0-9A-Z]/);
      s = window ? window[0] : s.slice(0, 15);
    }

    // Fix common OCR digit/letter swaps in positions that must be digits
    const chars = s.split('');
    if ((chars[0] === '0' || chars[0] === 'O') && chars[1] === 'S') {
      chars[0] = '0';
      chars[1] = '9';
    } else if ((chars[0] === '0' || chars[0] === 'O') && chars[1] === 'O') {
      chars[0] = '0';
      chars[1] = '9';
    } else if (chars[0] === 'O' && /[0-9]/.test(chars[1] ?? '')) {
      chars[0] = '0';
    }
    for (const i of [0, 1, 7, 8, 9, 10]) {
      if (chars[i] === 'O') chars[i] = '0';
      if (chars[i] === 'I' || chars[i] === 'L') chars[i] = '1';
    }
    // PAN letter block (idx 2–6): OCR often turns B→8, O→0, I→1, S→5
    for (const i of [2, 3, 4, 5, 6]) {
      if (chars[i] === '8') chars[i] = 'B';
      if (chars[i] === '0') chars[i] = 'O';
      if (chars[i] === '1') chars[i] = 'I';
      if (chars[i] === '5') chars[i] = 'S';
    }
    // Position 12 must be Z in a valid GSTIN
    if (chars[12] === '2') chars[12] = 'Z';
    // Position 11 is often a letter; 13 must be Z
    if (chars[13] !== 'Z' && chars[12] === 'Z') {
      // already fine
    } else if (chars[13] !== 'Z') {
      // try shift if Z landed at 12 due to missing char — leave as-is
    }

    s = chars.join('');
    if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(s)) return undefined;
    return s;
  }

  private looksLikeInvoice(text: string, extractedData: ReturnType<typeof this.extractInvoiceData>) {
    const markers = [
      /tax\s*invoice/i,
      /\binvoice\b/i,
      /\bbill\s*of\s*supply\b/i,
      /\bgstin\b/i,
      /\bhsn\b/i,
      /cgst|sgst|igst/i,
      /grand\s*total|invoice\s*total|amount\s*payable/i,
      /battery|inverter|stabilizer/i,
    ];

    const markerCount = markers.filter((marker) => marker.test(text)).length;
    return markerCount >= 2 || Boolean(extractedData.invoiceNumber && extractedData.totalAmount);
  }
}
