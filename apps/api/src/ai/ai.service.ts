import { Injectable, Inject, forwardRef, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';

@Injectable()
export class AiService {
  constructor(
    private prisma: PrismaService,
    @Optional() @Inject(forwardRef(() => InventoryService)) private inventory?: InventoryService,
  ) {}

  /**
   * Forecast math shared by the single-product and bulk-list endpoints so the two can't silently
   * diverge. Combines three signals from the per-invoice-line dates: recency weighting (the last 7
   * days count ~2x the rest of the window), a day-of-week multiplier (tomorrow's weekday vs the
   * window's overall daily average), and a damped trend slope (second half of the window vs the
   * first half). Still not real ML — labeled `method` accordingly.
   */
  private computeForecast(
    product: { id: string; name: string; stockQty: unknown } | null,
    lines: Array<{ quantity: number; createdAt: Date }>,
    days: number,
  ) {
    const now = new Date();
    const totalQty = lines.reduce((s, l) => s + l.quantity, 0);
    const currentStock = Number(product?.stockQty ?? 0);

    const recentCutoff = new Date(now.getTime() - 7 * 86400000);
    const recentDays = Math.min(7, days);
    const olderDays = Math.max(0, days - 7);
    let recentQty = 0;
    let olderQty = 0;
    for (const l of lines) {
      if (l.createdAt >= recentCutoff) recentQty += l.quantity;
      else olderQty += l.quantity;
    }
    const recentAvg = recentDays > 0 ? recentQty / recentDays : 0;
    const olderAvg = olderDays > 0 ? olderQty / olderDays : 0;
    const weightedAvg = olderDays > 0 ? (recentAvg * 2 + olderAvg) / 3 : recentAvg;

    const weekdayTotals = new Array(7).fill(0);
    const weekdayCounts = new Array(7).fill(0);
    for (let i = 0; i < days; i++) {
      const d = new Date(now.getTime() - i * 86400000);
      weekdayCounts[d.getDay()] += 1;
    }
    for (const l of lines) {
      weekdayTotals[l.createdAt.getDay()] += l.quantity;
    }
    const overallDailyAvg = days > 0 ? totalQty / days : 0;
    const targetWeekday = new Date(now.getTime() + 86400000).getDay();
    const weekdayCount = weekdayCounts[targetWeekday];
    const weekdayAvg = weekdayCount > 0 ? weekdayTotals[targetWeekday] / weekdayCount : overallDailyAvg;
    const weekdayMultiplier =
      overallDailyAvg > 0 ? Math.min(2, Math.max(0.5, weekdayAvg / overallDailyAvg)) : 1;

    const midCutoff = new Date(now.getTime() - (days / 2) * 86400000);
    let firstHalfQty = 0;
    let secondHalfQty = 0;
    for (const l of lines) {
      if (l.createdAt < midCutoff) firstHalfQty += l.quantity;
      else secondHalfQty += l.quantity;
    }
    const halfDays = days / 2;
    const firstHalfAvg = halfDays > 0 ? firstHalfQty / halfDays : 0;
    const secondHalfAvg = halfDays > 0 ? secondHalfQty / halfDays : 0;
    const trendSlope = firstHalfAvg > 0 ? (secondHalfAvg - firstHalfAvg) / firstHalfAvg : 0;
    const trendAdjustment = Math.min(1, Math.max(-0.5, trendSlope)) * 0.5;

    const dailyAvg = weightedAvg * weekdayMultiplier * (1 + trendAdjustment);
    const stockDays = dailyAvg > 0 ? Math.floor(currentStock / dailyAvg) : 999;

    return {
      productId: product?.id,
      productName: product?.name,
      periodDays: days,
      unitsSold: totalQty,
      dailyAverage: Math.round(dailyAvg * 100) / 100,
      currentStock,
      stockCoverDays: stockDays,
      suggestedReorderQty: dailyAvg > 0 ? Math.ceil(dailyAvg * 14) : 0,
      recommendation: stockDays < 7 ? 'REORDER_NOW' : stockDays < 14 ? 'REORDER_SOON' : 'OK',
      method: 'weighted_recency_weekday_trend',
    };
  }

  async getDemandForecast(tenantId: string, productId: string, days = 30) {
    const since = new Date(Date.now() - days * 86400000);
    const [lines, product] = await Promise.all([
      this.prisma.invoiceLine.findMany({
        where: { productId, invoice: { tenantId, status: 'FINALIZED', createdAt: { gte: since } } },
        select: { quantity: true, invoice: { select: { createdAt: true } } },
      }),
      this.prisma.product.findFirst({ where: { id: productId, tenantId } }),
    ]);
    const parsedLines = lines.map((l) => ({ quantity: Number(l.quantity), createdAt: l.invoice.createdAt }));

    // Zero-filled daily series for charting — the scoring math in computeForecast stays untouched.
    const now = new Date();
    const dayKey = (d: Date) => d.toISOString().slice(0, 10);
    const totals = new Map<string, number>();
    for (let i = days - 1; i >= 0; i--) {
      totals.set(dayKey(new Date(now.getTime() - i * 86400000)), 0);
    }
    for (const l of parsedLines) {
      const key = dayKey(l.createdAt);
      if (totals.has(key)) totals.set(key, (totals.get(key) ?? 0) + l.quantity);
    }
    const series = Array.from(totals.entries()).map(([date, qty]) => ({ date, qty }));

    return { ...this.computeForecast(product, parsedLines, days), series };
  }

  /** Exactly 2 queries regardless of catalog size — was previously 1 + 2N (N = active product count). */
  private async computeReorderList(tenantId: string, days = 30) {
    const since = new Date(Date.now() - days * 86400000);
    const [products, lines] = await Promise.all([
      this.prisma.product.findMany({ where: { tenantId, isActive: true } }),
      this.prisma.invoiceLine.findMany({
        where: {
          productId: { not: null },
          invoice: { tenantId, status: 'FINALIZED', createdAt: { gte: since } },
        },
        select: { productId: true, quantity: true, invoice: { select: { createdAt: true } } },
      }),
    ]);
    const linesByProduct = new Map<string, Array<{ quantity: number; createdAt: Date }>>();
    for (const l of lines) {
      const pid = l.productId as string;
      const arr = linesByProduct.get(pid) ?? [];
      arr.push({ quantity: Number(l.quantity), createdAt: l.invoice.createdAt });
      linesByProduct.set(pid, arr);
    }

    return products
      .map((p) => this.computeForecast(p, linesByProduct.get(p.id) ?? [], days))
      .filter((f) => f.recommendation !== 'OK');
  }

  async getSmartReorderList(
    tenantId: string,
    opts: {
      page?: number;
      pageSize?: number;
      search?: string;
      sortBy?: 'stockCoverDays' | 'suggestedReorderQty' | 'dailyAverage' | 'productName';
      sortDir?: 'asc' | 'desc';
      urgency?: 'REORDER_NOW' | 'REORDER_SOON' | 'all';
      days?: number;
    } = {},
  ) {
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 25));
    const sortBy = opts.sortBy ?? 'stockCoverDays';
    const sortDir = opts.sortDir ?? 'asc';
    const search = opts.search?.trim().toLowerCase();
    const urgency = opts.urgency && opts.urgency !== 'all' ? opts.urgency : undefined;

    let rows = await this.computeReorderList(tenantId, opts.days ?? 30);
    if (search) {
      rows = rows.filter((r) => r.productName?.toLowerCase().includes(search));
    }
    if (urgency) {
      rows = rows.filter((r) => r.recommendation === urgency);
    }
    rows = [...rows].sort((a, b) => {
      const av = sortBy === 'productName' ? (a.productName ?? '') : (a[sortBy] ?? 0);
      const bv = sortBy === 'productName' ? (b.productName ?? '') : (b[sortBy] ?? 0);
      const cmp = typeof av === 'string' ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return sortDir === 'desc' ? -cmp : cmp;
    });

    const total = rows.length;
    const items = rows.slice((page - 1) * pageSize, (page - 1) * pageSize + pageSize);
    return { items, total, page, pageSize };
  }

  async detectDuplicateImei(tenantId: string) {
    const serials = await this.prisma.productSerial.findMany({
      where: { product: { tenantId }, imei: { not: null } },
      include: { product: true },
    });

    const imeiMap: Record<string, typeof serials> = {};
    for (const s of serials) {
      const imei = s.imei!;
      if (!imeiMap[imei]) imeiMap[imei] = [];
      imeiMap[imei].push(s);
    }

    return Object.entries(imeiMap)
      .filter(([, list]) => list.length > 1)
      .map(([imei, list]) => ({
        imei,
        count: list.length,
        entries: list.map((s) => ({
          serialId: s.id,
          productName: s.product.name,
          status: s.status,
          serialNumber: s.serialNumber,
        })),
        risk: 'HIGH',
        message: 'Duplicate IMEI detected — possible fraud or data entry error',
      }));
  }

  async improveOcrHints(text: string) {
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const suggestions: Array<{ line: string; suggestion: string; confidence: number }> = [];

    const patterns: Array<{ regex: RegExp; field: string }> = [
      { regex: /^(name|customer|party|naam)\s*[:：]\s*(.+)/i, field: 'customer.name' },
      { regex: /^(phone|mobile|contact|mob)\s*[:：]\s*(.+)/i, field: 'customer.phone' },
      { regex: /^(gstin|gst)\s*[:：]\s*(.+)/i, field: 'customer.gstin' },
      { regex: /^(barcode|ean|upc)\s*[:：]\s*(.+)/i, field: 'line.barcode' },
      { regex: /^(sku|item|product|model)\s*[:：]\s*(.+)/i, field: 'line.product' },
      { regex: /^(qty|quantity|pcs)\s*[:：]\s*(\d+)/i, field: 'line.quantity' },
    ];

    for (const line of lines) {
      for (const { regex, field } of patterns) {
        const m = line.match(regex);
        if (m) {
          suggestions.push({ line, suggestion: `Map to ${field}: "${m[2] ?? m[1]}"`, confidence: 0.85 });
          break;
        }
      }
      if (/^\d{10,13}$/.test(line.replace(/\s/g, ''))) {
        suggestions.push({ line, suggestion: 'Likely barcode — lookup product', confidence: 0.7 });
      }
    }

    return { suggestions, cleanedText: text.replace(/\s{2,}/g, ' ').trim(), method: 'regex_field_match' };
  }

  /** Realtime-style shop alerts (pollable / future WebSocket) */
  async getRealtimeAlerts(tenantId: string) {
    const [lowStock, aging, pendingActions, readyRepairs, expiringBatches] = await Promise.all([
      this.prisma.product.findMany({
        where: { tenantId, isActive: true },
        take: 400,
      }),
      this.prisma.customer.findMany({
        where: { tenantId, outstandingBalance: { gt: 0 } },
        take: 50,
        orderBy: { outstandingBalance: 'desc' },
      }),
      this.prisma.aiAgentAction.findMany({
        where: { tenantId, status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
      this.prisma.repairJob.findMany({
        where: { tenantId, status: 'READY' },
        include: { customer: { select: { name: true } } },
        orderBy: { updatedAt: 'desc' },
        take: 10,
      }),
      this.prisma.productBatch.findMany({
        where: {
          tenantId,
          quantity: { gt: 0 },
          expiryDate: { gte: new Date(), lte: new Date(Date.now() + 14 * 86400000) },
        },
        include: { product: { select: { id: true, name: true } } },
        orderBy: { expiryDate: 'asc' },
        take: 15,
      }),
    ]);

    const low = lowStock
      .filter((p) => Number(p.stockQty) <= Number(p.lowStockThreshold))
      .slice(0, 60)
      .map((p) => ({
        type: 'LOW_STOCK',
        severity: Number(p.stockQty) <= 0 ? 'critical' : 'warn',
        message: `${p.name} stock ${Number(p.stockQty)} (threshold ${Number(p.lowStockThreshold)})`,
        productId: p.id,
      }));

    const credit = aging.slice(0, 50).map((c) => ({
      type: 'CREDIT_LIMIT',
      severity:
        Number(c.creditLimit) > 0 && Number(c.outstandingBalance) >= Number(c.creditLimit)
          ? 'critical'
          : 'info',
      message: `${c.name} outstanding ₹${Number(c.outstandingBalance).toFixed(0)}`,
      customerId: c.id,
    }));

    const actions = pendingActions.map((a) => ({
      type: 'AGENT_PENDING',
      severity: 'info',
      message: a.title,
      actionId: a.id,
    }));

    const readyForPickup = readyRepairs.map((r) => ({
      type: 'REPAIR_READY',
      severity: 'info',
      message: `Job ${r.jobNumber} ready for pickup — ${r.customer?.name ?? 'Walk-in'}`,
      jobId: r.id,
    }));

    const expiring = expiringBatches.map((b) => {
      const daysLeft = Math.ceil((b.expiryDate!.getTime() - Date.now()) / 86400000);
      return {
        type: 'EXPIRING_BATCH',
        severity: daysLeft <= 7 ? 'critical' : 'warn',
        message: `${b.product.name} batch ${b.batchNumber} expires in ${daysLeft}d (${Number(b.quantity)} units)`,
        productId: b.product.id,
      };
    });

    return {
      generatedAt: new Date().toISOString(),
      alerts: [...low, ...credit, ...actions, ...readyForPickup, ...expiring],
    };
  }

  /** Lowest-stock branch for a product — the reorder target most likely to actually need the stock. */
  private async findReorderBranch(tenantId: string, productId: string): Promise<string | null> {
    const stocks = await this.prisma.branchStock.findMany({
      where: { tenantId, productId },
      orderBy: { quantity: 'asc' },
      take: 1,
    });
    if (stocks[0]) return stocks[0].branchId;
    // Single-branch tenants (or products never explicitly branch-tracked) have no BranchStock
    // rows — fall back to the tenant's first branch, a deliberate single-branch default.
    const branch = await this.prisma.branch.findFirst({ where: { tenantId } });
    return branch?.id ?? null;
  }

  async proposeReorderActions(tenantId: string) {
    const reorder = await this.computeReorderList(tenantId, 30);
    const created = [];
    for (const item of [...reorder].sort((a, b) => a.stockCoverDays - b.stockCoverDays).slice(0, 10)) {
      if (!item.productId) continue;
      const branchId = await this.findReorderBranch(tenantId, item.productId);
      const action = await this.prisma.aiAgentAction.create({
        data: {
          tenantId,
          type: 'CREATE_PO_DRAFT',
          title: `Reorder ${item.productName} × ${item.suggestedReorderQty}`,
          payload: {
            productId: item.productId,
            quantity: item.suggestedReorderQty,
            recommendation: item.recommendation,
            branchId,
          },
          status: 'PENDING',
        },
      });
      created.push(action);
    }
    return created;
  }

  async listAgentActions(
    tenantId: string,
    opts: { page?: number; pageSize?: number; search?: string; status?: string } = {},
  ) {
    const page = Math.max(1, opts.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 25));
    const search = opts.search?.trim();
    const where = {
      tenantId,
      ...(opts.status && opts.status !== 'all' ? { status: opts.status as never } : {}),
      ...(search ? { title: { contains: search, mode: 'insensitive' as const } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.aiAgentAction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.aiAgentAction.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async decideAgentAction(
    tenantId: string,
    id: string,
    decision: 'APPROVED' | 'REJECTED',
  ) {
    const action = await this.prisma.aiAgentAction.findFirst({ where: { id, tenantId } });
    if (!action) return null;
    if (action.status !== 'PENDING') {
      return action;
    }

    if (decision === 'REJECTED') {
      return this.prisma.aiAgentAction.update({
        where: { id },
        data: { status: 'REJECTED', resultNote: 'Rejected by owner' },
      });
    }

    const payload = action.payload as { productId?: string; quantity?: number; branchId?: string };
    let poNote = 'Approved';
    if (this.inventory && payload.productId && payload.quantity) {
      try {
        let branchId = payload.branchId
          ? (await this.prisma.branch.findFirst({ where: { id: payload.branchId, tenantId } }))?.id
          : undefined;
        let usedLegacyFallback = false;
        if (!branchId) {
          // Legacy action created before branchId was captured in the payload — fall back to
          // an arbitrary branch, same as the old (imprecise) behavior, but flag it visibly.
          branchId = (await this.prisma.branch.findFirst({ where: { tenantId } }))?.id;
          usedLegacyFallback = true;
        }
        if (branchId) {
          const po = await this.inventory.createPurchaseOrder(tenantId, branchId, {
            notes: `AI reorder: ${action.title}`,
            lines: [{ productId: payload.productId, quantity: Number(payload.quantity) }],
          });
          poNote = usedLegacyFallback
            ? `Approved — created ${po.poNumber} (legacy action, used default branch)`
            : `Approved — created ${po.poNumber}`;
        }
      } catch (e) {
        poNote = `Approved but PO create failed: ${String(e)}`;
      }
    }

    return this.prisma.aiAgentAction.update({
      where: { id },
      data: {
        status: 'EXECUTED',
        resultNote: poNote,
      },
    });
  }
}
