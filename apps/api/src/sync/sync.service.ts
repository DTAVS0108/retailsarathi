import { Injectable } from '@nestjs/common';
import { SyncOperation } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PushSyncDto, ResolveConflictDto } from './dto/sync.dto';

@Injectable()
export class SyncService {
  constructor(private prisma: PrismaService) {}

  async push(tenantId: string, deviceId: string, dto: PushSyncDto) {
    const results = [];

    for (const entry of dto.entries) {
      const existing = await this.prisma.syncOutbox.findFirst({
        where: {
          tenantId,
          deviceId,
          entityType: entry.entityType,
          entityId: entry.entityId,
          status: 'PENDING',
        },
      });

      if (existing) {
        results.push({ entityId: entry.entityId, status: 'DUPLICATE' });
        continue;
      }

      const record = await this.prisma.syncOutbox.create({
        data: {
          tenantId,
          deviceId,
          entityType: entry.entityType,
          entityId: entry.entityId,
          operation: entry.operation as SyncOperation,
          payload: entry.payload as object,
          status: 'PENDING',
        },
      });

      try {
        const applied = await this.applyEntry(tenantId, entry);
        await this.prisma.syncOutbox.update({
          where: { id: record.id },
          data: { status: 'SYNCED', syncedAt: new Date() },
        });
        // For invoices specifically, hand back the server-assigned id/number so the client can
        // replace its local "LOCAL-..." placeholder instead of displaying it forever.
        results.push({
          entityId: entry.entityId,
          status: 'SYNCED',
          ...(applied?.invoiceId ? { invoiceId: applied.invoiceId, invoiceNumber: applied.invoiceNumber } : {}),
        });
      } catch (err) {
        // A message prefixed "CONFLICT:" means applyEntry recognized an unsafe/contradictory
        // apply (oversold stock, reused invoice number, already-sold serial) — route it to the
        // CONFLICT status so it surfaces via getConflicts()/resolveConflict() instead of being
        // silently retried forever as a generic FAILED row.
        const message = String(err);
        const isConflict = err instanceof Error && err.message.startsWith('CONFLICT:');
        await this.prisma.syncOutbox.update({
          where: { id: record.id },
          data: { status: isConflict ? 'CONFLICT' : 'FAILED', error: message },
        });
        results.push({ entityId: entry.entityId, status: isConflict ? 'CONFLICT' : 'FAILED', error: message });
      }
    }

    await this.updateCursor(tenantId, deviceId);
    return { results };
  }

  async pull(tenantId: string, deviceId: string, since?: string) {
    const sinceDate = since ? new Date(since) : new Date(0);

    const [products, customers, invoices] = await Promise.all([
      this.prisma.product.findMany({
        where: { tenantId, updatedAt: { gt: sinceDate } },
      }),
      this.prisma.customer.findMany({
        where: { tenantId, updatedAt: { gt: sinceDate } },
      }),
      this.prisma.invoice.findMany({
        where: { tenantId, updatedAt: { gt: sinceDate } },
        include: { lines: true, payments: true },
      }),
    ]);

    return {
      serverTime: new Date().toISOString(),
      changes: { products, customers, invoices },
    };
  }

  async getConflicts(tenantId: string, deviceId: string) {
    return this.prisma.syncOutbox.findMany({
      where: { tenantId, deviceId, status: 'CONFLICT' },
      orderBy: { createdAt: 'desc' },
    });
  }

  async resolveConflict(tenantId: string, id: string, dto: ResolveConflictDto) {
    const entry = await this.prisma.syncOutbox.findFirst({
      where: { id, tenantId },
    });
    if (!entry) return null;

    if (dto.resolution === 'ACCEPT_LOCAL') {
      await this.applyEntry(tenantId, {
        entityType: entry.entityType,
        entityId: entry.entityId,
        operation: entry.operation,
        payload: entry.payload as Record<string, unknown>,
      });
    }

    return this.prisma.syncOutbox.update({
      where: { id },
      data: {
        status: 'SYNCED',
        syncedAt: new Date(),
        error: dto.resolution === 'ACCEPT_SERVER' ? 'Server version kept' : null,
      },
    });
  }

