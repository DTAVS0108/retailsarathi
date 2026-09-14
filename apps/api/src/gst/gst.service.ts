import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildGstr1Payload, buildGstr3bSummary } from '@retail-sarathi/gst-engine';

@Injectable()
export class GstService {
  constructor(private prisma: PrismaService) {}

  async exportGstr1(tenantId: string, year: number, month: number) {
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59);

    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        status: 'FINALIZED',
        createdAt: { gte: start, lte: end },
      },
      include: { lines: true, customer: true },
    });

    const fp = `${String(month).padStart(2, '0')}${year}`;
    const payload = buildGstr1Payload(
      tenant?.gstin ?? '',
      fp,
      invoices.map((inv) => ({
        invoiceNumber: inv.invoiceNumber,
        date: inv.createdAt.toISOString().split('T')[0].split('-').reverse().join('-'),
        customerGstin: inv.customer?.gstin ?? undefined,
        customerName: inv.customer?.name ?? 'Walk-in',
        placeOfSupply: inv.customer?.stateCode ?? tenant?.stateCode ?? '27',
        lines: inv.lines.map((l) => ({
          productName: l.productName,
          hsnCode: l.hsnCode,
          quantity: Number(l.quantity),
          unitPrice: Number(l.unitPrice),
          discount: Number(l.discount),
          taxableAmount: Number(l.taxableAmount),
          gstRate: Number(l.gstRate),
          cgst: Number(l.cgst),
          sgst: Number(l.sgst),
          igst: Number(l.igst),
          total: Number(l.total),
        })),
        grandTotal: Number(inv.grandTotal),
      })),
    );

    return payload;
  }

  async exportGstr3b(tenantId: string, year: number, month: number) {
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59);

    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        status: 'FINALIZED',
        createdAt: { gte: start, lte: end },
      },
      include: { lines: true },
    });

    const allLines = invoices.flatMap((inv) =>
      inv.lines.map((l) => ({
        productName: l.productName,
        hsnCode: l.hsnCode,
        quantity: Number(l.quantity),
        unitPrice: Number(l.unitPrice),
        discount: Number(l.discount),
        taxableAmount: Number(l.taxableAmount),
        gstRate: Number(l.gstRate),
        cgst: Number(l.cgst),
        sgst: Number(l.sgst),
        igst: Number(l.igst),
        total: Number(l.total),
      })),
    );

    return buildGstr3bSummary(allLines);
  }
}
