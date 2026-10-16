import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { InvoiceType, PaymentMethod, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { calculateInvoice, buildInvoiceQrPayload, parseInvoiceQrPayload, invoiceQrImageUrl, encodeTextAsQrImage, mergeInvoiceDisplayOptions, resolveEffectiveDisplayOptions, isEinvoiceComplianceConfigured, isLiveIrn, mapUnitToUqc, formatIndianAddress } from '@retail-sarathi/gst-engine';
import { CreateInvoiceDto } from './dto/invoice.dto';
import { WholesaleService } from '../wholesale/wholesale.service';
import { AccountingService } from '../accounting/accounting.service';
import { CustomersService } from '../customers/customers.service';
import { InvoiceNumberingService } from './invoice-numbering.service';
import { formatAppDate } from '../scan/invoice-parse-utils';
import { resolveTemplateForChannel } from '../billing/billing-templates';
import { PdfRendererService } from '../pdf/pdf-renderer.service';
// Print HTML engine lives in @retail-sarathi/ui (no React). Loaded via require so Nest
// CommonJS resolution does not pull the React UI entrypoint.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { renderInvoiceHtml } = require('@retail-sarathi/ui/invoice-templates') as {
  renderInvoiceHtml: (data: Record<string, unknown>, templateId?: string) => string;
};
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { combinePrintDocuments } = require('@retail-sarathi/ui/print') as {
  combinePrintDocuments: (documents: string[]) => string;
};

@Injectable()
export class InvoicesService {
  constructor(
    private prisma: PrismaService,
    private wholesale: WholesaleService,
    private accounting: AccountingService,
    private customers: CustomersService,
    private numbering: InvoiceNumberingService,
    private pdfRenderer: PdfRendererService,
  ) {}

  /** FEFO (first-expiry-first-out) stock decrement for a trackBatch product — replaces the single
      stockLedger SALE row with one row per batch actually touched, so a line that spans two
      batches produces two ledger rows instead of losing that detail. `Product.stockQty` is still
      decremented separately by the caller exactly as for a non-batch product; batches are a
      sub-ledger, not a replacement for it. Throws if the tracked batches can't cover the full
      quantity (should be rare — it means ProductBatch has drifted from stockQty). */
  private async consumeBatchesFefo(
    tx: Prisma.TransactionClient,
    tenantId: string,
    productId: string,
    productName: string,
    invoiceId: string,
    invoiceLineId: string,
    quantity: number,
  ) {
    const batches = await tx.productBatch.findMany({
      where: { tenantId, productId, quantity: { gt: 0 } },
      orderBy: [{ expiryDate: 'asc' }, { batchNumber: 'asc' }],
    });
    let remaining = quantity;
    for (const batch of batches) {
      if (remaining <= 0.0001) break;
      const take = Math.min(remaining, Number(batch.quantity));
      if (take <= 0) continue;
      const updated = await tx.productBatch.updateMany({
        where: { id: batch.id, quantity: { gte: take } },
        data: { quantity: { decrement: take } },
      });
      if (updated.count === 0) continue; // lost a race to another sale — try the next batch
      await tx.stockLedger.create({
        data: {
          tenantId,
          productId,
          type: 'SALE',
          quantity: -take,
          referenceId: invoiceId,
          invoiceLineId,
          batchId: batch.id,
          notes: `Batch ${batch.batchNumber}`,
        },
      });
      remaining -= take;
    }
    if (remaining > 0.0001) {
      throw new BadRequestException(
        `${productName}: tracked batches only cover ${quantity - remaining} of ${quantity} units — add/correct a batch first`,
      );
    }
  }

  /** Reverses batch consumption for a cancelled/returned invoice line — looks up exactly which
      batches that line's sale touched (via `invoiceLineId` on the SALE ledger rows) and restores
      them LIFO (most-recently-consumed batch first) up to `restoreQty`, which may be less than the
      full line quantity for a partial credit-note return. */
  private async restoreBatchesForLine(
    tx: Prisma.TransactionClient,
    tenantId: string,
    productId: string,
    invoiceLineId: string,
    restoreQty: number,
  ) {
    const consumed = await tx.stockLedger.findMany({
      where: { invoiceLineId, type: 'SALE', batchId: { not: null } },
      orderBy: { createdAt: 'desc' },
    });
    let remaining = restoreQty;
    for (const row of consumed) {
      if (remaining <= 0.0001) break;
      const consumedQty = Math.abs(Number(row.quantity));
      const restore = Math.min(remaining, consumedQty);
      if (restore <= 0 || !row.batchId) continue;
      await tx.productBatch.update({
        where: { id: row.batchId },
        data: { quantity: { increment: restore } },
      });
      await tx.stockLedger.create({
        data: {
          tenantId,
          productId,
          type: 'RETURN',
          quantity: restore,
          referenceId: row.referenceId,
          invoiceLineId,
          batchId: row.batchId,
          notes: 'Batch restore on return/cancel',
        },
      });
      remaining -= restore;
    }
  }

  /** A sale paid partly on CREDIT (udhaar) didn't collect that portion as cash. */
  private cashCreditSplit(
    payments: Array<{ method: string; amount: unknown }>,
    grandTotal: number,
  ): { cashAmount: number; creditAmount: number } {
    const creditAmount = payments
      .filter((p) => p.method === 'CREDIT')
      .reduce((s, p) => s + Number(p.amount), 0);
    return { cashAmount: Math.max(0, grandTotal - creditAmount), creditAmount };
  }

