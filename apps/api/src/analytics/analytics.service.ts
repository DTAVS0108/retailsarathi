import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { resolveReportPeriod, startOfDay, type ReportPeriod } from '../reports/period.util';
import { buildExportResponse } from '../reports/report-html.util';
import type { ReportFormat } from '../reports/report-export.util';
import { AiService } from '../ai/ai.service';

@Injectable()
export class AnalyticsService {
  constructor(
    private prisma: PrismaService,
    private aiService: AiService,
  ) {}

  private round2(n: number) {
    return Math.round(n * 100) / 100;
  }

  /** `null` when there's no meaningful baseline (previous period had zero) unless current is also
      zero, in which case it's a flat 0% rather than an undefined comparison. */
  private pctChange(current: number, previous: number): number | null {
    if (previous <= 0) return current > 0 ? null : 0;
    return this.round2(((current - previous) / previous) * 100);
  }

  private parseGstRate(raw?: string): number | null {
    if (raw == null || raw === '' || raw === 'all') return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      throw new BadRequestException('gstRate must be a number (e.g. 5, 12, 18, 28)');
    }
    return n;
  }

  /** Shared CSV/XLSX/print-HTML export for any Analytics table — reuses the same builder Reports uses. */
  private async exportRows(
    tenantId: string,
    format: string,
    opts: {
      filenameBase: string;
      title: string;
      period: ReportPeriod;
      columns: Array<{ key: string; label: string; align?: 'left' | 'right' }>;
      rows: Array<Record<string, unknown>>;
    },
  ) {
    if (!['csv', 'xlsx', 'pdf'].includes(format)) {
      throw new BadRequestException('format must be csv, xlsx, or pdf');
    }
    return buildExportResponse(this.prisma, {
      tenantId,
      format: format as ReportFormat,
      filenameBase: opts.filenameBase,
      title: opts.title,
      period: opts.period,
      summaryCards: [],
      columns: opts.columns,
      rows: opts.rows,
      csvHeaders: opts.columns.map((c) => c.key),
      xlsxSheets: [{ name: opts.title.slice(0, 31), headers: opts.columns.map((c) => c.key), rows: opts.rows }],
    });
  }

  private async getOverviewTotals(tenantId: string, from: Date, to: Date) {
    const [invoices, repairs] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { tenantId, status: 'FINALIZED', createdAt: { gte: from, lte: to } },
        include: { lines: true, branch: true },
      }),
      this.prisma.repairJob.findMany({
        where: { tenantId, status: 'DELIVERED', deliveredAt: { gte: from, lte: to } },
      }),
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

  /** `period` was previously ignored here (only raw from/to strings were read, and the page's
      default `?days=30` was silently dropped, so this always returned all-time totals) — now
      resolved the same way every sibling analytics endpoint already is. */
  async getOverview(tenantId: string, period: ReportPeriod) {
    const windowMs = period.to.getTime() - period.from.getTime();
    const previousFrom = new Date(period.from.getTime() - windowMs);

    const [current, previous] = await Promise.all([
      this.getOverviewTotals(tenantId, period.from, period.to),
      this.getOverviewTotals(tenantId, previousFrom, period.from),
    ]);

    return {
      ...current,
      previousPeriod: {
        retailRevenue: previous.retailRevenue,
        repairRevenue: previous.repairRevenue,
        totalRevenue: previous.totalRevenue,
        invoiceCount: previous.invoiceCount,
      },
      deltas: {
        retailRevenue: this.pctChange(current.retailRevenue, previous.retailRevenue),
        repairRevenue: this.pctChange(current.repairRevenue, previous.repairRevenue),
        totalRevenue: this.pctChange(current.totalRevenue, previous.totalRevenue),
        invoiceCount: this.pctChange(current.invoiceCount, previous.invoiceCount),
      },
    };
  }

  /** Compares today-so-far to yesterday at the same time of day (not full-day-vs-full-day), so
      the Dashboard's daily summary doesn't read as a false crash every morning before the day
      is over. */
  private async getDayOverDayRevenue(tenantId: string) {
    const now = new Date();
    const todayFrom = startOfDay(now);
    const yesterdayFrom = startOfDay(new Date(todayFrom.getTime() - 86400000));
    const yesterdayTo = new Date(yesterdayFrom.getTime() + (now.getTime() - todayFrom.getTime()));

    const [today, yesterday] = await Promise.all([
      this.getOverviewTotals(tenantId, todayFrom, now),
      this.getOverviewTotals(tenantId, yesterdayFrom, yesterdayTo),
    ]);

    return {
      todayRevenue: today.totalRevenue,
      yesterdaySoFarRevenue: yesterday.totalRevenue,
      deltaPct: this.pctChange(today.totalRevenue, yesterday.totalRevenue),
    };
  }

  /** A templated, arithmetic "what's going on today" summary — not an LLM call — built from the
      same alert data the AI Insights page already surfaces, so counts can never drift out of
      sync with the Alerts feed shown elsewhere on the Dashboard. */
  async getDailySummary(tenantId: string) {
    const [revenue, alertsResult] = await Promise.all([
      this.getDayOverDayRevenue(tenantId),
      this.aiService.getRealtimeAlerts(tenantId),
    ]);
    const alerts = alertsResult.alerts;

    return {
      revenue,
      lowStockCount: alerts.filter((a) => a.type === 'LOW_STOCK').length,
      criticalLowStockCount: alerts.filter((a) => a.type === 'LOW_STOCK' && a.severity === 'critical').length,
      repairsReadyCount: alerts.filter((a) => a.type === 'REPAIR_READY').length,
      creditLimitCount: alerts.filter((a) => a.type === 'CREDIT_LIMIT').length,
      pendingActionCount: alerts.filter((a) => a.type === 'AGENT_PENDING').length,
    };
  }

  /** Bundles three otherwise-unrelated aggregations (stock health, repair-status mix,
      purchase-order status mix + value) behind one endpoint for the Analytics page's Executive
      Overview band — same bundling rationale as `getDailySummary`. All plain Prisma queries, no
      cross-module service calls (mirrors `getOverviewTotals`'s own style), since the only shared
      logic (purchase-order value = Σ quantity × unitCost) is ~2 lines and not worth an
      AnalyticsModule → InventoryModule dependency to reuse from `InventoryService`. */
  async getExecutiveSummary(tenantId: string, period: ReportPeriod) {
    const [products, repairGroups, purchaseOrders] = await Promise.all([
      this.prisma.product.findMany({
        where: { tenantId, isActive: true },
        select: { stockQty: true, lowStockThreshold: true },
      }),
      this.prisma.repairJob.groupBy({
        by: ['status'],
        where: { tenantId, receivedAt: { gte: period.from, lte: period.to } },
        _count: true,
      }),
      this.prisma.purchaseOrder.findMany({
        where: { tenantId, createdAt: { gte: period.from, lte: period.to } },
        include: { lines: true, supplier: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    const activeProductCount = products.length;
    const healthyProductCount = products.filter((p) => Number(p.stockQty) > Number(p.lowStockThreshold)).length;
    const stockHealthPct = activeProductCount > 0 ? this.round2((healthyProductCount / activeProductCount) * 100) : 0;

    const repairByStatus = repairGroups.map((g) => ({ status: g.status, count: g._count }));
    const repairTotal = repairByStatus.reduce((s, g) => s + g.count, 0);
    const repairDelivered = repairByStatus.find((g) => g.status === 'DELIVERED')?.count ?? 0;
    const repairCancelled = repairByStatus.find((g) => g.status === 'CANCELLED')?.count ?? 0;

    const decoratedPOs = purchaseOrders.map((po) => ({
      id: po.id,
      poNumber: po.poNumber,
      supplierName: po.supplier?.name ?? 'Unknown supplier',
      status: po.status,
      createdAt: po.createdAt,
      orderedValue: po.lines.reduce((s, l) => s + Number(l.quantity) * Number(l.unitCost), 0),
    }));
    const totalOrderedValue = this.round2(decoratedPOs.reduce((s, po) => s + po.orderedValue, 0));
    const poByStatus: Record<string, number> = {};
    for (const po of decoratedPOs) poByStatus[po.status] = (poByStatus[po.status] ?? 0) + 1;

    return {
      stockHealthPct,
      activeProductCount,
      healthyProductCount,
      repairs: {
        total: repairTotal,
        delivered: repairDelivered,
        cancelled: repairCancelled,
        byStatus: repairByStatus,
      },
      purchaseOrders: {
        total: decoratedPOs.length,
        totalOrderedValue,
        byStatus: Object.entries(poByStatus).map(([status, count]) => ({ status, count })),
        recent: decoratedPOs.slice(0, 5).map((po) => ({ ...po, orderedValue: this.round2(po.orderedValue) })),
      },
    };
  }

  /** One invoice query, bucketed by week — powers every KPI card's sparkline in a single round
      trip instead of 4 separate per-metric fetches. */
  async getKpiTrend(tenantId: string, weeks = 8) {
    const now = new Date();
    const dow = (now.getDay() + 6) % 7; // 0 = Monday
    const thisWeekStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow);
    const buckets: Array<{ key: string; label: string; from: Date; to: Date }> = [];
    for (let i = weeks - 1; i >= 0; i--) {
      const from = new Date(thisWeekStart);
      from.setDate(from.getDate() - i * 7);
      const to = new Date(from);
      to.setDate(to.getDate() + 7);
      buckets.push({
        key: from.toISOString().slice(0, 10),
        label: from.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
        from,
        to,
      });
    }

    const rangeStart = buckets[0]!.from;
    const [invoices, repairs] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { tenantId, status: 'FINALIZED', createdAt: { gte: rangeStart } },
        select: { createdAt: true, grandTotal: true },
      }),
      this.prisma.repairJob.findMany({
        where: { tenantId, status: 'DELIVERED', deliveredAt: { gte: rangeStart } },
        select: { deliveredAt: true, finalAmount: true, estimateAmount: true },
      }),
    ]);

    const weekKeyFor = (date: Date): string => {
      const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      return d.toISOString().slice(0, 10);
    };

    const totals = new Map<string, { retailRevenue: number; repairRevenue: number; invoiceCount: number }>(
      buckets.map((b) => [b.key, { retailRevenue: 0, repairRevenue: 0, invoiceCount: 0 }]),
    );
    for (const inv of invoices) {
      const t = totals.get(weekKeyFor(inv.createdAt));
      if (!t) continue;
      t.retailRevenue += Number(inv.grandTotal);
      t.invoiceCount += 1;
    }
    for (const r of repairs) {
      if (!r.deliveredAt) continue;
      const t = totals.get(weekKeyFor(r.deliveredAt));
      if (!t) continue;
      t.repairRevenue += Number(r.finalAmount ?? r.estimateAmount ?? 0);
    }

    return {
      weeks: buckets.map((b) => {
        const t = totals.get(b.key)!;
        return {
          label: b.label,
          retailRevenue: this.round2(t.retailRevenue),
          repairRevenue: this.round2(t.repairRevenue),
          totalRevenue: this.round2(t.retailRevenue + t.repairRevenue),
          invoiceCount: t.invoiceCount,
        };
      }),
    };
  }

  /** Unions the most recent Invoices, RepairJob status changes, and StockLedger movements into
      one time-sorted feed for the Dashboard's "what just happened" widget. No AuditLog dependency —
      that table isn't populated by any of these flows yet, so this reads the source tables
      directly instead. */
  async getRecentActivity(tenantId: string, limit = 8) {
    const [invoices, repairs, stockMoves] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { tenantId, status: 'FINALIZED' },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          invoiceNumber: true,
          grandTotal: true,
          createdAt: true,
          customer: { select: { name: true } },
        },
      }),
      this.prisma.repairJob.findMany({
        where: { tenantId },
        orderBy: { updatedAt: 'desc' },
        take: limit,
        select: {
          id: true,
          jobNumber: true,
          status: true,
          updatedAt: true,
          customer: { select: { name: true } },
        },
      }),
      this.prisma.stockLedger.findMany({
        where: { tenantId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        select: {
          id: true,
          type: true,
          quantity: true,
          createdAt: true,
          product: { select: { name: true } },
        },
      }),
    ]);

    const events = [
      ...invoices.map((i) => ({
        kind: 'invoice' as const,
        id: i.id,
        label: `Invoice ${i.invoiceNumber}`,
        detail: `${this.round2(Number(i.grandTotal))} · ${i.customer?.name ?? 'Walk-in'}`,
        at: i.createdAt.toISOString(),
      })),
      ...repairs.map((r) => ({
        kind: 'repair' as const,
        id: r.id,
        label: `Job ${r.jobNumber}`,
        detail: `${r.status.replace(/_/g, ' ')} · ${r.customer?.name ?? 'Walk-in'}`,
        at: r.updatedAt.toISOString(),
      })),
      ...stockMoves.map((s) => ({
        kind: 'stock' as const,
        id: s.id,
        label: `${s.type.replace(/_/g, ' ')} · ${s.product?.name ?? 'Unknown product'}`,
        detail: `${Number(s.quantity) > 0 ? '+' : ''}${Number(s.quantity)} units`,
        at: s.createdAt.toISOString(),
      })),
    ]
      .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
      .slice(0, limit);

    return { events };
  }

  /** Top products (by revenue), top customers (by revenue), and top staff (by revenue) for a
      period — one invoice query plus a reuse of the existing salesperson aggregation, so this
      doesn't duplicate that logic. */
  async getTopPerformers(tenantId: string, period: ReportPeriod, limit = 5) {
    const [invoices, staff] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { tenantId, status: 'FINALIZED', createdAt: { gte: period.from, lte: period.to } },
        include: {
          customer: { select: { id: true, name: true } },
          lines: { select: { productId: true, productName: true, total: true, quantity: true } },
        },
      }),
      this.getSalespersonPerformance(tenantId, period),
    ]);

    const byProduct = new Map<string, { id: string; name: string; revenue: number; qty: number }>();
    const byCustomer = new Map<string, { id: string; name: string; revenue: number; invoices: number }>();

    for (const inv of invoices) {
      for (const line of inv.lines) {
        if (!line.productId) continue;
        const p = byProduct.get(line.productId) ?? { id: line.productId, name: line.productName, revenue: 0, qty: 0 };
        p.revenue += Number(line.total);
        p.qty += Number(line.quantity);
        byProduct.set(line.productId, p);
      }

      if (inv.customer) {
        const c =
          byCustomer.get(inv.customer.id) ??
          { id: inv.customer.id, name: inv.customer.name, revenue: 0, invoices: 0 };
        c.revenue += Number(inv.grandTotal);
        c.invoices += 1;
        byCustomer.set(inv.customer.id, c);
      }
    }

    const products = [...byProduct.values()]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, limit)
      .map((p) => ({ id: p.id, name: p.name, revenue: this.round2(p.revenue), secondaryMetric: p.qty }));

    const customers = [...byCustomer.values()]
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, limit)
      .map((c) => ({ id: c.id, name: c.name, revenue: this.round2(c.revenue), secondaryMetric: c.invoices }));

    // getSalespersonPerformance already returns revenue-sorted descending.
    const topStaff = staff.slice(0, limit).map((s) => ({
      id: s.userId,
      name: s.name,
      revenue: this.round2(s.revenue),
      secondaryMetric: s.invoiceCount,
    }));

    return { products, customers, staff: topStaff };
  }

  async getAbcAnalysis(tenantId: string, period: ReportPeriod, format?: string) {
    const lines = await this.prisma.invoiceLine.findMany({
      where: {
        invoice: { tenantId, status: 'FINALIZED', createdAt: { gte: period.from, lte: period.to } },
        productId: { not: null },
      },
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
    const rows = sorted.map((p) => {
      cumulative += p.revenue;
      const pct = cumulative / totalRevenue;
      const grade = pct <= 0.8 ? 'A' : pct <= 0.95 ? 'B' : 'C';
      return { ...p, cumulativePct: Math.round(pct * 100), grade };
    });

    if (format && format !== 'json') {
      return this.exportRows(tenantId, format, {
        filenameBase: `ABC_Analysis_${period.from.toISOString().slice(0, 10)}`,
        title: 'ABC Analysis',
        period,
        columns: [
          { key: 'name', label: 'Product' },
          { key: 'revenue', label: 'Revenue', align: 'right' },
          { key: 'qty', label: 'Qty', align: 'right' },
          { key: 'cumulativePct', label: 'Cumulative %', align: 'right' },
          { key: 'grade', label: 'Grade' },
        ],
        rows,
      });
    }
    return rows;
  }

  /** Persist ABC grades onto Product.abcGrade for cycle-count planning. */
  async refreshAbcGrades(tenantId: string, days = 90) {
    // No `format` passed, so this is always the row array, never the export-response shape.
    const rows = (await this.getAbcAnalysis(tenantId, resolveReportPeriod({ days }))) as Array<{
      productId: string;
      name: string;
      revenue: number;
      qty: number;
      cumulativePct: number;
      grade: string;
    }>;
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

  async getDeadStock(tenantId: string, period: ReportPeriod, format?: string) {
    const soldProductIds = new Set(
      (
        await this.prisma.invoiceLine.findMany({
          where: {
            invoice: { tenantId, status: 'FINALIZED', createdAt: { gte: period.from, lte: period.to } },
            productId: { not: null },
          },
          select: { productId: true },
          distinct: ['productId'],
        })
      ).map((l) => l.productId!),
    );

    const products = await this.prisma.product.findMany({
      where: { tenantId, isActive: true, stockQty: { gt: 0 } },
    });

    const rows = products
      .filter((p) => !soldProductIds.has(p.id))
      .map((p) => ({
        id: p.id,
        name: p.name,
        sku: p.sku,
        stockQty: Number(p.stockQty),
        valueAtCost: Number(p.stockQty) * Number(p.purchasePrice),
      }))
      .sort((a, b) => b.valueAtCost - a.valueAtCost);

    if (format && format !== 'json') {
      return this.exportRows(tenantId, format, {
        filenameBase: `Dead_Stock_${period.from.toISOString().slice(0, 10)}`,
        title: 'Dead Stock',
        period,
        columns: [
          { key: 'name', label: 'Product' },
          { key: 'sku', label: 'SKU' },
          { key: 'stockQty', label: 'Stock Qty', align: 'right' },
          { key: 'valueAtCost', label: 'Value at cost', align: 'right' },
        ],
        rows,
      });
    }
    return rows;
  }

  async getMarginBySku(tenantId: string, period: ReportPeriod, format?: string) {
    const lines = await this.prisma.invoiceLine.findMany({
      where: {
        invoice: { tenantId, status: 'FINALIZED', createdAt: { gte: period.from, lte: period.to } },
        productId: { not: null },
      },
      include: { product: true },
    });

    const byProduct: Record<string, { name: string; revenue: number; cost: number; qty: number }> = {};
    for (const line of lines) {
      const id = line.productId!;
      // Prefer the price-at-time-of-sale snapshot; legacy lines predating this field fall back
      // to the product's current purchasePrice (imprecise for them, but unavoidable retroactively).
      const unitCost = line.costPriceSnapshot != null ? Number(line.costPriceSnapshot) : Number(line.product?.purchasePrice ?? 0);
      const cost = unitCost * Number(line.quantity);
      if (!byProduct[id]) byProduct[id] = { name: line.productName, revenue: 0, cost: 0, qty: 0 };
      byProduct[id].revenue += Number(line.taxableAmount);
      byProduct[id].cost += cost;
      byProduct[id].qty += Number(line.quantity);
    }

    const rows = Object.entries(byProduct)
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

    if (format && format !== 'json') {
      return this.exportRows(tenantId, format, {
        filenameBase: `Margin_By_SKU_${period.from.toISOString().slice(0, 10)}`,
        title: 'Margin by SKU',
        period,
        columns: [
          { key: 'name', label: 'Product' },
          { key: 'revenue', label: 'Revenue', align: 'right' },
          { key: 'cost', label: 'Cost', align: 'right' },
          { key: 'margin', label: 'Margin', align: 'right' },
          { key: 'marginPct', label: 'Margin %', align: 'right' },
          { key: 'qty', label: 'Qty', align: 'right' },
        ],
        rows,
      });
    }
    return rows;
  }

  private async repairJobsDelivered(tenantId: string, from: Date, to?: Date) {
    return this.prisma.repairJob.findMany({
      where: {
        tenantId,
        status: 'DELIVERED',
        deliveredAt: to ? { gte: from, lt: to } : { gte: from },
      },
      include: {
        serviceType: { select: { id: true, name: true } },
        technician: { select: { id: true, name: true } },
        linkedInvoice: { select: { grandTotal: true } },
        loanerCheckouts: { select: { id: true } },
      },
    });
  }

  private summarizeRepairJobs(jobs: Awaited<ReturnType<AnalyticsService['repairJobsDelivered']>>) {
    const turnaroundDays = (j: (typeof jobs)[number]) =>
      j.deliveredAt ? (j.deliveredAt.getTime() - j.receivedAt.getTime()) / 86400000 : null;
    const avg = (arr: number[]) => (arr.length ? this.round2(arr.reduce((s, n) => s + n, 0) / arr.length) : 0);
    const revenueOf = (j: (typeof jobs)[number]) => (j.linkedInvoice ? Number(j.linkedInvoice.grandTotal) : 0);

    const turnarounds = jobs.map(turnaroundDays).filter((n): n is number => n != null);
    const totalRevenue = jobs.reduce((s, j) => s + revenueOf(j), 0);
    const jobsWithLoaner = jobs.filter((j) => j.loanerCheckouts.length > 0).length;

    return {
      totalDelivered: jobs.length,
      avgTurnaroundDays: avg(turnarounds),
      totalRevenue: this.round2(totalRevenue),
      loanerUsageRate: jobs.length ? this.round2(jobsWithLoaner / jobs.length) : 0,
    };
  }

  async getRepairAnalytics(tenantId: string, period: ReportPeriod) {
    const since = period.from;
    const until = period.to;
    const windowMs = until.getTime() - since.getTime();
    const previousSince = new Date(since.getTime() - windowMs);

    const [delivered, previousDelivered] = await Promise.all([
      this.repairJobsDelivered(tenantId, since, until),
      this.repairJobsDelivered(tenantId, previousSince, since),
    ]);

    const turnaroundDays = (j: (typeof delivered)[number]) =>
      j.deliveredAt ? (j.deliveredAt.getTime() - j.receivedAt.getTime()) / 86400000 : null;
    const avg = (arr: number[]) => (arr.length ? this.round2(arr.reduce((s, n) => s + n, 0) / arr.length) : 0);

    const byServiceType: Record<
      string,
      { name: string; jobCount: number; turnarounds: number[]; revenue: number }
    > = {};
    const byTechnician: Record<
      string,
      { name: string; jobCount: number; turnarounds: number[]; revenue: number }
    > = {};
    const byWeek: Record<string, { label: string; weekStart: Date; jobCount: number; revenue: number }> = {};

    for (const j of delivered) {
      const t = turnaroundDays(j);
      const revenue = j.linkedInvoice ? Number(j.linkedInvoice.grandTotal) : 0;

      const serviceKey = j.serviceType?.id ?? 'bespoke';
      const serviceName = j.serviceType?.name ?? 'Bespoke / free-typed';
      byServiceType[serviceKey] ??= { name: serviceName, jobCount: 0, turnarounds: [], revenue: 0 };
      byServiceType[serviceKey].jobCount += 1;
      byServiceType[serviceKey].revenue += revenue;
      if (t != null) byServiceType[serviceKey].turnarounds.push(t);

      if (j.technician) {
        byTechnician[j.technician.id] ??= { name: j.technician.name, jobCount: 0, turnarounds: [], revenue: 0 };
        byTechnician[j.technician.id].jobCount += 1;
        byTechnician[j.technician.id].revenue += revenue;
        if (t != null) byTechnician[j.technician.id].turnarounds.push(t);
      }

      if (j.deliveredAt) {
        const weekStart = new Date(j.deliveredAt);
        weekStart.setHours(0, 0, 0, 0);
        weekStart.setDate(weekStart.getDate() - weekStart.getDay());
        const key = weekStart.toISOString().slice(0, 10);
        byWeek[key] ??= {
          label: weekStart.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
          weekStart,
          jobCount: 0,
          revenue: 0,
        };
        byWeek[key].jobCount += 1;
        byWeek[key].revenue += revenue;
      }
    }

    const summary = this.summarizeRepairJobs(delivered);
    const previousSummary = this.summarizeRepairJobs(previousDelivered);

    return {
      periodDays: Math.round(windowMs / 86400000),
      ...summary,
      previousPeriod: {
        totalDelivered: previousSummary.totalDelivered,
        avgTurnaroundDays: previousSummary.avgTurnaroundDays,
        totalRevenue: previousSummary.totalRevenue,
      },
      deltas: {
        totalDelivered: this.pctChange(summary.totalDelivered, previousSummary.totalDelivered),
        totalRevenue: this.pctChange(summary.totalRevenue, previousSummary.totalRevenue),
        // Lower turnaround is better, so flip the sign — a negative delta here means "faster".
        avgTurnaroundDays:
          previousSummary.avgTurnaroundDays > 0
            ? this.round2(
                ((summary.avgTurnaroundDays - previousSummary.avgTurnaroundDays) /
                  previousSummary.avgTurnaroundDays) *
                  100,
              )
            : null,
      },
      trend: Object.values(byWeek)
        .sort((a, b) => a.weekStart.getTime() - b.weekStart.getTime())
        .map((w) => ({ label: w.label, jobCount: w.jobCount, revenue: this.round2(w.revenue) })),
      byServiceType: Object.values(byServiceType)
        .map((s) => ({
          name: s.name,
          jobCount: s.jobCount,
          avgTurnaroundDays: avg(s.turnarounds),
          revenue: this.round2(s.revenue),
        }))
        .sort((a, b) => b.jobCount - a.jobCount),
      byTechnician: Object.values(byTechnician)
        .map((t) => ({
          name: t.name,
          jobCount: t.jobCount,
          avgTurnaroundDays: avg(t.turnarounds),
          revenue: this.round2(t.revenue),
        }))
        .sort((a, b) => b.jobCount - a.jobCount),
    };
  }

  async getSalespersonPerformance(tenantId: string, period: ReportPeriod) {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        status: 'FINALIZED',
        createdAt: { gte: period.from, lte: period.to },
        soldByUserId: { not: null },
      },
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
  async getMonthlyReport(tenantId: string, months = 6, format?: string) {
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

    if (format && format !== 'json') {
      const now = new Date();
      return this.exportRows(tenantId, format, {
        filenameBase: `Monthly_Revenue_${start.toISOString().slice(0, 10)}`,
        title: 'Monthly Revenue',
        period: { from: start, to: now, label: `Last ${months} months`, fyKey: null, quarter: null },
        columns: [
          { key: 'label', label: 'Month' },
          { key: 'revenue', label: 'Revenue', align: 'right' },
          { key: 'invoices', label: 'Invoices', align: 'right' },
          { key: 'taxable', label: 'Taxable', align: 'right' },
          { key: 'tax', label: 'Tax', align: 'right' },
        ],
        rows: series,
      });
    }

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

  /**
   * Powers the Monthly-revenue trend widget's week/month/year toggle. Buckets are computed
   * up front (so every bucket appears even with zero invoices), then invoices are single-pass
   * bucketed by a precomputed key — avoids an O(buckets × invoices) nested scan for tenants
   * with a large invoice history.
   */
  /** `anchor` is the reference "most recent" instant the window is built backward from — `now`
      for the current window, or a shifted-back date for the comparison window. Extracted so both
      windows share identical bucketing logic instead of drifting apart. */
  private buildTrendBuckets(
    granularity: 'week' | 'month' | 'year',
    count: number,
    anchor: Date,
  ): Array<{ key: string; label: string; from: Date; to: Date }> {
    const buckets: Array<{ key: string; label: string; from: Date; to: Date }> = [];
    if (granularity === 'week') {
      const dow = (anchor.getDay() + 6) % 7; // 0 = Monday
      const thisWeekStart = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() - dow);
      for (let i = count - 1; i >= 0; i--) {
        const from = new Date(thisWeekStart);
        from.setDate(from.getDate() - i * 7);
        const to = new Date(from);
        to.setDate(to.getDate() + 7);
        buckets.push({
          key: from.toISOString().slice(0, 10),
          label: from.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
          from,
          to,
        });
      }
    } else if (granularity === 'year') {
      for (let i = count - 1; i >= 0; i--) {
        const y = anchor.getFullYear() - i;
        buckets.push({ key: String(y), label: String(y), from: new Date(y, 0, 1), to: new Date(y + 1, 0, 1) });
      }
    } else {
      const start0 = new Date(anchor.getFullYear(), anchor.getMonth() - (count - 1), 1);
      for (let i = 0; i < count; i++) {
        const from = new Date(start0.getFullYear(), start0.getMonth() + i, 1);
        const to = new Date(start0.getFullYear(), start0.getMonth() + i + 1, 1);
        buckets.push({
          key: `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}`,
          label: from.toLocaleString('en-IN', { month: 'short', year: '2-digit' }),
          from,
          to,
        });
      }
    }
    return buckets;
  }

  /** Moves `anchor` back by exactly `count` buckets of `granularity` — the comparison window's
      anchor, so its buckets land immediately before the current window's, with no gap or overlap. */
  private shiftAnchorBack(granularity: 'week' | 'month' | 'year', count: number, anchor: Date): Date {
    const shifted = new Date(anchor);
    if (granularity === 'week') shifted.setDate(shifted.getDate() - count * 7);
    else if (granularity === 'year') shifted.setFullYear(shifted.getFullYear() - count);
    else shifted.setMonth(shifted.getMonth() - count);
    return shifted;
  }

  /** Forward-only sibling of buildTrendBuckets — generates `n` buckets starting exactly at
      `startFrom` (the last actual bucket's exclusive `to`), for forecast points that have no
      underlying invoice data to bucket. */
  private buildForwardBuckets(
    granularity: 'week' | 'month' | 'year',
    n: number,
    startFrom: Date,
  ): Array<{ key: string; label: string; from: Date; to: Date }> {
    const buckets: Array<{ key: string; label: string; from: Date; to: Date }> = [];
    let from = new Date(startFrom);
    for (let i = 0; i < n; i++) {
      let to: Date;
      let key: string;
      let label: string;
      if (granularity === 'week') {
        to = new Date(from);
        to.setDate(to.getDate() + 7);
        key = from.toISOString().slice(0, 10);
        label = from.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
      } else if (granularity === 'year') {
        to = new Date(from.getFullYear() + 1, 0, 1);
        key = String(from.getFullYear());
        label = String(from.getFullYear());
      } else {
        to = new Date(from.getFullYear(), from.getMonth() + 1, 1);
        key = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}`;
        label = from.toLocaleString('en-IN', { month: 'short', year: '2-digit' });
      }
      buckets.push({ key, label, from: new Date(from), to });
      from = to;
    }
    return buckets;
  }

  /**
   * Damped, recency-weighted level-and-trend projection — not a predictive model, just a
   * heuristic extrapolation (same honesty convention as the AI reorder forecast's
   * `weighted_recency_weekday_trend` labeling). Deliberately does NOT compound a single
   * period-over-period growth rate: one anomalous spike (a real risk with real invoice data —
   * a bulk historical import, a single huge B2B order) would otherwise dominate the rate and
   * compound into an absurd multi-period forecast. Instead:
   *  - the projection's starting *level* is a recency-weighted average of the last up-to-3
   *    buckets (weights 1,2,3), not the single last bucket, so one outlier bucket is damped by
   *    the buckets around it rather than taken at face value;
   *  - the *trend* is the relative change between the first-half and second-half averages of the
   *    whole series, damped by a further 0.3× and clamped to ±25% per step before compounding —
   *    a coarse directional nudge, not a literal extrapolated rate.
   */
  private projectRevenueGrowth(points: Array<{ revenue: number }>, n: number): number[] {
    const values = points.map((p) => p.revenue);
    if (values.length < 2) {
      const flat = values[values.length - 1] ?? 0;
      return new Array(n).fill(flat);
    }

    const recentWindow = values.slice(-3);
    const weights = recentWindow.map((_, i) => i + 1);
    const weightedLevel =
      recentWindow.reduce((s, v, i) => s + v * weights[i], 0) / weights.reduce((s, w) => s + w, 0);

    const mid = Math.floor(values.length / 2) || 1;
    const firstHalf = values.slice(0, mid);
    const secondHalf = values.slice(mid);
    const firstAvg = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
    const secondAvg = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length;
    const trendSlope = firstAvg > 0 ? (secondAvg - firstAvg) / firstAvg : 0;
    const perStepGrowth = Math.min(0.25, Math.max(-0.25, trendSlope * 0.3));

    const projections: number[] = [];
    let last = weightedLevel;
    for (let i = 0; i < n; i++) {
      last = last * (1 + perStepGrowth);
      projections.push(Math.max(0, last));
    }
    return projections;
  }

  async getRevenueTrend(
    tenantId: string,
    granularity: 'week' | 'month' | 'year' = 'month',
    count = 6,
    opts: { forecast?: number; compare?: boolean } = {},
  ) {
    const now = new Date();
    const buckets = this.buildTrendBuckets(granularity, count, now);

    const previousBuckets = opts.compare
      ? this.buildTrendBuckets(granularity, count, this.shiftAnchorBack(granularity, count, now))
      : [];

    const allBuckets = [...previousBuckets, ...buckets];
    const queryStart = allBuckets[0]!.from;
    const invoices = await this.prisma.invoice.findMany({
      where: { tenantId, status: 'FINALIZED', createdAt: { gte: queryStart } },
      select: { createdAt: true, grandTotal: true },
    });

    const bucketKeyFor = this.makeBucketKeyFor(granularity);

    const totals = new Map<string, { revenue: number; invoices: number }>(
      allBuckets.map((b) => [b.key, { revenue: 0, invoices: 0 }]),
    );
    for (const inv of invoices) {
      const t = totals.get(bucketKeyFor(inv.createdAt));
      if (!t) continue; // outside the bucketed range (shouldn't happen given the `gte` filter above)
      t.revenue += Number(inv.grandTotal);
      t.invoices += 1;
    }

    const toPoint = (b: { key: string; label: string; from: Date; to: Date }) => ({
      key: b.key,
      label: b.label,
      from: b.from.toISOString(),
      to: b.to.toISOString(),
      revenue: this.round2(totals.get(b.key)?.revenue ?? 0),
      invoices: totals.get(b.key)?.invoices ?? 0,
    });

    const points = buckets.map(toPoint);

    const result: {
      granularity: typeof granularity;
      points: Array<ReturnType<typeof toPoint>>;
      comparePoints?: Array<ReturnType<typeof toPoint>>;
      forecast?: Array<ReturnType<typeof toPoint> & { isForecast: true }>;
    } = { granularity, points };

    if (opts.compare) {
      result.comparePoints = previousBuckets.map(toPoint);
    }

    if (opts.forecast && opts.forecast > 0) {
      const lastBucket = buckets[buckets.length - 1]!;
      const forecastBuckets = this.buildForwardBuckets(granularity, opts.forecast, lastBucket.to);
      const projected = this.projectRevenueGrowth(points, opts.forecast);
      result.forecast = forecastBuckets.map((b, i) => ({
        key: b.key,
        label: b.label,
        from: b.from.toISOString(),
        to: b.to.toISOString(),
        revenue: this.round2(projected[i] ?? 0),
        invoices: 0,
        isForecast: true as const,
      }));
    }

    return result;
  }

  /** Bucket-key function shared by `getRevenueTrend` and `getServiceForecast` — kept as a small
      standalone closure-builder rather than hoisted to a shared private method, since it closes
      over `granularity` and both call sites already build it fresh per-call. */
  private makeBucketKeyFor(granularity: 'week' | 'month' | 'year') {
    return (date: Date): string => {
      if (granularity === 'year') return String(date.getFullYear());
      if (granularity === 'week') {
        const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
        d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
        return d.toISOString().slice(0, 10);
      }
      return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    };
  }

  /** Retail-vs-repair revenue forecast, plus the top-3 repair service types and a reorder-soon
      product list — the Analytics page's dedicated Forecast section. Deliberately separate from
      `getRevenueTrend`/`projectRevenueGrowth`'s existing blended 2-step forecast (used by
      `RevenueTrendCard`, unchanged) rather than modifying it. Reuses `getOverviewTotals`'s
      retail/repair revenue definitions (Invoice.grandTotal / RepairJob.finalAmount??estimateAmount)
      so this section's numbers agree with the Retail/Repair revenue KPI cards shown above it —
      `getRepairAnalytics` computes repair revenue a different way (linkedInvoice.grandTotal), which
      would silently disagree with those KPI cards if reused here. */
  async getServiceForecast(tenantId: string, granularity: 'week' | 'month' | 'year' = 'month', count = 6, steps = 3) {
    const buckets = this.buildTrendBuckets(granularity, count, new Date());
    const queryStart = buckets[0]!.from;
    const bucketKeyFor = this.makeBucketKeyFor(granularity);

    const [invoices, repairJobs] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { tenantId, status: 'FINALIZED', createdAt: { gte: queryStart } },
        select: { createdAt: true, grandTotal: true },
      }),
      this.prisma.repairJob.findMany({
        where: { tenantId, status: 'DELIVERED', deliveredAt: { gte: queryStart } },
        select: {
          deliveredAt: true,
          finalAmount: true,
          estimateAmount: true,
          serviceTypeId: true,
          serviceType: { select: { name: true } },
        },
      }),
    ]);

    const retailTotals = new Map<string, number>(buckets.map((b) => [b.key, 0]));
    for (const inv of invoices) {
      const k = bucketKeyFor(inv.createdAt);
      if (retailTotals.has(k)) retailTotals.set(k, retailTotals.get(k)! + Number(inv.grandTotal));
    }

    const repairTotals = new Map<string, number>(buckets.map((b) => [b.key, 0]));
    const byService = new Map<string, { name: string; totals: Map<string, number> }>();
    for (const job of repairJobs) {
      if (!job.deliveredAt) continue;
      const k = bucketKeyFor(job.deliveredAt);
      if (!repairTotals.has(k)) continue;
      const revenue = Number(job.finalAmount ?? job.estimateAmount ?? 0);
      repairTotals.set(k, repairTotals.get(k)! + revenue);

      const svcId = job.serviceTypeId ?? 'bespoke';
      const svcName = job.serviceType?.name ?? 'Bespoke / free-typed';
      if (!byService.has(svcId)) byService.set(svcId, { name: svcName, totals: new Map(buckets.map((b) => [b.key, 0])) });
      const svc = byService.get(svcId)!;
      svc.totals.set(k, svc.totals.get(k)! + revenue);
    }

    const toPoints = (totals: Map<string, number>) =>
      buckets.map((b) => ({ key: b.key, label: b.label, revenue: this.round2(totals.get(b.key) ?? 0) }));

    const forecastBuckets = this.buildForwardBuckets(granularity, steps, buckets[buckets.length - 1]!.to);
    const toForecast = (points: Array<{ revenue: number }>) => {
      const projected = this.projectRevenueGrowth(points, steps);
      return forecastBuckets.map((b, i) => ({
        key: b.key,
        label: b.label,
        revenue: this.round2(projected[i] ?? 0),
        isForecast: true as const,
      }));
    };

    const retailPoints = toPoints(retailTotals);
    const repairPoints = toPoints(repairTotals);
    const retailForecast = toForecast(retailPoints);
    const repairForecast = toForecast(repairPoints);

    const totalPoints = buckets.map((b, i) => ({
      key: b.key,
      label: b.label,
      revenue: this.round2(retailPoints[i]!.revenue + repairPoints[i]!.revenue),
    }));
    const totalForecast = forecastBuckets.map((b, i) => ({
      key: b.key,
      label: b.label,
      revenue: this.round2(retailForecast[i]!.revenue + repairForecast[i]!.revenue),
      isForecast: true as const,
    }));

    const topServices = [...byService.entries()]
      .map(([id, v]) => ({ id, name: v.name, points: toPoints(v.totals) }))
      .sort((a, b) => b.points.reduce((s, p) => s + p.revenue, 0) - a.points.reduce((s, p) => s + p.revenue, 0))
      .slice(0, 3)
      .map((s) => ({ ...s, forecast: toForecast(s.points) }));

    return {
      granularity,
      count,
      steps,
      retail: { points: retailPoints, forecast: retailForecast },
      repair: { points: repairPoints, forecast: repairForecast },
      total: { points: totalPoints, forecast: totalForecast },
      topServices,
    };
  }

  /** Day-of-week × hour-of-day grid for a "peak hours" heatmap — always returns exactly 168
      (7×24) rows, zero-filled, so the frontend grid never has to guess at missing cells. */
  async getPeakHours(tenantId: string, days = 90) {
    const since = new Date(Date.now() - days * 86400000);
    const invoices = await this.prisma.invoice.findMany({
      where: { tenantId, status: 'FINALIZED', createdAt: { gte: since } },
      select: { createdAt: true, grandTotal: true },
    });

    const cells = new Map<string, { revenue: number; invoiceCount: number }>();
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        cells.set(`${day}-${hour}`, { revenue: 0, invoiceCount: 0 });
      }
    }
    for (const inv of invoices) {
      const day = inv.createdAt.getDay();
      const hour = inv.createdAt.getHours();
      const cell = cells.get(`${day}-${hour}`)!;
      cell.revenue += Number(inv.grandTotal);
      cell.invoiceCount += 1;
    }

    const grid: Array<{ day: number; hour: number; revenue: number; invoiceCount: number }> = [];
    for (let day = 0; day < 7; day++) {
      for (let hour = 0; hour < 24; hour++) {
        const cell = cells.get(`${day}-${hour}`)!;
        grid.push({ day, hour, revenue: this.round2(cell.revenue), invoiceCount: cell.invoiceCount });
      }
    }
    return { days, grid };
  }

  /** Stock in vs out for a date range (default last 30 days). */
  async getStockFlow(tenantId: string, period: ReportPeriod, format?: string) {
    const movements = await this.prisma.stockLedger.findMany({
      where: { tenantId, createdAt: { gte: period.from, lte: period.to } },
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

    const allMovements = movements.map((m) => ({
      id: m.id,
      type: m.type,
      quantity: Number(m.quantity),
      notes: m.notes,
      createdAt: m.createdAt,
      productId: m.productId,
      productName: m.product?.name ?? 'Unknown product',
      productSku: m.product?.sku ?? '',
    }));

    if (format && format !== 'json') {
      return this.exportRows(tenantId, format, {
        filenameBase: `Stock_Flow_${period.from.toISOString().slice(0, 10)}`,
        title: 'Stock Flow',
        period,
        columns: [
          { key: 'createdAt', label: 'Date' },
          { key: 'type', label: 'Type' },
          { key: 'productName', label: 'Product' },
          { key: 'productSku', label: 'SKU' },
          { key: 'quantity', label: 'Qty', align: 'right' },
          { key: 'notes', label: 'Notes' },
        ],
        rows: allMovements,
      });
    }

    return {
      days: Math.round((period.to.getTime() - period.from.getTime()) / 86400000),
      from: period.from.toISOString(),
      to: period.to.toISOString(),
      summary: {
        stockInQty,
        stockOutQty,
        netQty: stockInQty - stockOutQty,
        movementCount: movements.length,
      },
      byType: Object.values(byType).sort((a, b) => b.count - a.count),
      recent: allMovements.slice(0, 40),
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
