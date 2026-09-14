import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import type { ReportPeriod } from '../reports/period.util';

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  private round2(n: number) {
    return Math.round(n * 100) / 100;
  }

  private parseGstRate(raw?: string): number | null {
    if (raw == null || raw === '' || raw === 'all') return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      throw new BadRequestException('gstRate must be a number (e.g. 5, 12, 18, 28)');
    }
    return n;
  }

  async getOverview(tenantId: string, from?: string, to?: string) {
    const dateFilter = from || to ? { gte: from ? new Date(from) : undefined, lte: to ? new Date(to) : undefined } : undefined;

    const [invoices, repairs, products] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { tenantId, status: 'FINALIZED', ...(dateFilter ? { createdAt: dateFilter } : {}) },
        include: { lines: true, branch: true },
      }),
      this.prisma.repairJob.findMany({
        where: { tenantId, status: 'DELIVERED', ...(dateFilter ? { deliveredAt: dateFilter } : {}) },
      }),
      this.prisma.product.findMany({ where: { tenantId, isActive: true } }),
    ]);

    const retailRevenue = invoices.reduce((s, i) => s + Number(i.grandTotal), 0);
    const repairRevenue = repairs.reduce((s, r) => s + Number(r.finalAmount ?? r.estimateAmount ?? 0), 0);

    const byBranch: Record<string, { name: string; revenue: number; invoices: number }> = {};
    for (const inv of invoices) {
      const key = inv.branchId;
      if (!byBranch[key]) {
        byBranch[key] = { name: inv.branch?.name ?? 'Branch', revenue: 0, invoices: 0 };
      }
      byBranch[key].revenue += Number(inv.grandTotal);
      byBranch[key].invoices += 1;
    }

    return {
      retailRevenue,
      repairRevenue,
      totalRevenue: retailRevenue + repairRevenue,
      invoiceCount: invoices.length,
      repairCount: repairs.length,
      byBranch: Object.values(byBranch),
    };
  }

  async getAbcAnalysis(tenantId: string, days = 90) {
    const since = new Date(Date.now() - days * 86400000);
    const lines = await this.prisma.invoiceLine.findMany({
      where: { invoice: { tenantId, status: 'FINALIZED', createdAt: { gte: since } }, productId: { not: null } },
      include: { product: true },
    });

    const byProduct: Record<string, { name: string; revenue: number; qty: number }> = {};
    for (const line of lines) {
      const id = line.productId!;
      if (!byProduct[id]) byProduct[id] = { name: line.productName, revenue: 0, qty: 0 };
      byProduct[id].revenue += Number(line.total);
      byProduct[id].qty += Number(line.quantity);
    }

    const sorted = Object.entries(byProduct)
      .map(([productId, data]) => ({ productId, ...data }))
      .sort((a, b) => b.revenue - a.revenue);

    const totalRevenue = sorted.reduce((s, p) => s + p.revenue, 0) || 1;
    let cumulative = 0;
    return sorted.map((p) => {
      cumulative += p.revenue;
      const pct = cumulative / totalRevenue;
      const grade = pct <= 0.8 ? 'A' : pct <= 0.95 ? 'B' : 'C';
      return { ...p, cumulativePct: Math.round(pct * 100), grade };
    });
  }

  /** Persist ABC grades onto Product.abcGrade for cycle-count planning. */
  async refreshAbcGrades(tenantId: string, days = 90) {
    const rows = await this.getAbcAnalysis(tenantId, days);
    await this.prisma.$transaction(
      rows.map((r) =>
        this.prisma.product.updateMany({
          where: { id: r.productId, tenantId },
          data: { abcGrade: r.grade },
        }),
      ),
    );
    // Mark unsold active products as C
    const gradedIds = rows.map((r) => r.productId);
    await this.prisma.product.updateMany({
      where: {
        tenantId,
        isActive: true,
        ...(gradedIds.length ? { id: { notIn: gradedIds } } : {}),
      },
      data: { abcGrade: 'C' },
    });
    return { updated: rows.length, grades: { A: rows.filter((r) => r.grade === 'A').length, B: rows.filter((r) => r.grade === 'B').length, C: rows.filter((r) => r.grade === 'C').length } };
  }

  async getDeadStock(tenantId: string, days = 60) {
    const since = new Date(Date.now() - days * 86400000);
    const soldProductIds = new Set(
      (
        await this.prisma.invoiceLine.findMany({
          where: { invoice: { tenantId, status: 'FINALIZED', createdAt: { gte: since } }, productId: { not: null } },
          select: { productId: true },
          distinct: ['productId'],
        })
      ).map((l) => l.productId!),
    );

    const products = await this.prisma.product.findMany({
      where: { tenantId, isActive: true, stockQty: { gt: 0 } },
    });

    return products
      .filter((p) => !soldProductIds.has(p.id))
      .map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        stockQty: Number(p.stockQty),
        valueAtCost: Number(p.stockQty) * Number(p.purchasePrice),
      }))
      .sort((a, b) => b.valueAtCost - a.valueAtCost);
  }

  async getMarginBySku(tenantId: string, days = 30) {
    const since = new Date(Date.now() - days * 86400000);
    const lines = await this.prisma.invoiceLine.findMany({
      where: { invoice: { tenantId, status: 'FINALIZED', createdAt: { gte: since } }, productId: { not: null } },
      include: { product: true },
    });

    const byProduct: Record<string, { name: string; revenue: number; cost: number; qty: number }> = {};
    for (const line of lines) {
      const id = line.productId!;
      const cost = Number(line.product?.purchasePrice ?? 0) * Number(line.quantity);
      if (!byProduct[id]) byProduct[id] = { name: line.productName, revenue: 0, cost: 0, qty: 0 };
      byProduct[id].revenue += Number(line.taxableAmount);
      byProduct[id].cost += cost;
      byProduct[id].qty += Number(line.quantity);
    }

    return Object.entries(byProduct)
      .map(([productId, d]) => ({
        productId,
        name: d.name,
        revenue: d.revenue,
        cost: d.cost,
        margin: d.revenue - d.cost,
        marginPct: d.revenue > 0 ? Math.round(((d.revenue - d.cost) / d.revenue) * 100) : 0,
        qty: d.qty,
      }))
      .sort((a, b) => b.margin - a.margin);
  }

  async getSalespersonPerformance(tenantId: string, days = 30) {
    const since = new Date(Date.now() - days * 86400000);
    const invoices = await this.prisma.invoice.findMany({
      where: { tenantId, status: 'FINALIZED', createdAt: { gte: since }, soldByUserId: { not: null } },
    });

    const byUser: Record<string, { revenue: number; count: number }> = {};
    for (const inv of invoices) {
      const uid = inv.soldByUserId!;
      if (!byUser[uid]) byUser[uid] = { revenue: 0, count: 0 };
      byUser[uid].revenue += Number(inv.grandTotal);
      byUser[uid].count += 1;
    }

    const users = await this.prisma.user.findMany({
      where: { id: { in: Object.keys(byUser) } },
      select: { id: true, name: true, role: true },
    });

    return users.map((u) => ({
      userId: u.id,
      name: u.name,
      role: u.role,
      revenue: byUser[u.id]?.revenue ?? 0,
      invoiceCount: byUser[u.id]?.count ?? 0,
    })).sort((a, b) => b.revenue - a.revenue);
  }

  /** Last N calendar months of sales + invoice counts. */
  async getMonthlyReport(tenantId: string, months = 6) {
    const start = new Date();
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
    start.setMonth(start.getMonth() - (months - 1));

    const invoices = await this.prisma.invoice.findMany({
      where: { tenantId, status: 'FINALIZED', createdAt: { gte: start } },
      select: {
        createdAt: true,
        grandTotal: true,
        totalCgst: true,
        totalSgst: true,
        totalIgst: true,
        subtotal: true,
      },
    });

    const buckets: Record<
      string,
      { month: string; label: string; revenue: number; invoices: number; taxable: number; tax: number }
    > = {};

    for (let i = 0; i < months; i++) {
      const d = new Date(start);
      d.setMonth(start.getMonth() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      buckets[key] = {
        month: key,
        label: d.toLocaleString('en-IN', { month: 'short', year: 'numeric' }),
        revenue: 0,
        invoices: 0,
        taxable: 0,
        tax: 0,
      };
    }

    for (const inv of invoices) {
      const d = inv.createdAt;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      if (!buckets[key]) continue;
      buckets[key].revenue += Number(inv.grandTotal);
      buckets[key].invoices += 1;
      buckets[key].taxable += Number(inv.subtotal);
      buckets[key].tax +=
        Number(inv.totalCgst) + Number(inv.totalSgst) + Number(inv.totalIgst);
    }

    const series = Object.values(buckets);
    const totalRevenue = series.reduce((s, m) => s + m.revenue, 0);
    const totalInvoices = series.reduce((s, m) => s + m.invoices, 0);
    const best = [...series].sort((a, b) => b.revenue - a.revenue)[0] ?? null;

    return {
      months: series,
      summary: {
        totalRevenue,
        totalInvoices,
        avgMonthlyRevenue: months > 0 ? totalRevenue / months : 0,
        bestMonth: best?.label ?? null,
        bestMonthRevenue: best?.revenue ?? 0,
      },
    };
  }

  /** Stock in vs out for a date range (default last 30 days). */
  async getStockFlow(tenantId: string, days = 30) {
    const since = new Date(Date.now() - days * 86400000);
    const movements = await this.prisma.stockLedger.findMany({
      where: { tenantId, createdAt: { gte: since } },
      include: { product: { select: { name: true, sku: true } } },
      orderBy: { createdAt: 'desc' },
    });

    let stockInQty = 0;
    let stockOutQty = 0;
    const byType: Record<string, { type: string; qtyIn: number; qtyOut: number; count: number }> = {};

    for (const m of movements) {
      const qty = Number(m.quantity);
      const type = m.type;
      if (!byType[type]) byType[type] = { type, qtyIn: 0, qtyOut: 0, count: 0 };
      byType[type].count += 1;
      if (qty >= 0) {
        stockInQty += qty;
        byType[type].qtyIn += qty;
      } else {
        stockOutQty += Math.abs(qty);
        byType[type].qtyOut += Math.abs(qty);
      }
    }

    return {
      days,
      from: since.toISOString(),
      to: new Date().toISOString(),
      summary: {
        stockInQty,
        stockOutQty,
        netQty: stockInQty - stockOutQty,
        movementCount: movements.length,
      },
      byType: Object.values(byType).sort((a, b) => b.count - a.count),
      recent: movements.slice(0, 40).map((m) => ({
        id: m.id,
        type: m.type,
        quantity: Number(m.quantity),
        notes: m.notes,
        createdAt: m.createdAt,
        productId: m.productId,
        productName: m.product?.name ?? 'Unknown product',
        productSku: m.product?.sku ?? '',
      })),
    };
  }

  /**
   * Sale register — same columns as buy:
   * SN, Date, Name, GSTIN, QTY, Invoice No., TaxAmount, CGST, SGST, Total Tax, Total Amount.
   * Optional gstRate filters to that slab (mixed invoices show slab portion only).
   */
  async getSaleLedger(tenantId: string, period: ReportPeriod, gstRate?: string) {
    const slabFilter = this.parseGstRate(gstRate);
    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        status: 'FINALIZED',
        createdAt: { gte: period.from, lte: period.to },
      },
      orderBy: { createdAt: 'desc' },
      take: 2000,
      include: {
        customer: { select: { id: true, name: true, phone: true, gstin: true, stateCode: true } },
        payments: { select: { method: true, amount: true } },
        lines: {
          select: {
            productName: true,
            quantity: true,
            total: true,
            gstRate: true,
            taxableAmount: true,
            cgst: true,
            sgst: true,
            igst: true,
          },
        },
      },
    });

    const slabTotals: Record<
      string,
      { gstRate: number; taxable: number; tax: number; totalAmount: number; count: number }
    > = {};
    const entries: Array<Record<string, unknown>> = [];

    for (const inv of invoices) {
      const sign = inv.type === 'CREDIT_NOTE' ? -1 : 1;
      const linesBySlab = new Map<
        number,
        { taxable: number; tax: number; total: number; qty: number; cgst: number; sgst: number; igst: number }
      >();

      for (const line of inv.lines) {
        const rate = Number(line.gstRate);
        const key = Number.isFinite(rate) ? rate : 0;
        const cur = linesBySlab.get(key) ?? {
          taxable: 0,
          tax: 0,
          total: 0,
          qty: 0,
          cgst: 0,
          sgst: 0,
          igst: 0,
        };
        cur.taxable += Number(line.taxableAmount);
        cur.cgst += Number(line.cgst);
        cur.sgst += Number(line.sgst);
        cur.igst += Number(line.igst);
        cur.tax += Number(line.cgst) + Number(line.sgst) + Number(line.igst);
        cur.total += Number(line.total);
        cur.qty += Number(line.quantity);
        linesBySlab.set(key, cur);

        const sk = String(key);
        if (!slabTotals[sk]) {
          slabTotals[sk] = { gstRate: key, taxable: 0, tax: 0, totalAmount: 0, count: 0 };
        }
        slabTotals[sk].taxable += sign * Number(line.taxableAmount);
        slabTotals[sk].tax += sign * (Number(line.cgst) + Number(line.sgst) + Number(line.igst));
        slabTotals[sk].totalAmount += sign * Number(line.total);
      }

      const baseMeta = {
        date: inv.createdAt,
        name: inv.customer?.name ?? 'Walk-in',
        gstin: inv.customer?.gstin ?? null,
        invoiceNumber: inv.invoiceNumber,
        documentType: inv.type,
        customerId: inv.customer?.id ?? null,
        customerPhone: inv.customer?.phone ?? null,
        customerState: inv.customer?.stateCode ?? null,
        payments: inv.payments.map((p) => ({ method: p.method, amount: Number(p.amount) })),
        customerName: inv.customer?.name ?? 'Walk-in',
        customerGstin: inv.customer?.gstin ?? null,
      };

      if (slabFilter != null) {
        const match = linesBySlab.get(slabFilter);
        if (!match || (match.taxable === 0 && match.total === 0)) continue;
        const taxAmount = this.round2(sign * match.taxable);
        const totalTax = this.round2(sign * match.tax);
        const totalAmount = this.round2(sign * match.total);
        entries.push({
          ...baseMeta,
          id: inv.id,
          qty: this.round2(sign * match.qty),
          taxAmount,
          cgst: this.round2(sign * match.cgst),
          sgst: this.round2(sign * match.sgst),
          igst: this.round2(sign * match.igst),
          totalTax,
          totalAmount,
          gstRate: slabFilter,
          lineCount: inv.lines.filter((l) => Number(l.gstRate) === slabFilter).length,
          itemSummary: inv.lines
            .filter((l) => Number(l.gstRate) === slabFilter)
            .slice(0, 3)
            .map((l) => `${l.productName}×${Number(l.quantity)}`)
            .join(', '),
          taxable: taxAmount,
          tax: totalTax,
          amount: totalAmount,
        });
        const sk = String(slabFilter);
        if (slabTotals[sk]) slabTotals[sk].count += 1;
        continue;
      }

      const cgst = Number(inv.totalCgst);
      const sgst = Number(inv.totalSgst);
      const igst = Number(inv.totalIgst);
      const totalTax = this.round2(cgst + sgst + igst);
      const qty = inv.lines.reduce((s, l) => s + Number(l.quantity), 0);
      const taxAmount = this.round2(sign * Number(inv.subtotal));
      const totalAmount = this.round2(sign * Number(inv.grandTotal));
      entries.push({
        ...baseMeta,
        id: inv.id,
        qty: this.round2(qty * sign),
        taxAmount,
        cgst: this.round2(sign * cgst),
        sgst: this.round2(sign * sgst),
        igst: this.round2(sign * igst),
        totalTax: this.round2(sign * totalTax),
        totalAmount,
        lineCount: inv.lines.length,
        itemSummary: inv.lines
          .slice(0, 3)
          .map((l) => `${l.productName}×${Number(l.quantity)}`)
          .join(', '),
        taxable: taxAmount,
        tax: this.round2(sign * totalTax),
        amount: totalAmount,
      });
    }

    if (slabFilter == null) {
      for (const inv of invoices) {
        const seen = new Set<number>();
        for (const line of inv.lines) {
          const rate = Number(line.gstRate);
          const key = Number.isFinite(rate) ? rate : 0;
          if (seen.has(key)) continue;
          seen.add(key);
          const sk = String(key);
          if (slabTotals[sk]) slabTotals[sk].count += 1;
        }
      }
    }

    entries.forEach((e, i) => {
      e.sn = i + 1;
    });

    const byPayment: Record<string, number> = {};
    for (const inv of invoices) {
      if (inv.type === 'CREDIT_NOTE') continue;
      for (const p of inv.payments) {
        byPayment[p.method] = (byPayment[p.method] ?? 0) + Number(p.amount);
      }
    }

    const typed = entries as Array<{
      documentType: string;
      qty: number;
      taxAmount: number;
      cgst: number;
      sgst: number;
      totalTax: number;
      totalAmount: number;
    }>;

    return {
      period: {
        from: period.from.toISOString(),
        to: period.to.toISOString(),
        label: period.label,
        fyKey: period.fyKey,
        quarter: period.quarter,
      },
      from: period.from.toISOString(),
      to: period.to.toISOString(),
      summary: {
        billCount: typed.length,
        entryCount: typed.length,
        invoiceCount: typed.filter((e) => e.documentType === 'TAX_INVOICE').length,
        creditNoteCount: typed.filter((e) => e.documentType === 'CREDIT_NOTE').length,
        totalQty: typed.reduce((s, e) => s + e.qty, 0),
        taxableAmount: typed.reduce((s, e) => s + e.taxAmount, 0),
        totalCgst: typed.reduce((s, e) => s + e.cgst, 0),
        totalSgst: typed.reduce((s, e) => s + e.sgst, 0),
        totalTax: typed.reduce((s, e) => s + e.totalTax, 0),
        totalAmount: typed.reduce((s, e) => s + e.totalAmount, 0),
        totalSales: typed.reduce((s, e) => s + e.totalAmount, 0),
        grossSales: typed
          .filter((e) => e.documentType === 'TAX_INVOICE')
          .reduce((s, e) => s + e.totalAmount, 0),
        returnsTotal: typed
          .filter((e) => e.documentType === 'CREDIT_NOTE')
          .reduce((s, e) => s + Math.abs(e.totalAmount), 0),
        gstRate: slabFilter,
        byGstSlab: Object.values(slabTotals).sort((a, b) => a.gstRate - b.gstRate),
        byPayment: Object.entries(byPayment).map(([method, amount]) => ({ method, amount })),
      },
      entries,
    };
  }

  /**
   * Buy / supplier purchase register — same columns as sale.
   * Optional gstRate filters to that slab (mixed bills show slab portion only).
   */
  async getBuyLedger(tenantId: string, period: ReportPeriod, gstRate?: string) {
    const slabFilter = this.parseGstRate(gstRate);
    const bills = await this.prisma.purchaseBill.findMany({
      where: {
        tenantId,
        status: { notIn: ['CANCELLED', 'DRAFT'] },
        OR: [
          { invoiceDate: { gte: period.from, lte: period.to } },
          {
            AND: [
              { invoiceDate: null },
              { createdAt: { gte: period.from, lte: period.to } },
            ],
          },
        ],
      },
      orderBy: [{ invoiceDate: 'desc' }, { createdAt: 'desc' }],
      take: 2000,
      include: {
        supplier: { select: { id: true, name: true, gstin: true } },
        lines: { select: { quantity: true, lineTotal: true, gstRate: true } },
      },
    });

    const slabTotals: Record<
      string,
      { gstRate: number; taxable: number; tax: number; totalAmount: number; count: number }
    > = {};
    const entries: Array<Record<string, unknown>> = [];

    for (const b of bills) {
      const date = b.invoiceDate ?? b.createdAt;
      const name = b.supplier?.name ?? b.supplierName ?? '—';
      const gstin = b.supplier?.gstin ?? b.gstin ?? null;
      const linesBySlab = new Map<number, { taxable: number; tax: number; total: number; qty: number }>();

      for (const line of b.lines) {
        const rate = line.gstRate != null ? Number(line.gstRate) : 0;
        const key = Number.isFinite(rate) ? rate : 0;
        const taxable = Number(line.lineTotal);
        const tax = key > 0 ? (taxable * key) / 100 : 0;
        const lineTotal = taxable + tax;
        const cur = linesBySlab.get(key) ?? { taxable: 0, tax: 0, total: 0, qty: 0 };
        cur.taxable += taxable;
        cur.tax += tax;
        cur.total += lineTotal;
        cur.qty += Number(line.quantity);
        linesBySlab.set(key, cur);

        const sk = String(key);
        if (!slabTotals[sk]) {
          slabTotals[sk] = { gstRate: key, taxable: 0, tax: 0, totalAmount: 0, count: 0 };
        }
        slabTotals[sk].taxable += taxable;
        slabTotals[sk].tax += tax;
        slabTotals[sk].totalAmount += lineTotal;
      }

      if (slabFilter != null) {
        const match = linesBySlab.get(slabFilter);
        if (!match || match.total === 0) continue;
        entries.push({
          id: b.id,
          date,
          name,
          gstin,
          qty: this.round2(match.qty),
          invoiceNumber: b.invoiceNumber,
          taxAmount: this.round2(match.taxable),
          cgst: this.round2(match.tax / 2),
          sgst: this.round2(match.tax / 2),
          igst: 0,
          totalTax: this.round2(match.tax),
          totalAmount: this.round2(match.total),
          gstRate: slabFilter,
          supplierId: b.supplierId ?? b.supplier?.id ?? null,
          status: b.status,
          documentType: 'PURCHASE_BILL',
        });
        const sk = String(slabFilter);
        if (slabTotals[sk]) slabTotals[sk].count += 1;
        continue;
      }

      const qty = b.lines.reduce((s, l) => s + Number(l.quantity), 0);
      const cgst = Number(b.cgstAmount);
      const sgst = Number(b.sgstAmount);
      const igst = Number(b.igstAmount);
      const totalTax = Number(b.taxAmount) || this.round2(cgst + sgst + igst);
      entries.push({
        id: b.id,
        date,
        name,
        gstin,
        qty: this.round2(qty),
        invoiceNumber: b.invoiceNumber,
        taxAmount: this.round2(Number(b.subtotal)),
        cgst: this.round2(cgst),
        sgst: this.round2(sgst),
        igst: this.round2(igst),
        totalTax: this.round2(totalTax),
        totalAmount: this.round2(Number(b.totalAmount)),
        supplierId: b.supplierId ?? b.supplier?.id ?? null,
        status: b.status,
        documentType: 'PURCHASE_BILL',
      });
    }

    if (slabFilter == null) {
      for (const b of bills) {
        const seen = new Set<number>();
        for (const line of b.lines) {
          const rate = line.gstRate != null ? Number(line.gstRate) : 0;
          const key = Number.isFinite(rate) ? rate : 0;
          if (seen.has(key)) continue;
          seen.add(key);
          const sk = String(key);
          if (slabTotals[sk]) slabTotals[sk].count += 1;
        }
      }
    }

    entries.forEach((e, i) => {
      e.sn = i + 1;
    });

    const typed = entries as Array<{
      qty: number;
      taxAmount: number;
      cgst: number;
      sgst: number;
      totalTax: number;
      totalAmount: number;
    }>;

    return {
      period: {
        from: period.from.toISOString(),
        to: period.to.toISOString(),
        label: period.label,
        fyKey: period.fyKey,
        quarter: period.quarter,
      },
      from: period.from.toISOString(),
      to: period.to.toISOString(),
      summary: {
        billCount: typed.length,
        entryCount: typed.length,
        totalQty: typed.reduce((s, e) => s + e.qty, 0),
        totalQtyIn: typed.reduce((s, e) => s + e.qty, 0),
        taxableAmount: typed.reduce((s, e) => s + e.taxAmount, 0),
        totalCgst: typed.reduce((s, e) => s + e.cgst, 0),
        totalSgst: typed.reduce((s, e) => s + e.sgst, 0),
        totalTax: typed.reduce((s, e) => s + e.totalTax, 0),
        totalAmount: typed.reduce((s, e) => s + e.totalAmount, 0),
        estimatedSpend: typed.reduce((s, e) => s + e.totalAmount, 0),
        gstRate: slabFilter,
        byGstSlab: Object.values(slabTotals).sort((a, b) => a.gstRate - b.gstRate),
      },
      entries,
    };
  }
}
