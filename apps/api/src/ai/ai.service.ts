import { Injectable, Inject, forwardRef, Optional } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';

@Injectable()
export class AiService {
  constructor(
    private prisma: PrismaService,
    @Optional() @Inject(forwardRef(() => InventoryService)) private inventory?: InventoryService,
  ) {}

  async getDemandForecast(tenantId: string, productId: string, days = 30) {
    const since = new Date(Date.now() - days * 86400000);
    const lines = await this.prisma.invoiceLine.findMany({
      where: { productId, invoice: { tenantId, status: 'FINALIZED', createdAt: { gte: since } } },
    });
    const totalQty = lines.reduce((s, l) => s + Number(l.quantity), 0);
    const dailyAvg = totalQty / days;
    const product = await this.prisma.product.findFirst({ where: { id: productId, tenantId } });
    const stockDays = dailyAvg > 0 ? Math.floor(Number(product?.stockQty ?? 0) / dailyAvg) : 999;

    return {
      productId,
      productName: product?.name,
      periodDays: days,
      unitsSold: totalQty,
      dailyAverage: Math.round(dailyAvg * 100) / 100,
      currentStock: Number(product?.stockQty ?? 0),
      stockCoverDays: stockDays,
      suggestedReorderQty: dailyAvg > 0 ? Math.ceil(dailyAvg * 14) : 0,
      recommendation: stockDays < 7 ? 'REORDER_NOW' : stockDays < 14 ? 'REORDER_SOON' : 'OK',
    };
  }

  async getSmartReorderList(tenantId: string) {
    const products = await this.prisma.product.findMany({ where: { tenantId, isActive: true } });
    const forecasts = await Promise.all(products.map((p) => this.getDemandForecast(tenantId, p.id)));
    return forecasts
      .filter((f) => f.recommendation !== 'OK')
      .sort((a, b) => a.stockCoverDays - b.stockCoverDays);
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

    return { suggestions, cleanedText: text.replace(/\s{2,}/g, ' ').trim() };
  }

  /** Realtime-style shop alerts (pollable / future WebSocket) */
  async getRealtimeAlerts(tenantId: string) {
    const [lowStock, aging, pendingActions] = await Promise.all([
      this.prisma.product.findMany({
        where: { tenantId, isActive: true },
        take: 200,
      }),
      this.prisma.customer.findMany({
        where: { tenantId, outstandingBalance: { gt: 0 } },
        take: 20,
        orderBy: { outstandingBalance: 'desc' },
      }),
      this.prisma.aiAgentAction.findMany({
        where: { tenantId, status: 'PENDING' },
        orderBy: { createdAt: 'desc' },
        take: 20,
      }),
    ]);

    const low = lowStock
      .filter((p) => Number(p.stockQty) <= Number(p.lowStockThreshold))
      .slice(0, 15)
      .map((p) => ({
        type: 'LOW_STOCK',
        severity: Number(p.stockQty) <= 0 ? 'critical' : 'warn',
        message: `${p.name} stock ${Number(p.stockQty)} (threshold ${Number(p.lowStockThreshold)})`,
        productId: p.id,
      }));

    const credit = aging.slice(0, 10).map((c) => ({
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

    return {
      generatedAt: new Date().toISOString(),
      alerts: [...low, ...credit, ...actions],
    };
  }

  async proposeReorderActions(tenantId: string) {
    const reorder = await this.getSmartReorderList(tenantId);
    const created = [];
    for (const item of reorder.slice(0, 10)) {
      const action = await this.prisma.aiAgentAction.create({
        data: {
          tenantId,
          type: 'CREATE_PO_DRAFT',
          title: `Reorder ${item.productName} × ${item.suggestedReorderQty}`,
          payload: {
            productId: item.productId,
            quantity: item.suggestedReorderQty,
            recommendation: item.recommendation,
          },
          status: 'PENDING',
        },
      });
      created.push(action);
    }
    return created;
  }

  listAgentActions(tenantId: string, status?: string) {
    return this.prisma.aiAgentAction.findMany({
      where: {
        tenantId,
        ...(status ? { status: status as never } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
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

    const payload = action.payload as { productId?: string; quantity?: number };
    let poNote = 'Approved';
    if (this.inventory && payload.productId && payload.quantity) {
      try {
        const branch = await this.prisma.branch.findFirst({ where: { tenantId } });
        if (branch) {
          const po = await this.inventory.createPurchaseOrder(tenantId, branch.id, {
            notes: `AI reorder: ${action.title}`,
            lines: [{ productId: payload.productId, quantity: Number(payload.quantity) }],
          });
          poNote = `Approved — created ${po.poNumber}`;
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
