import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  formatDocumentNumber,
  getPeriodDateRange,
  getPeriodKey,
  mergeNumberingSettings,
  parseTrailingSequence,
  previewNextDocumentNumber,
  type DocumentNumberingConfig,
  type TenantNumberingSettings,
} from '@retail-sarathi/gst-engine';
import { PrismaService } from '../prisma/prisma.service';

export type AllocDocType = 'TAX_INVOICE' | 'CREDIT_NOTE';

@Injectable()
export class InvoiceNumberingService {
  constructor(private prisma: PrismaService) {}

  async getSettings(tenantId: string): Promise<TenantNumberingSettings> {
    const tenant = await this.prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { invoiceNumbering: true },
    });
    return mergeNumberingSettings(tenant?.invoiceNumbering);
  }

  async getStatus(tenantId: string) {
    const settings = await this.getSettings(tenantId);
    const now = new Date();
    const types: AllocDocType[] = ['TAX_INVOICE', 'CREDIT_NOTE'];

    const rows = await Promise.all(
      types.map(async (docType) => {
        const config =
          docType === 'CREDIT_NOTE' ? settings.creditNote : settings.taxInvoice;
        const periodKey = getPeriodKey(config.resetPeriod, now);
        const seqRow = await this.prisma.documentSequence.findUnique({
          where: {
            tenantId_docType_periodKey: { tenantId, docType, periodKey },
          },
        });
        const currentSeq = seqRow?.lastSeq ?? 0;
        const fy = getPeriodKey('financial_year', now);
        return {
          docType,
          periodKey,
          currentSeq,
          nextPreview: previewNextDocumentNumber(config, currentSeq, now),
          config,
          financialYearPeriod: fy,
        };
      }),
    );

    return {
      settings,
      now: now.toISOString(),
      sequences: rows,
    };
  }

  async allocate(
    tx: Prisma.TransactionClient,
    tenantId: string,
    docType: AllocDocType,
    date = new Date(),
  ): Promise<string> {
    const tenant = await tx.tenant.findUnique({
      where: { id: tenantId },
      select: { invoiceNumbering: true },
    });
    const settings = mergeNumberingSettings(tenant?.invoiceNumbering);
    const config =
      docType === 'CREDIT_NOTE' ? settings.creditNote : settings.taxInvoice;
    const periodKey = getPeriodKey(config.resetPeriod, date);
    const seq = await this.nextSequenceTx(tx, tenantId, docType, config, periodKey, date);
    return formatDocumentNumber(config, { seq, date });
  }

  private async nextSequenceTx(
    tx: Prisma.TransactionClient,
    tenantId: string,
    docType: AllocDocType,
    config: DocumentNumberingConfig,
    periodKey: string,
    date: Date,
  ): Promise<number> {
    const existing = await tx.documentSequence.findUnique({
      where: { tenantId_docType_periodKey: { tenantId, docType, periodKey } },
    });

    if (existing) {
      const next = existing.lastSeq + 1;
      await tx.documentSequence.update({
        where: { id: existing.id },
        data: { lastSeq: next },
      });
      return next;
    }

    const bootstrapped = await this.bootstrapFromInvoices(tx, tenantId, docType, config, date);
    const start = Math.max(config.startFrom ?? 1, bootstrapped + 1);
    await tx.documentSequence.create({
      data: { tenantId, docType, periodKey, lastSeq: start },
    });
    return start;
  }

  /** Seed counter from existing bills in the same period (migration-safe). */
  private async bootstrapFromInvoices(
    tx: Prisma.TransactionClient,
    tenantId: string,
    docType: AllocDocType,
    config: DocumentNumberingConfig,
    date: Date,
  ): Promise<number> {
    const range = getPeriodDateRange(config.resetPeriod, date);
    const invoiceType = docType === 'CREDIT_NOTE' ? 'CREDIT_NOTE' : 'TAX_INVOICE';

    const invoices = await tx.invoice.findMany({
      where: {
        tenantId,
        type: invoiceType,
        ...(range
          ? { createdAt: { gte: range.from, lte: range.to } }
          : {}),
      },
      select: { invoiceNumber: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    let max = 0;
    for (const inv of invoices) {
      const n = parseTrailingSequence(inv.invoiceNumber);
      if (n != null && n > max) max = n;
    }
    return max;
  }
}