  async findAll(
    tenantId: string,
    page = 1,
    pageSize = 50,
    opts?: {
      status?: string;
      search?: string;
      dateFrom?: string;
      dateTo?: string;
      type?: string;
      paymentMethod?: string;
      sortBy?: string;
      sortDir?: string;
    },
  ) {
    const allowedStatus = new Set(['DRAFT', 'FINALIZED', 'CANCELLED']);
    const allowedType = new Set(['TAX_INVOICE', 'BILL_OF_SUPPLY', 'DELIVERY_CHALLAN', 'CREDIT_NOTE']);
    const allowedPay = new Set(['CASH', 'UPI', 'CARD', 'CREDIT', 'BANK_TRANSFER', 'EMI']);

    const status = opts?.status?.trim();
    const type = opts?.type?.trim();
    const paymentMethod = opts?.paymentMethod?.trim();
    const search = opts?.search?.trim();
    const sortDir = opts?.sortDir?.toLowerCase() === 'asc' ? 'asc' : 'desc';
    const sortBy = opts?.sortBy?.trim() || 'createdAt';

    const createdAt: Prisma.DateTimeFilter = {};
    if (opts?.dateFrom) {
      const from = new Date(`${opts.dateFrom}T00:00:00.000`);
      if (!Number.isNaN(from.getTime())) createdAt.gte = from;
    }
    if (opts?.dateTo) {
      const to = new Date(`${opts.dateTo}T23:59:59.999`);
      if (!Number.isNaN(to.getTime())) createdAt.lte = to;
    }

    const where: Prisma.InvoiceWhereInput = {
      tenantId,
      ...(status && allowedStatus.has(status) ? { status: status as any } : {}),
      ...(type && allowedType.has(type) ? { type: type as any } : {}),
      ...(Object.keys(createdAt).length ? { createdAt } : {}),
      ...(paymentMethod && allowedPay.has(paymentMethod)
        ? { payments: { some: { method: paymentMethod as any } } }
        : {}),
      ...(search
        ? {
            OR: [
              { invoiceNumber: { contains: search, mode: 'insensitive' } },
              { notes: { contains: search, mode: 'insensitive' } },
              { customer: { name: { contains: search, mode: 'insensitive' } } },
              { customer: { phone: { contains: search } } },
              { customer: { email: { contains: search, mode: 'insensitive' } } },
              { customer: { gstin: { contains: search, mode: 'insensitive' } } },
            ],
          }
        : {}),
    };

    const orderByMap: Record<string, Prisma.InvoiceOrderByWithRelationInput> = {
      createdAt: { createdAt: sortDir },
      updatedAt: { updatedAt: sortDir },
      invoiceNumber: { invoiceNumber: sortDir },
      grandTotal: { grandTotal: sortDir },
      status: { status: sortDir },
      type: { type: sortDir },
      customer: { customer: { name: sortDir } },
    };
    const orderBy = orderByMap[sortBy] ?? { createdAt: 'desc' };

    const take = Math.min(Math.max(pageSize, 1), 200);
    const [items, total] = await Promise.all([
      this.prisma.invoice.findMany({
        where,
        skip: (page - 1) * take,
        take,
        orderBy,
        include: { customer: true, payments: true, lines: true },
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return { items, total, page, pageSize: take };
  }

  async findOne(tenantId: string, id: string) {
    const invoice = await this.prisma.invoice.findFirst({
      where: { id, tenantId },
      include: {
        customer: true,
        payments: true,
        lines: { include: { product: { select: { unit: true } } } },
        branch: true,
        originalInvoice: {
          select: {
            id: true,
            invoiceNumber: true,
            grandTotal: true,
            createdAt: true,
          },
        },
        creditNotes: {
          where: { status: 'FINALIZED' },
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            invoiceNumber: true,
            grandTotal: true,
            processingFee: true,
            createdAt: true,
            notes: true,
          },
        },
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    return invoice;
  }

  /** Returned qty per original line (supports partial / multiple returns). */
  private async computeReturnedQtyByLine(
    tenantId: string,
    originalInvoiceId: string,
    originalLines: Array<{ id: string; productId: string | null; productName: string; quantity: unknown }>,
  ) {
    const creditNotes = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        originalInvoiceId,
        status: 'FINALIZED',
        type: 'CREDIT_NOTE',
      },
      include: { lines: true },
    });

    const returnedByLine: Record<string, number> = {};
    for (const cn of creditNotes) {
      for (const line of cn.lines) {
        let srcId = line.sourceInvoiceLineId;
        if (!srcId) {
          const match = originalLines.find(
            (ol) =>
              ol.productId === line.productId &&
              ol.productName === line.productName,
          );
          srcId = match?.id ?? null;
        }
        if (srcId) {
          returnedByLine[srcId] = (returnedByLine[srcId] ?? 0) + Number(line.quantity);
        }
      }
    }
    return { creditNotes, returnedByLine };
  }

  async getReturnSummary(tenantId: string, invoiceId: string) {
    const original = await this.findOne(tenantId, invoiceId);
    if (original.type !== 'TAX_INVOICE') {
      throw new BadRequestException('Return summary is only for tax invoices');
    }

    const { creditNotes, returnedByLine } = await this.computeReturnedQtyByLine(
      tenantId,
      invoiceId,
      original.lines,
    );

    const totalReturned = creditNotes.reduce((s, cn) => s + Number(cn.grandTotal), 0);
    const totalProcessingFees = creditNotes.reduce(
      (s, cn) => s + Number(cn.processingFee ?? 0),
      0,
    );
    const netRefunded = totalReturned - totalProcessingFees;

    return {
      originalInvoiceId: invoiceId,
      originalInvoiceNumber: original.invoiceNumber,
      originalGrandTotal: Number(original.grandTotal),
      creditNotes: creditNotes.map((cn) => ({
        id: cn.id,
        invoiceNumber: cn.invoiceNumber,
        grandTotal: Number(cn.grandTotal),
        processingFee: Number(cn.processingFee ?? 0),
        netRefund: Number(cn.grandTotal) - Number(cn.processingFee ?? 0),
        createdAt: cn.createdAt,
        notes: cn.notes,
      })),
      lines: original.lines.map((l) => {
        const soldQty = Number(l.quantity);
        const returnedQty = returnedByLine[l.id] ?? 0;
        return {
          invoiceLineId: l.id,
          productName: l.productName,
          soldQty,
          returnedQty,
          remainingQty: Math.max(0, soldQty - returnedQty),
        };
      }),
      totalReturned,
      totalProcessingFees,
      netRefunded,
      netSalesValue: Number(original.grandTotal) - totalReturned,
      itrGuidance: {
        keepOriginalInvoice: true,
        fileCreditNoteInGstr1: true,
        netTurnoverNote:
          'For ITR/GST: keep the original tax invoice on record. Issue this credit note to reverse the supply. Net turnover = original invoice value minus credit note value(s).',
      },
    };
  }

  async create(tenantId: string, branchId: string, dto: CreateInvoiceDto) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    if (!dto.lines?.length) {
      throw new BadRequestException('Add at least one line item');
    }

    // Retry-safe creation: a Desktop/Mobile client that lost the response to an earlier
    // successful POST (dropped connection) can safely retry with the same key instead of
    // double-billing — return the original invoice rather than creating a duplicate.
    if (dto.idempotencyKey) {
      const existing = await this.prisma.invoice.findUnique({
        where: { idempotencyKey: dto.idempotencyKey },
        include: { lines: true, payments: true, customer: true },
      });
      if (existing && existing.tenantId === tenantId) return existing;
    }

    let customerState: string | undefined;
    let customerSegment: string | undefined;
    let customerCreditLimit = 0;
    let customerOutstanding = 0;
    if (dto.customerId) {
      const customer = await this.prisma.customer.findFirst({
        where: { id: dto.customerId, tenantId },
      });
      if (!customer) throw new BadRequestException('Customer not found');
      customerState = customer.stateCode ?? undefined;
      customerSegment = customer.segment;
      customerCreditLimit = Number(customer.creditLimit);
      customerOutstanding = Number(customer.outstandingBalance);
    }

    const priceListType = this.wholesale.segmentToPriceListType(customerSegment);
    const isWholesale = dto.isWholesale ?? priceListType !== 'RETAIL';

    const lineInputs = await Promise.all(
      dto.lines.map(async (line) => {
        const product = line.productId
          ? await this.prisma.product.findFirst({ where: { id: line.productId, tenantId } })
          : null;

        let unitPrice = line.unitPrice;
        if (unitPrice == null && line.productId) {
          unitPrice = await this.wholesale.getPriceForProduct(
            tenantId,
            line.productId,
            priceListType,
            line.quantity,
          );
        }
        if (unitPrice == null) {
          unitPrice = Number(product?.salePrice ?? 0);
        }

        return {
          productId: line.productId,
          productName: line.productName ?? product?.name ?? 'Item',
          productSku: line.productSku ?? product?.sku ?? undefined,
          productBarcode: line.productBarcode ?? product?.barcode ?? undefined,
          hsnCode: line.hsnCode ?? product?.hsnCode ?? '8517',
          unit: line.unit ?? product?.unit ?? 'pcs',
          quantity: line.quantity,
          unitPrice,
          discount: line.discount ?? 0,
          gstRate: line.gstRate ?? Number(product?.gstRate ?? 18),
          trackSerial: product?.trackSerial ?? false,
          trackBatch: product?.trackBatch ?? false,
          costPriceSnapshot: product ? Number(product.purchasePrice) : 0,
        };
      }),
    );

    const totals = calculateInvoice(
      lineInputs.map(({ trackSerial: _t, trackBatch: _b, ...rest }) => rest),
      tenant.stateCode,
      customerState,
    );

    const loyaltyRedeem = Math.max(0, Math.floor(Number(dto.loyaltyPointsToRedeem ?? 0)));
    if (loyaltyRedeem > 0 && !dto.customerId) {
      throw new BadRequestException('Select a customer to redeem loyalty points');
    }
    const payableTotal = Math.round((Number(totals.grandTotal) - loyaltyRedeem) * 100) / 100;
    if (payableTotal < -0.01) {
      throw new BadRequestException('Loyalty redeem exceeds bill total');
    }

    // Payment total must match payable total (±1 paisa) when finalizing
    const payments = dto.payments ?? [];
    const willFinalize = !(dto.status === 'DRAFT' || dto.status === 'HELD');
    if (willFinalize) {
      if (!payments.length) {
        throw new BadRequestException('Add at least one payment');
      }
      const paySum = payments.reduce((s, p) => s + Number(p.amount), 0);
      if (Math.abs(paySum - payableTotal) > 0.05) {
        throw new BadRequestException(
          `Payments (₹${paySum.toFixed(2)}) must equal bill total (₹${payableTotal.toFixed(2)})`,
        );
      }
    }

    const creditAmount = payments
      .filter((p) => p.method === 'CREDIT')
      .reduce((s, p) => s + Number(p.amount), 0);
    if (creditAmount > 0) {
      if (!dto.customerId) {
        throw new BadRequestException('Customer required for credit sale');
      }
      if (customerCreditLimit > 0 && customerOutstanding + creditAmount > customerCreditLimit + 0.01) {
        throw new BadRequestException(
          `Credit limit exceeded. Limit ₹${customerCreditLimit}, outstanding ₹${customerOutstanding}`,
        );
      }
    }

    // Serial enforcement for trackSerial products
    for (let i = 0; i < lineInputs.length; i++) {
      const li = lineInputs[i];
      if (li.trackSerial && li.productId) {
        const serials = dto.lines[i]?.serialNumbers ?? [];
        if (serials.length !== Math.floor(li.quantity)) {
          throw new BadRequestException(
            `${li.productName}: select ${Math.floor(li.quantity)} serial/IMEI number(s)`,
          );
        }
      }
    }

    const status =
      dto.status === 'DRAFT' || dto.status === 'HELD' ? 'DRAFT' : 'FINALIZED';
    const shouldAffectStock = status === 'FINALIZED';

    let invoice;
    try {
      invoice = await this.prisma.$transaction(async (tx) => {
      const invoiceNumber = await this.numbering.allocate(tx, tenantId, 'TAX_INVOICE');

      const created = await tx.invoice.create({
        data: {
          tenantId,
          branchId: branchId ?? dto.branchId!,
          customerId: dto.customerId,
          invoiceNumber,
          type: (dto.type as InvoiceType) ?? 'TAX_INVOICE',
          status: status as any,
          supplyType: totals.supplyType,
          subtotal: totals.subtotal,
          totalDiscount: Number(totals.totalDiscount) + loyaltyRedeem,
          totalCgst: totals.totalCgst,
          totalSgst: totals.totalSgst,
          totalIgst: totals.totalIgst,
          grandTotal: Math.max(0, payableTotal),
          isWholesale,
          idempotencyKey: dto.idempotencyKey || undefined,
          notes: dto.notes
            ? loyaltyRedeem
              ? `${dto.notes} | Loyalty −₹${loyaltyRedeem}`
              : dto.notes
            : loyaltyRedeem
              ? `Loyalty redeem −₹${loyaltyRedeem}`
              : undefined,
          lines: {
            create: totals.lines.map((l, i) => ({
              productId: l.productId,
              productName: l.productName,
              productSku: lineInputs[i]?.productSku ?? null,
              productBarcode: lineInputs[i]?.productBarcode ?? null,
              hsnCode: l.hsnCode,
              unit: lineInputs[i]?.unit ?? 'pcs',
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              discount: l.discount,
              gstRate: l.gstRate,
              cgst: l.cgst,
              sgst: l.sgst,
              igst: l.igst,
              taxableAmount: l.taxableAmount,
              total: l.total,
              serialNumbers: dto.lines[i]?.serialNumbers ?? [],
              costPriceSnapshot: lineInputs[i]?.costPriceSnapshot ?? 0,
            })),
          },
          payments: payments.length
            ? {
                create: payments.map((p) => ({
                  method: p.method as PaymentMethod,
                  amount: p.amount,
                  reference: p.reference,
                })),
              }
            : undefined,
        },
        include: { lines: true, payments: true, customer: true },
      });

      if (shouldAffectStock) {
        for (let i = 0; i < dto.lines.length; i++) {
          const line = dto.lines[i];
          if (!line.productId) continue;

          const updated = await tx.product.updateMany({
            where: {
              id: line.productId,
              tenantId,
              stockQty: { gte: line.quantity },
            },
            data: { stockQty: { decrement: line.quantity } },
          });
          if (updated.count === 0) {
            throw new BadRequestException(
              `Insufficient stock for ${line.productName ?? line.productId}`,
            );
          }

          if (lineInputs[i]?.trackBatch) {
            await this.consumeBatchesFefo(
              tx,
              tenantId,
              line.productId,
              line.productName ?? lineInputs[i]?.productName ?? 'Item',
              created.id,
              created.lines[i]!.id,
              line.quantity,
            );
          } else {
            await tx.stockLedger.create({
              data: {
                tenantId,
                productId: line.productId,
                type: 'SALE',
                quantity: -line.quantity,
                referenceId: created.id,
                invoiceLineId: created.lines[i]?.id,
              },
            });
          }

          // Mark serials SOLD when provided
          const serials = line.serialNumbers ?? [];
          for (const sn of serials) {
            const serial = await tx.productSerial.findFirst({
              where: {
                productId: line.productId,
                serialNumber: sn,
                status: 'IN_STOCK',
              },
            });
            if (!serial) {
              throw new BadRequestException(`Serial/IMEI not in stock: ${sn}`);
            }
            await tx.productSerial.update({
              where: { id: serial.id },
              data: { status: 'SOLD' },
            });
          }

          // Branch stock, enforced as a hard floor only when a tenant has opted into per-branch
          // tracking for this product (a BranchStock row exists — via branch init or a received
          // transfer). Without a row, a single-branch tenant's sale is governed by the global
          // Product.stockQty check above only, same as before.
          if (branchId || dto.branchId) {
            const bid = branchId ?? dto.branchId!;
            const branchStockRow = await tx.branchStock.findUnique({
              where: { branchId_productId: { branchId: bid, productId: line.productId } },
            });
            if (branchStockRow) {
              const updatedBranch = await tx.branchStock.updateMany({
                where: {
                  branchId: bid,
                  productId: line.productId,
                  quantity: { gte: line.quantity },
                },
                data: { quantity: { decrement: line.quantity } },
              });
              if (updatedBranch.count === 0) {
                throw new BadRequestException(
                  `Insufficient stock for ${line.productName ?? line.productId} at this branch`,
                );
              }
            }
          }
        }

        if (dto.customerId && creditAmount > 0) {
          await tx.customer.update({
            where: { id: dto.customerId },
            data: { outstandingBalance: { increment: creditAmount } },
          });
          await this.customers.appendCustomerLedger(tx, {
            tenantId,
            customerId: dto.customerId,
            type: 'INVOICE',
            amount: creditAmount,
            invoiceId: created.id,
            notes: `Credit sale ${created.invoiceNumber}`,
            entryDate: created.createdAt,
          });
        }
      }

      if (loyaltyRedeem > 0 && dto.customerId) {
        const cust = await tx.customer.findUnique({ where: { id: dto.customerId } });
        if (!cust || cust.loyaltyPoints < loyaltyRedeem) {
          throw new BadRequestException('Insufficient loyalty points');
        }
        await tx.customer.update({
          where: { id: dto.customerId },
          data: { loyaltyPoints: { decrement: loyaltyRedeem } },
        });
        await tx.loyaltyTransaction.create({
          data: {
            tenantId,
            customerId: dto.customerId,
            points: -loyaltyRedeem,
            reason: `Redeemed on bill ${created.invoiceNumber}`,
            referenceId: created.id,
          },
        });
      }

      return created;
    });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        const target = (err.meta?.target as string[] | string | undefined) ?? '';
        if (dto.idempotencyKey && String(target).includes('idempotencyKey')) {
          // Two near-simultaneous retries with the same key raced past the pre-check above —
          // the DB's unique constraint caught it; return the row the other request created.
          const existing = await this.prisma.invoice.findUnique({
            where: { idempotencyKey: dto.idempotencyKey },
            include: { lines: true, payments: true, customer: true },
          });
          if (existing) return existing;
        }
        throw new ConflictException(
          'Invoice number conflict — please retry the sale (another counter may have used the same sequence).',
        );
      }
      throw err;
    }

    if (shouldAffectStock) {
      await this.accounting.autoPostSaleIfEnabled(
        tenantId,
        invoice.id,
        this.cashCreditSplit(invoice.payments, Number(invoice.grandTotal)),
      );
      if (dto.customerId) {
        await this.customers.earnLoyalty(
          tenantId,
          dto.customerId,
          Number(invoice.grandTotal),
          invoice.id,
        );
      }
      void this.notifyWhatsAppBill(tenantId, invoice.id).catch(() => undefined);
    }

    return invoice;
  }

  /** Hold bill as DRAFT without stock movement */
  async hold(tenantId: string, branchId: string, dto: CreateInvoiceDto) {
    return this.create(tenantId, branchId, { ...dto, status: 'DRAFT' });
  }

  async finalize(tenantId: string, id: string) {
    const invoice = await this.findOne(tenantId, id);
    if (invoice.status !== 'DRAFT') {
      throw new BadRequestException('Only draft/held bills can be finalized');
    }

    // Held bills can be created with no payments (e.g. desktop's hold flow); mirror
    // create()'s payment-total guard here so "finalize as-is" can't skip it.
    const paySum = invoice.payments.reduce((s, p) => s + Number(p.amount), 0);
    const payableTotal = Number(invoice.grandTotal);
    if (Math.abs(paySum - payableTotal) > 0.05) {
      throw new BadRequestException(
        `Payments (₹${paySum.toFixed(2)}) must equal bill total (₹${payableTotal.toFixed(2)}) — add payment to this draft before finalizing.`,
      );
    }

    // Re-run stock deduction path by converting via create-like logic
    return this.prisma.$transaction(async (tx) => {
      for (const line of invoice.lines) {
        if (!line.productId) continue;
        const qty = Number(line.quantity);
        const updated = await tx.product.updateMany({
          where: { id: line.productId, tenantId, stockQty: { gte: qty } },
          data: { stockQty: { decrement: qty } },
        });
        if (updated.count === 0) {
          throw new BadRequestException(`Insufficient stock for ${line.productName}`);
        }
        const product = await tx.product.findFirst({ where: { id: line.productId, tenantId }, select: { trackBatch: true } });
        if (product?.trackBatch) {
          await this.consumeBatchesFefo(tx, tenantId, line.productId, line.productName, invoice.id, line.id, qty);
        } else {
          await tx.stockLedger.create({
            data: {
              tenantId,
              productId: line.productId,
              type: 'SALE',
              quantity: -qty,
              referenceId: invoice.id,
              invoiceLineId: line.id,
            },
          });
        }

        for (const sn of line.serialNumbers ?? []) {
          const serial = await tx.productSerial.findFirst({
            where: { productId: line.productId, serialNumber: sn, status: 'IN_STOCK' },
          });
          if (!serial) {
            throw new BadRequestException(`Serial/IMEI not in stock: ${sn}`);
          }
          await tx.productSerial.update({
            where: { id: serial.id },
            data: { status: 'SOLD' },
          });
        }

        if (invoice.branchId) {
          const branchStockRow = await tx.branchStock.findUnique({
            where: { branchId_productId: { branchId: invoice.branchId, productId: line.productId } },
          });
          if (branchStockRow) {
            const updatedBranch = await tx.branchStock.updateMany({
              where: {
                branchId: invoice.branchId,
                productId: line.productId,
                quantity: { gte: qty },
              },
              data: { quantity: { decrement: qty } },
            });
            if (updatedBranch.count === 0) {
              throw new BadRequestException(`Insufficient stock for ${line.productName} at this branch`);
            }
          }
        }
      }

      const creditPaid = invoice.payments
        .filter((p) => p.method === 'CREDIT')
        .reduce((s, p) => s + Number(p.amount), 0);
      if (invoice.customerId && creditPaid > 0) {
        const customer = await tx.customer.findUnique({ where: { id: invoice.customerId } });
        if (customer) {
          const next = Number(customer.outstandingBalance) + creditPaid;
          const limit = Number(customer.creditLimit);
          if (limit > 0 && next > limit + 0.01) {
            throw new BadRequestException('Credit limit exceeded on finalize');
          }
          await tx.customer.update({
            where: { id: invoice.customerId },
            data: { outstandingBalance: { increment: creditPaid } },
          });
          await this.customers.appendCustomerLedger(tx, {
            tenantId,
            customerId: invoice.customerId,
            type: 'INVOICE',
            amount: creditPaid,
            invoiceId: invoice.id,
            notes: `Credit sale ${invoice.invoiceNumber}`,
            entryDate: new Date(),
          });
        }
      }

      return tx.invoice.update({
        where: { id },
        data: { status: 'FINALIZED' },
        include: { lines: true, payments: true, customer: true },
      });
    }).then(async (finalized) => {
      await this.accounting.autoPostSaleIfEnabled(
        tenantId,
        finalized.id,
        this.cashCreditSplit(finalized.payments, Number(finalized.grandTotal)),
      );
      if (finalized.customerId) {
        await this.customers.earnLoyalty(
          tenantId,
          finalized.customerId,
          Number(finalized.grandTotal),
          finalized.id,
        );
      }
      void this.notifyWhatsAppBill(tenantId, finalized.id).catch(() => undefined);
      return finalized;
    });
  }

  /**
   * POS grace undo: cancel a FINALIZED invoice only within `graceMinutes` of creation.
   * Restores stock / serials / credit via cancel(). After the window, use credit notes.
   */
  async undoWithinGrace(tenantId: string, id: string, graceMinutes = 5) {
    const invoice = await this.findOne(tenantId, id);
    if (invoice.status !== 'FINALIZED') {
      throw new BadRequestException('Only a finalized invoice can be undone in the edit window');
    }
    if (invoice.type === 'CREDIT_NOTE') {
      throw new BadRequestException('Credit notes cannot be undone — create a new sale if needed');
    }
    const ageMs = Date.now() - new Date(invoice.createdAt).getTime();
    const limitMs = Math.max(1, graceMinutes) * 60_000;
    if (ageMs > limitMs) {
      const mins = Math.ceil(ageMs / 60_000);
      throw new BadRequestException(
        `Edit window expired (${graceMinutes} min). Invoice is ${mins} min old — use a credit note for corrections.`,
      );
    }
    return this.cancel(tenantId, id);
  }

  async cancel(tenantId: string, id: string) {
    const invoice = await this.findOne(tenantId, id);
    if (invoice.status === 'CANCELLED') {
      throw new BadRequestException('Invoice already cancelled');
    }
    if (invoice.type === 'CREDIT_NOTE') {
      throw new BadRequestException(
        'Cannot cancel a credit note — stock was already restored on return. Create a new sale if needed.',
      );
    }

    const wasFinalized = invoice.status === 'FINALIZED';

    if (wasFinalized) {
      const { creditNotes } = await this.computeReturnedQtyByLine(
        tenantId,
        invoice.id,
        invoice.lines,
      );
      if (creditNotes.length > 0) {
        throw new BadRequestException(
          `Cannot cancel ${invoice.invoiceNumber}: ${creditNotes.length} credit note(s) already restored stock. Use returns only — cancelling would put stock back twice.`,
        );
      }
    }

    const cancelled = await this.prisma.$transaction(async (tx) => {
      if (wasFinalized) {
        for (const line of invoice.lines) {
          if (line.productId) {
            await tx.product.update({
              where: { id: line.productId },
              data: { stockQty: { increment: Number(line.quantity) } },
            });
            const product = await tx.product.findFirst({ where: { id: line.productId, tenantId }, select: { trackBatch: true } });
            if (product?.trackBatch) {
              await this.restoreBatchesForLine(tx, tenantId, line.productId, line.id, Number(line.quantity));
            } else {
              await tx.stockLedger.create({
                data: {
                  tenantId,
                  productId: line.productId,
                  type: 'RETURN',
                  quantity: Number(line.quantity),
                  referenceId: invoice.id,
                  invoiceLineId: line.id,
                  notes: 'Invoice cancelled',
                },
              });
            }

            for (const sn of line.serialNumbers ?? []) {
              await tx.productSerial.updateMany({
                where: { productId: line.productId, serialNumber: sn, status: 'SOLD' },
                data: { status: 'IN_STOCK' },
              });
            }

            await tx.branchStock.updateMany({
              where: { branchId: invoice.branchId, productId: line.productId },
              data: { quantity: { increment: Number(line.quantity) } },
            });
          }
        }

        if (invoice.customerId) {
          const creditPaid = invoice.payments
            .filter((p) => p.method === 'CREDIT')
            .reduce((s, p) => s + Number(p.amount), 0);
          if (creditPaid > 0) {
            await tx.customer.update({
              where: { id: invoice.customerId },
              data: { outstandingBalance: { decrement: creditPaid } },
            });
            await this.customers.appendCustomerLedger(tx, {
              tenantId,
              customerId: invoice.customerId,
              type: 'CREDIT_NOTE',
              amount: creditPaid,
              invoiceId: invoice.id,
              notes: `Cancelled ${invoice.invoiceNumber} — reverse credit`,
            });
          }

          // Reverse earned (+) and restore redeemed (-) loyalty tied to this invoice
          const loyalty = await tx.loyaltyTransaction.findMany({
            where: { tenantId, customerId: invoice.customerId, referenceId: invoice.id },
          });
          for (const lt of loyalty) {
            if (lt.points > 0) {
              await tx.customer.update({
                where: { id: invoice.customerId },
                data: { loyaltyPoints: { decrement: lt.points } },
              });
              await tx.loyaltyTransaction.create({
                data: {
                  tenantId,
                  customerId: invoice.customerId,
                  points: -lt.points,
                  reason: `Reversed loyalty for cancelled ${invoice.invoiceNumber}`,
                  referenceId: invoice.id,
                },
              });
            } else if (lt.points < 0) {
              const restore = Math.abs(lt.points);
              await tx.customer.update({
                where: { id: invoice.customerId },
                data: { loyaltyPoints: { increment: restore } },
              });
              await tx.loyaltyTransaction.create({
                data: {
                  tenantId,
                  customerId: invoice.customerId,
                  points: restore,
                  reason: `Restored redeemed points for cancelled ${invoice.invoiceNumber}`,
                  referenceId: invoice.id,
                },
              });
            }
          }
        }
      }

      return tx.invoice.update({
        where: { id },
        data: { status: 'CANCELLED' },
        include: { lines: true, payments: true, customer: true },
      });
    });

    if (wasFinalized) {
      await this.accounting.reverseSaleIfEnabled(
        tenantId,
        invoice.id,
        this.cashCreditSplit(invoice.payments, Number(invoice.grandTotal)),
      );
    }

    return cancelled;
  }

  /** Partial return → GST credit note + stock RETURN */
  async createCreditNote(
    tenantId: string,
    branchId: string,
    dto: {
      originalInvoiceId: string;
      notes?: string;
      processingFee?: number;
      lines: Array<{ invoiceLineId: string; quantity: number }>;
    },
  ) {
    const original = await this.findOne(tenantId, dto.originalInvoiceId);
    if (original.status !== 'FINALIZED') {
      throw new BadRequestException('Can only return against a finalized invoice');
    }
    if (original.type !== 'TAX_INVOICE') {
      throw new BadRequestException('Can only return against a tax invoice');
    }
    if (!dto.lines?.length) throw new BadRequestException('Add at least one return line');

    const { returnedByLine, creditNotes } = await this.computeReturnedQtyByLine(
      tenantId,
      original.id,
      original.lines,
    );

    const returnedSerialsByLine: Record<string, Set<string>> = {};
    for (const cn of creditNotes) {
      for (const line of cn.lines) {
        const srcId = line.sourceInvoiceLineId;
        if (!srcId) continue;
        if (!returnedSerialsByLine[srcId]) returnedSerialsByLine[srcId] = new Set();
        for (const sn of line.serialNumbers ?? []) {
          returnedSerialsByLine[srcId].add(sn);
        }
      }
    }

    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant not found');

    const returnLines = dto.lines.map((rl) => {
      const src = original.lines.find((l) => l.id === rl.invoiceLineId);
      if (!src) throw new BadRequestException(`Line ${rl.invoiceLineId} not on invoice`);
      const soldQty = Number(src.quantity);
      const alreadyReturned = returnedByLine[src.id] ?? 0;
      const remainingQty = soldQty - alreadyReturned;
      if (rl.quantity <= 0 || rl.quantity > remainingQty + 0.001) {
        throw new BadRequestException(
          `Invalid return qty for ${src.productName} (max ${remainingQty} remaining)`,
        );
      }
      const ratio = rl.quantity / soldQty;
      const needSerials = Math.round(rl.quantity);
      const srcSerials = src.serialNumbers ?? [];
      const alreadySerials = returnedSerialsByLine[src.id] ?? new Set<string>();
      const availableSerials = srcSerials.filter((s) => !alreadySerials.has(s));
      let serialNumbers: string[] = [];
      if (srcSerials.length > 0) {
        if (availableSerials.length < needSerials) {
          throw new BadRequestException(
            `Not enough returnable IMEI/serials for ${src.productName} (need ${needSerials}, have ${availableSerials.length})`,
          );
        }
        serialNumbers = availableSerials.slice(0, needSerials);
      }
      return {
        invoiceLineId: src.id,
        productId: src.productId ?? undefined,
        productName: src.productName,
        productSku: (src as { productSku?: string | null }).productSku ?? undefined,
        productBarcode: (src as { productBarcode?: string | null }).productBarcode ?? undefined,
        hsnCode: src.hsnCode,
        unit: (src as { unit?: string }).unit ?? 'pcs',
        quantity: rl.quantity,
        unitPrice: Number(src.unitPrice),
        discount: Number(src.discount) * ratio,
        gstRate: Number(src.gstRate),
        serialNumbers,
        costPriceSnapshot: src.costPriceSnapshot != null ? Number(src.costPriceSnapshot) : 0,
      };
    });

    const totals = calculateInvoice(
      returnLines,
      tenant.stateCode,
      original.customer?.stateCode ?? undefined,
    );

    const processingFee = Math.max(0, Number(dto.processingFee ?? 0));
    if (processingFee > totals.grandTotal + 0.01) {
      throw new BadRequestException('Processing fee cannot exceed return value');
    }
    const netRefund =
      Math.round((totals.grandTotal - processingFee) * 100) / 100;

    const creditNote = await this.prisma.$transaction(async (tx) => {
      const invoiceNumber = await this.numbering.allocate(tx, tenantId, 'CREDIT_NOTE');
      const restoreBranchId = original.branchId || branchId;

      const creditNote = await tx.invoice.create({
        data: {
          tenantId,
          branchId: restoreBranchId,
          customerId: original.customerId,
          invoiceNumber,
          type: 'CREDIT_NOTE',
          status: 'FINALIZED',
          supplyType: original.supplyType,
          subtotal: totals.subtotal,
          totalDiscount: totals.totalDiscount,
          totalCgst: totals.totalCgst,
          totalSgst: totals.totalSgst,
          totalIgst: totals.totalIgst,
          grandTotal: totals.grandTotal,
          processingFee,
          notes: dto.notes ?? `Return against ${original.invoiceNumber}`,
          originalInvoiceId: original.id,
          lines: {
            create: totals.lines.map((l, i) => ({
              productId: returnLines[i].productId,
              productName: l.productName,
              productSku: returnLines[i].productSku ?? null,
              productBarcode: returnLines[i].productBarcode ?? null,
              hsnCode: l.hsnCode,
              unit: returnLines[i].unit ?? 'pcs',
              quantity: l.quantity,
              unitPrice: l.unitPrice,
              discount: l.discount,
              gstRate: l.gstRate,
              cgst: l.cgst,
              sgst: l.sgst,
              igst: l.igst,
              taxableAmount: l.taxableAmount,
              total: l.total,
              sourceInvoiceLineId: returnLines[i].invoiceLineId,
              serialNumbers: returnLines[i].serialNumbers,
              costPriceSnapshot: returnLines[i].costPriceSnapshot,
            })),
          },
        },
        include: { lines: true, customer: true },
      });

      for (const line of returnLines) {
        if (!line.productId) continue;
        await tx.product.update({
          where: { id: line.productId },
          data: { stockQty: { increment: line.quantity } },
        });
        const product = await tx.product.findFirst({ where: { id: line.productId, tenantId }, select: { trackBatch: true } });
        if (product?.trackBatch) {
          // Restores against the ORIGINAL sale line's id — that's what SALE-type ledger rows were
          // tagged with when the batches were consumed, so a partial return only restores as much
          // as was actually returned, LIFO.
          await this.restoreBatchesForLine(tx, tenantId, line.productId, line.invoiceLineId, line.quantity);
        } else {
          await tx.stockLedger.create({
            data: {
              tenantId,
              productId: line.productId,
              type: 'RETURN',
              quantity: line.quantity,
              referenceId: creditNote.id,
              invoiceLineId: line.invoiceLineId,
              notes: `Credit note ${invoiceNumber}`,
            },
          });
        }

        for (const sn of line.serialNumbers) {
          await tx.productSerial.updateMany({
            where: { productId: line.productId, serialNumber: sn, status: 'SOLD' },
            data: { status: 'IN_STOCK' },
          });
        }

        await tx.branchStock.updateMany({
          where: { branchId: restoreBranchId, productId: line.productId },
          data: { quantity: { increment: line.quantity } },
        });
      }

      if (original.customerId) {
        await tx.customer.update({
          where: { id: original.customerId },
          data: { outstandingBalance: { decrement: netRefund } },
        });
        if (netRefund > 0) {
          await this.customers.appendCustomerLedger(tx, {
            tenantId,
            customerId: original.customerId,
            type: 'CREDIT_NOTE',
            amount: netRefund,
            invoiceId: creditNote.id,
            notes: `Credit note ${invoiceNumber}`,
            entryDate: creditNote.createdAt,
          });
        }
      }

      return creditNote;
    });

    {
      // Attribute the refund to cash/credit in the same proportion as the original sale —
      // a return against a fully-credit sale should reverse Accounts Receivable, not Cash.
      const originalGrandTotal = Number(original.grandTotal);
      const originalSplit = this.cashCreditSplit(original.payments, originalGrandTotal);
      const creditRatio = originalGrandTotal > 0 ? originalSplit.creditAmount / originalGrandTotal : 0;
      const refundTotal = Number(totals.grandTotal);
      const creditAmount = refundTotal * creditRatio;
      await this.accounting.reverseSaleIfEnabled(tenantId, creditNote.id, {
        cashAmount: refundTotal - creditAmount,
        creditAmount,
      });
    }

    return {
      ...creditNote,
      processingFee,
      netRefund,
    };
  }

  async updateTransport(
    tenantId: string,
    id: string,
    data: { ewayBillNo?: string | null; vehicleNo?: string | null },
  ) {
    await this.findOne(tenantId, id);
    return this.prisma.invoice.update({
      where: { id },
      data: {
        ...(data.ewayBillNo !== undefined
          ? { ewayBillNo: data.ewayBillNo?.trim() || null }
          : {}),
        ...(data.vehicleNo !== undefined
          ? { vehicleNo: data.vehicleNo?.trim() || null }
          : {}),
      },
      include: { customer: true, payments: true, lines: true },
    });
  }

  async getPrintData(
    tenantId: string,
    id: string,
    channel: 'web' | 'mobile' = 'web',
    copyKind: 'original' | 'duplicate' | 'triplicate' = 'original',
  ) {
    const invoice = await this.findOne(tenantId, id);
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    const placeOfSupply =
      invoice.customer?.stateCode || tenant?.stateCode || undefined;
    const paymentMethod =
      invoice.payments.length === 1 ? invoice.payments[0].method : undefined;

    const baseOptions = mergeInvoiceDisplayOptions(
      tenant?.invoiceDisplayOptions as Record<string, unknown> | null,
    );
    const complianceLive = isEinvoiceComplianceConfigured();
    const displayOptions = resolveEffectiveDisplayOptions(baseOptions, {
      complianceLive,
      irn: invoice.irn,
    });

    const templateId = tenant
      ? resolveTemplateForChannel(tenant, channel)
      : channel === 'mobile'
        ? 'retail-bold'
        : 'classic';

    const liveIrn = isLiveIrn(invoice.irn);
    const storedQr = invoice.einvoiceQr?.trim() ?? '';
    const storedIsImage =
      !!storedQr && (/^https?:\/\//i.test(storedQr) || /^data:image\//i.test(storedQr));
    const hasNicSignedQr = liveIrn && !!storedQr && !storedIsImage;
    const qrKind: 'nic' | 'shop' | undefined = displayOptions.showQr
      ? hasNicSignedQr || liveIrn
        ? 'nic'
        : 'shop'
      : undefined;

    const printBase = {
      shopName: tenant?.name ?? 'RetailSarathi',
      shopAddress: tenant?.address ?? '',
      gstin: tenant?.gstin ?? undefined,
      shopStateCode: tenant?.stateCode ?? undefined,
      shopPhone: tenant?.phone ?? undefined,
      shopEmail: tenant?.email ?? undefined,
      bankName: tenant?.bankName ?? undefined,
      bankAccountNo: tenant?.bankAccountNo ?? undefined,
      bankIfsc: tenant?.bankIfsc ?? undefined,
      bankBranch: tenant?.bankBranch ?? undefined,
      invoiceNumber: invoice.invoiceNumber,
      date: formatAppDate(invoice.createdAt) ?? invoice.createdAt.toISOString().slice(0, 10),
      customerName: invoice.customer?.name,
      customerPhone: invoice.customer?.phone,
      customerGstin: invoice.customer?.gstin ?? undefined,
      customerStateCode: invoice.customer?.stateCode ?? undefined,
      customerAddress: invoice.customer
        ? formatIndianAddress({
            address: invoice.customer.address,
            addressLine2: (invoice.customer as { addressLine2?: string | null }).addressLine2,
            city: (invoice.customer as { city?: string | null }).city,
            stateCode: invoice.customer.stateCode,
            pincode: (invoice.customer as { pincode?: string | null }).pincode,
            country: (invoice.customer as { country?: string | null }).country,
          })
        : undefined,
      placeOfSupply,
      supplyType: invoice.supplyType as 'INTRA_STATE' | 'INTER_STATE',
      copyKind,
      ewayBillNo: displayOptions.showEwayBill ? (invoice.ewayBillNo ?? undefined) : undefined,
      vehicleNo: displayOptions.showEwayBill ? (invoice.vehicleNo ?? undefined) : undefined,
      lines: invoice.lines.map((l) => {
        const rawUnit =
          (l as { unit?: string }).unit ??
          (l as { product?: { unit?: string } }).product?.unit ??
          'pcs';
        return {
          name: l.productName,
          hsnCode: l.hsnCode,
          sku: (l as { productSku?: string | null }).productSku ?? undefined,
          barcode: (l as { productBarcode?: string | null }).productBarcode ?? undefined,
          unit: mapUnitToUqc(rawUnit),
          qty: Number(l.quantity),
          rate: Number(l.unitPrice),
          gstRate: Number(l.gstRate),
          taxableAmount: Number(l.taxableAmount),
          cgst: Number(l.cgst),
          sgst: Number(l.sgst),
          igst: Number(l.igst),
          amount: Number(l.total),
        };
      }),
      subtotal: Number(invoice.subtotal),
      totalCgst: Number(invoice.totalCgst),
      totalSgst: Number(invoice.totalSgst),
      totalIgst: Number(invoice.totalIgst),
      grandTotal: Number(invoice.grandTotal),
      documentType: invoice.type as 'TAX_INVOICE' | 'CREDIT_NOTE',
      originalInvoiceNumber: invoice.originalInvoice?.invoiceNumber,
      originalInvoiceDate: invoice.originalInvoice
        ? formatAppDate(invoice.originalInvoice.createdAt) ??
          invoice.originalInvoice.createdAt.toISOString().slice(0, 10)
        : undefined,
      processingFee: Number(invoice.processingFee ?? 0),
      netRefundAmount:
        Number(invoice.grandTotal) - Number(invoice.processingFee ?? 0),
      payments: invoice.payments.map((p) => ({
        method: p.method,
        amount: Number(p.amount),
      })),
      notes: invoice.notes ?? undefined,
      templateId,
      channel,
      displayOptions,
      complianceLive,
    };

    if (!displayOptions.showQr && !displayOptions.showIrn) {
      return printBase;
    }

    const qrPayload = buildInvoiceQrPayload({
      gstin: tenant?.gstin ?? undefined,
      invoiceNumber: invoice.invoiceNumber,
      date: invoice.createdAt,
      subtotal: Number(invoice.subtotal),
      grandTotal: Number(invoice.grandTotal),
      totalCgst: Number(invoice.totalCgst),
      totalSgst: Number(invoice.totalSgst),
      totalIgst: Number(invoice.totalIgst),
      customerGstin: invoice.customer?.gstin ?? undefined,
      customerName: invoice.customer?.name ?? undefined,
      paymentMethod,
      irn: displayOptions.showIrn ? (invoice.irn ?? undefined) : undefined,
      storedQr: invoice.einvoiceQr ?? undefined,
    });
    // A shop QR links to the invoice's own public view page (so a customer's scan opens the
    // real invoice) instead of encoding raw pipe-delimited text; the NIC e-invoice QR kind is
    // left untouched since that payload is a government-signed format, not ours to redirect.
    const webOrigin = (process.env.CORS_ORIGIN || 'http://localhost:3000')
      .split(',')[0]
      .trim()
      .replace(/\/$/, '');
    const publicViewUrl = qrKind === 'shop' ? `${webOrigin}/invoice/${invoice.id}` : undefined;

    return {
      ...printBase,
      irn: displayOptions.showIrn ? (invoice.irn ?? undefined) : undefined,
      einvoiceQr: displayOptions.showQr ? (invoice.einvoiceQr ?? undefined) : undefined,
      qrKind: displayOptions.showQr ? qrKind : undefined,
      qrPayload: displayOptions.showQr ? qrPayload : undefined,
      qrParsed: displayOptions.showQr ? parseInvoiceQrPayload(qrPayload) : undefined,
      publicViewUrl: displayOptions.showQr ? publicViewUrl : undefined,
      qrUrl: displayOptions.showQr
        ? publicViewUrl
          ? encodeTextAsQrImage(publicViewUrl)
          : invoiceQrImageUrl(qrPayload)
        : undefined,
    };
  }

  async getPrintHtml(
    tenantId: string,
    id: string,
    channel: 'web' | 'mobile' = 'web',
    copyKind: 'original' | 'duplicate' | 'triplicate' = 'original',
  ) {
    const data = await this.getPrintData(tenantId, id, channel, copyKind);
    const templateId = data.templateId ?? (channel === 'mobile' ? 'retail-bold' : 'classic');
    return {
      html: renderInvoiceHtml(data as Record<string, unknown>, templateId),
      templateId,
      channel,
      copyKind,
    };
  }

  /** True one-click "Download invoice" — bundles the tenant's configured copy count (1-3 for a
      tax invoice, always 1 for a credit note, same rule the web UI already applies) into a single
      PDF rendered server-side, instead of a client-side print window. */
  async getDownloadPdf(tenantId: string, id: string) {
    const invoice = await this.findOne(tenantId, id);
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    const isCreditNote = invoice.type === 'CREDIT_NOTE';
    const count = isCreditNote ? 1 : Math.min(3, Math.max(1, tenant?.invoiceCopyCount ?? 1));
    const kinds = (['original', 'duplicate', 'triplicate'] as const).slice(0, count);

    const docs: string[] = [];
    for (const kind of kinds) {
      const data = await this.getPrintData(tenantId, id, 'web', kind);
      const templateId = data.templateId ?? 'classic';
      docs.push(renderInvoiceHtml(data as Record<string, unknown>, templateId));
    }
    const html = combinePrintDocuments(docs);
    const pdf = await this.pdfRenderer.renderPdf(html);

    return {
      filename: `${invoice.invoiceNumber}.pdf`,
      base64: pdf.toString('base64'),
    };
  }

  /** Public, unauthenticated, permanent invoice view — the page a customer lands on after
      scanning the QR printed on their copy. Looked up by the invoice's own id (already an
      unguessable cuid, so no separate token is needed), with the tenant derived from the
      invoice record itself since a public visitor has no authenticated tenant context. */
  async getPublicInvoiceHtml(id: string) {
    const invoice = await this.prisma.invoice.findUnique({
      where: { id },
      select: { tenantId: true },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');
    const data = await this.getPrintData(invoice.tenantId, id);
    const templateId = data.templateId ?? 'classic';
    return {
      html: renderInvoiceHtml(data as Record<string, unknown>, templateId),
      invoiceNumber: data.invoiceNumber,
    };
  }

  async getThermalData(tenantId: string, id: string) {
    const print = await this.getPrintData(tenantId, id);
    const { buildThermalReceipt } = await import('./thermal.util');
    return buildThermalReceipt({
      shopName: print.shopName,
      shopAddress: print.shopAddress,
      gstin: print.gstin ?? undefined,
      invoiceNumber: print.invoiceNumber,
      date: print.date,
      customerName: print.customerName,
      lines: print.lines.map((l) => ({
        name: l.name,
        qty: l.qty,
        rate: l.rate,
        amount: l.amount,
      })),
      subtotal: print.subtotal,
      tax: print.totalCgst + print.totalSgst + print.totalIgst,
      grandTotal: print.grandTotal,
      payments: print.payments,
    });
  }

  /** Simple thermal warranty slip for serial-tracked lines (desktop / counter reprint). */
  async generateWarrantyCards(tenantId: string, id: string) {
    const invoice = await this.findOne(tenantId, id);
    const serialLines = (invoice.lines ?? []).filter(
      (l) => Array.isArray(l.serialNumbers) && l.serialNumbers.length > 0,
    );
    if (!serialLines.length) {
      return {
        text: `WARRANTY\nInvoice ${invoice.invoiceNumber}\nNo serial-tracked items on this bill.\n`,
        cards: [],
      };
    }
    const blocks = serialLines.map((l) => {
      const serials = (l.serialNumbers ?? []).join(', ');
      return [
        '=== WARRANTY CARD ===',
        `Invoice: ${invoice.invoiceNumber}`,
        `Date: ${new Date(invoice.createdAt).toISOString().slice(0, 10)}`,
        `Product: ${l.productName}`,
        `IMEI/Serial: ${serials}`,
        `Customer: ${invoice.customer?.name ?? 'Walk-in'}`,
        'Cover: manufacturing defects per brand terms.',
        'Keep this slip with original bill.',
        '=====================',
        '',
      ].join('\n');
    });
    return {
      text: blocks.join('\n'),
      cards: serialLines.map((l) => ({
        productName: l.productName,
        serialNumbers: l.serialNumbers ?? [],
      })),
    };
  }

  /** Opt-in WhatsApp bill link / API send after finalize */
  async notifyWhatsAppBill(tenantId: string, invoiceId: string) {
    const invoice = await this.findOne(tenantId, invoiceId);
    if (!invoice.customer?.whatsappOptIn || !invoice.customer.phone) {
      return {
        sent: false,
        reason: 'Customer not opted in or no phone',
        hint: 'Enable WhatsApp opt-in on the customer, then retry Send WhatsApp.',
      };
    }
    const digits = invoice.customer.phone.replace(/\D/g, '').slice(-10);
    if (digits.length !== 10) {
      return { sent: false, reason: 'Invalid customer phone' };
    }
    const text = `Namaste ${invoice.customer.name}! Bill ${invoice.invoiceNumber} ₹${Number(invoice.grandTotal).toFixed(2)}. Dhanyavad — RetailSarathi`;
    const shareUrl = `https://wa.me/91${digits}?text=${encodeURIComponent(text)}`;

    const apiUrl = process.env.WHATSAPP_API_URL?.trim();
    if (apiUrl) {
      try {
        const res = await fetch(apiUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.WHATSAPP_API_TOKEN ?? ''}`,
          },
          body: JSON.stringify({
            to: `91${digits}`,
            message: text,
            invoiceId,
            invoiceNumber: invoice.invoiceNumber,
          }),
        });
        const bodyText = await res.text().catch(() => '');
        if (!res.ok) {
          return {
            sent: false,
            mode: 'api',
            shareUrl,
            error: `WhatsApp API ${res.status}: ${bodyText.slice(0, 200)}`,
          };
        }
        return { sent: true, mode: 'api', shareUrl, note: 'Sent via WHATSAPP_API_URL' };
      } catch (e) {
        return { sent: false, mode: 'api', error: String(e), shareUrl };
      }
    }
    return {
      sent: false,
      mode: 'link',
      shareUrl,
      note: 'No WHATSAPP_API_URL — open shareUrl or configure API for auto-send',
    };
  }
}