  private async applyEntry(
    tenantId: string,
    entry: {
      entityType: string;
      entityId: string;
      operation: string;
      payload: Record<string, unknown>;
    },
  ): Promise<{ invoiceId: string; invoiceNumber: string } | void> {
    const { entityType, operation, payload } = entry;

    if (entityType === 'product' && operation === 'CREATE') {
      const existing = await this.prisma.product.findFirst({
        where: { tenantId, sku: payload.sku as string },
      });
      if (existing) {
        throw new Error('CONFLICT: Product SKU already exists on server');
      }
      await this.prisma.product.create({
        data: { tenantId, ...(payload as object) } as never,
      });
    }

    if (entityType === 'invoice' && operation === 'CREATE') {
      const idempotencyKey = payload.idempotencyKey as string | undefined;
      if (idempotencyKey) {
        const existingByKey = await this.prisma.invoice.findUnique({ where: { idempotencyKey } });
        if (existingByKey && existingByKey.tenantId === tenantId) {
          // Already applied (e.g. this exact outbox entry was pushed twice) — not a conflict.
          return { invoiceId: existingByKey.id, invoiceNumber: existingByKey.invoiceNumber };
        }
      }

      const existing = await this.prisma.invoice.findFirst({
        where: { tenantId, invoiceNumber: payload.invoiceNumber as string },
      });
      if (existing) {
        throw new Error('CONFLICT: Invoice number already exists');
      }

      const branch = await this.prisma.branch.findFirst({ where: { tenantId } });
      if (!branch) {
        throw new Error('No branch available for synced invoice');
      }

      const lines = (payload.lines as Array<Record<string, unknown>>) ?? [];
      const payments = (payload.payments as Array<Record<string, unknown>>) ?? [];
      const year = new Date().getFullYear();
      const prefix = `INV-${year}-`;
      const last = await this.prisma.invoice.findFirst({
        where: { tenantId, invoiceNumber: { startsWith: prefix } },
        orderBy: { invoiceNumber: 'desc' },
      });
      const seq = last ? parseInt(last.invoiceNumber.replace(prefix, ''), 10) + 1 : 1;
      const serverNumber = `${prefix}${String(seq).padStart(5, '0')}`;

      const createdInvoice = await this.prisma.$transaction(async (tx) => {
        const invoice = await tx.invoice.create({
          data: {
            tenantId,
            branchId: branch.id,
            invoiceNumber: serverNumber,
            status: 'FINALIZED',
            type: 'TAX_INVOICE',
            supplyType: 'INTRA_STATE',
            subtotal: Number(payload.subtotal ?? 0),
            totalCgst: Number(payload.totalCgst ?? 0),
            totalSgst: Number(payload.totalSgst ?? 0),
            totalIgst: Number(payload.totalIgst ?? 0),
            grandTotal: Number(payload.grandTotal ?? 0),
            idempotencyKey: idempotencyKey || undefined,
            notes: `Synced from offline (${payload.invoiceNumber ?? entry.entityId})`,
            lines: {
              create: lines.map((l) => ({
                productId: (l.productId as string) || undefined,
                productName: String(l.productName ?? 'Item'),
                hsnCode: String(l.hsnCode ?? '8517'),
                quantity: Number(l.quantity ?? 1),
                unitPrice: Number(l.unitPrice ?? 0),
                discount: Number(l.discount ?? 0),
                gstRate: Number(l.gstRate ?? 18),
                cgst: Number(l.cgst ?? 0),
                sgst: Number(l.sgst ?? 0),
                igst: Number(l.igst ?? 0),
                taxableAmount: Number(l.taxableAmount ?? 0),
                total: Number(l.total ?? 0),
                serialNumbers: Array.isArray(l.serialNumbers)
                  ? (l.serialNumbers as string[])
                  : [],
              })),
            },
            payments: payments.length
              ? {
                  create: payments.map((p) => ({
                    method: (p.method as any) ?? 'CASH',
                    amount: Number(p.amount ?? 0),
                  })),
                }
              : undefined,
          },
        });

        for (const line of lines) {
          if (!line.productId) continue;
          const productId = String(line.productId);
          const qty = Number(line.quantity ?? 0);
          const updated = await tx.product.updateMany({
            where: { id: productId, tenantId, stockQty: { gte: qty } },
            data: { stockQty: { decrement: qty } },
          });
          if (updated.count === 0) {
            throw new Error(`CONFLICT: Insufficient stock for product ${line.productId}`);
          }
          await tx.stockLedger.create({
            data: {
              tenantId,
              productId,
              type: 'SALE',
              quantity: -qty,
              referenceId: invoice.id,
              notes: 'Offline sync',
            },
          });

          const serials = Array.isArray(line.serialNumbers)
            ? (line.serialNumbers as string[])
            : [];
          for (const sn of serials) {
            const serial = await tx.productSerial.findFirst({
              where: { productId, serialNumber: sn, status: 'IN_STOCK' },
            });
            if (!serial) {
              throw new Error(`CONFLICT: Serial/IMEI not in stock: ${sn}`);
            }
            await tx.productSerial.update({
              where: { id: serial.id },
              data: { status: 'SOLD' },
            });
          }

          await tx.branchStock.updateMany({
            where: {
              branchId: branch.id,
              productId,
              quantity: { gte: qty },
            },
            data: { quantity: { decrement: qty } },
          });
        }

        return invoice;
      });

      return { invoiceId: createdInvoice.id, invoiceNumber: createdInvoice.invoiceNumber };
    }
  }

  private async updateCursor(tenantId: string, deviceId: string) {
    const entityTypes = ['product', 'customer', 'invoice'];
    for (const entityType of entityTypes) {
      await this.prisma.syncCursor.upsert({
        where: { tenantId_deviceId_entityType: { tenantId, deviceId, entityType } },
        create: { tenantId, deviceId, entityType, lastSyncedAt: new Date() },
        update: { lastSyncedAt: new Date() },
      });
    }
  }
}
