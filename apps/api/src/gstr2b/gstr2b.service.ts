import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class Gstr2bService {
  constructor(private prisma: PrismaService) {}

  private round2(n: number) {
    return Math.round(n * 100) / 100;
  }

  /** CSV: gstin,supplierName,invoiceNumber,invoiceDate,taxable,cgst,sgst,igst,total */
  parseCsv(text: string) {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) return [];
    const start = /gstin|invoice/i.test(lines[0]) ? 1 : 0;
    const rows = [];
    for (let i = start; i < lines.length; i++) {
      const cols = lines[i].split(',').map((c) => c.replace(/^"|"$/g, '').trim());
      if (cols.length < 4) continue;
      const invoiceNumber = cols[2] || cols[1];
      if (!invoiceNumber) continue;
      const invoiceDate = cols[3] ? new Date(cols[3]) : null;
      rows.push({
        supplierGstin: cols[0] || null,
        supplierName: cols[1] || null,
        invoiceNumber,
        invoiceDate: invoiceDate && !Number.isNaN(invoiceDate.getTime()) ? invoiceDate : null,
        taxableValue: this.round2(Number(cols[4] || 0) || 0),
        cgst: this.round2(Number(cols[5] || 0) || 0),
        sgst: this.round2(Number(cols[6] || 0) || 0),
        igst: this.round2(Number(cols[7] || 0) || 0),
        totalAmount: this.round2(Number(cols[8] || 0) || 0),
      });
    }
    return rows;
  }

  async importCsv(tenantId: string, period: string, csvText: string) {
    const rows = this.parseCsv(csvText);
    if (!rows.length) throw new BadRequestException('No valid GSTR-2B rows found');
    const p = period?.trim() || new Date().toISOString().slice(0, 7);
    const imp = await this.prisma.gstr2bImport.create({
      data: {
        tenantId,
        period: p,
        source: 'CSV',
        lines: {
          create: rows.map((r) => ({
            supplierGstin: r.supplierGstin,
            supplierName: r.supplierName,
            invoiceNumber: r.invoiceNumber,
            invoiceDate: r.invoiceDate,
            taxableValue: r.taxableValue,
            cgst: r.cgst,
            sgst: r.sgst,
            igst: r.igst,
            totalAmount: r.totalAmount || this.round2(r.taxableValue + r.cgst + r.sgst + r.igst),
            matchStatus: 'UNMATCHED',
          })),
        },
      },
      include: { lines: true },
    });
    await this.autoMatch(tenantId, imp.id);
    return this.getImport(tenantId, imp.id);
  }

  async listImports(tenantId: string) {
    return this.prisma.gstr2bImport.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { lines: true } } },
      take: 50,
    });
  }

  async getImport(tenantId: string, id: string) {
    const imp = await this.prisma.gstr2bImport.findFirst({
      where: { id, tenantId },
      include: { lines: { orderBy: { invoiceNumber: 'asc' } } },
    });
    if (!imp) throw new NotFoundException('GSTR-2B import not found');
    const summary = {
      unmatched: imp.lines.filter((l) => l.matchStatus === 'UNMATCHED').length,
      matched: imp.lines.filter((l) => l.matchStatus === 'MATCHED').length,
      mismatch: imp.lines.filter((l) => l.matchStatus === 'MISMATCH').length,
      ignored: imp.lines.filter((l) => l.matchStatus === 'IGNORED').length,
    };
    return { ...imp, summary };
  }

  async autoMatch(tenantId: string, importId: string) {
    const imp = await this.prisma.gstr2bImport.findFirst({
      where: { id: importId, tenantId },
      include: { lines: true },
    });
    if (!imp) throw new NotFoundException('Import not found');

    for (const line of imp.lines) {
      if (line.matchStatus === 'IGNORED' || line.matchStatus === 'MATCHED') continue;
      const bill = await this.prisma.purchaseBill.findFirst({
        where: {
          tenantId,
          invoiceNumber: { equals: line.invoiceNumber, mode: 'insensitive' },
          status: { not: 'CANCELLED' },
        },
      });
      if (!bill) {
        await this.prisma.gstr2bLine.update({
          where: { id: line.id },
          data: { matchStatus: 'UNMATCHED', matchedPurchaseBillId: null },
        });
        continue;
      }
      const billTotal = Number(bill.totalAmount);
      const lineTotal = Number(line.totalAmount) || Number(line.taxableValue);
      const close = Math.abs(billTotal - lineTotal) < 1;
      await this.prisma.gstr2bLine.update({
        where: { id: line.id },
        data: {
          matchedPurchaseBillId: bill.id,
          matchStatus: close ? 'MATCHED' : 'MISMATCH',
          notes: close ? null : `Bill total ₹${billTotal} vs 2B ₹${lineTotal}`,
        },
      });
    }
    return this.getImport(tenantId, importId);
  }

  async ignoreLine(tenantId: string, lineId: string) {
    const line = await this.prisma.gstr2bLine.findFirst({
      where: { id: lineId, import: { tenantId } },
    });
    if (!line) throw new NotFoundException('Line not found');
    return this.prisma.gstr2bLine.update({
      where: { id: lineId },
      data: { matchStatus: 'IGNORED' },
    });
  }
}
