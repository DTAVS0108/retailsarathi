import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingService } from '../accounting/accounting.service';
import { CustomersService } from '../customers/customers.service';
import { InventoryService } from '../inventory/inventory.service';
import {
  endOfDay,
  fmtDate,
  parseFyKey,
  resolveReportPeriod,
  slugPeriod,
  startOfDay,
  type ReportPeriod,
} from './period.util';
import { rowsToCsv, rowsToXlsxBase64, type ReportFormat } from './report-export.util';
import { buildExportResponse } from './report-html.util';

export type { ReportFormat };

type PeriodQuery = {
  from?: string;
  to?: string;
  fy?: string;
  days?: string;
  quarter?: string;
};

@Injectable()
export class ReportsService {
  constructor(
    private prisma: PrismaService,
    private accounting: AccountingService,
    private customers: CustomersService,
    private inventory: InventoryService,
  ) {}

  private period(q: PeriodQuery) {
    try {
      return resolveReportPeriod({
        from: q.from,
        to: q.to,
        fy: q.fy,
        days: q.days ? parseInt(q.days, 10) : undefined,
        quarter: q.quarter ? parseInt(q.quarter, 10) : undefined,
      });
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : 'Invalid period');
    }
  }

  private formatOrThrow(raw?: string): ReportFormat {
    const f = (raw ?? 'json').toLowerCase() as ReportFormat;
    if (!['json', 'csv', 'xlsx', 'pdf'].includes(f)) {
      throw new BadRequestException('format must be json|csv|xlsx|pdf');
    }
    return f;
  }

  // ─── Sell report ─────────────────────────────────────────────────

  async sellReport(
    tenantId: string,
    q: {
      from?: string;
      to?: string;
      fy?: string;
      days?: string;
      quarter?: string;
      branchId?: string;
      /** Filter to lines at this GST % (e.g. 18). Omit for complete register. */
      gstRate?: string;
      format?: string;
    },
  ) {
    const period = this.period(q);
    const format = this.formatOrThrow(q.format);
    const slabFilter = this.parseGstRate(q.gstRate);

    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        status: 'FINALIZED',
        createdAt: { gte: period.from, lte: period.to },
        ...(q.branchId ? { branchId: q.branchId } : {}),
      },
      orderBy: { createdAt: 'asc' },
      include: {
        customer: { select: { name: true, gstin: true } },
        lines: {
          select: {
            gstRate: true,
            taxableAmount: true,
            cgst: true,
            sgst: true,
            igst: true,
            total: true,
            quantity: true,
            hsnCode: true,
          },
        },
        payments: { select: { method: true, amount: true } },
        branch: { select: { name: true } },
      },
    });

    const slabTotals: Record<string, { gstRate: number; taxable: number; tax: number; totalAmount: number; count: number }> = {};
    const entries: Array<Record<string, unknown>> = [];

    for (const inv of invoices) {
      const sign = inv.type === 'CREDIT_NOTE' ? -1 : 1;
      const linesBySlab = new Map<number, { taxable: number; tax: number; total: number }>();

      for (const line of inv.lines) {
        const rate = Number(line.gstRate);
        const key = Number.isFinite(rate) ? rate : 0;
        const cur = linesBySlab.get(key) ?? { taxable: 0, tax: 0, total: 0 };
        cur.taxable += Number(line.taxableAmount);
        cur.tax += Number(line.cgst) + Number(line.sgst) + Number(line.igst);
        cur.total += Number(line.total);
        linesBySlab.set(key, cur);

        const sk = String(key);
        if (!slabTotals[sk]) {
          slabTotals[sk] = { gstRate: key, taxable: 0, tax: 0, totalAmount: 0, count: 0 };
        }
        slabTotals[sk].taxable += sign * Number(line.taxableAmount);
        slabTotals[sk].tax += sign * (Number(line.cgst) + Number(line.sgst) + Number(line.igst));
        slabTotals[sk].totalAmount += sign * Number(line.total);
      }

      if (slabFilter != null) {
        const match = linesBySlab.get(slabFilter);
        if (!match || (match.taxable === 0 && match.total === 0)) continue;
        const qty = inv.lines
          .filter((l) => Number(l.gstRate) === slabFilter)
          .reduce((s, l) => s + Number(l.quantity), 0);
        const cgst = inv.lines
          .filter((l) => Number(l.gstRate) === slabFilter)
          .reduce((s, l) => s + Number(l.cgst), 0);
        const sgst = inv.lines
          .filter((l) => Number(l.gstRate) === slabFilter)
          .reduce((s, l) => s + Number(l.sgst), 0);
        const igst = inv.lines
          .filter((l) => Number(l.gstRate) === slabFilter)
          .reduce((s, l) => s + Number(l.igst), 0);
        entries.push({
          id: `${inv.id}-${slabFilter}`,
          date: fmtDate(inv.createdAt),
          dateIso: inv.createdAt.toISOString(),
          invoiceNumber: inv.invoiceNumber,
          name: inv.customer?.name ?? 'Walk-in',
          gstin: inv.customer?.gstin ?? '',
          qty: sign * qty,
          taxAmount: sign * match.taxable,
          taxable: sign * match.taxable,
          cgst: sign * cgst,
          sgst: sign * sgst,
          igst: sign * igst,
          tax: sign * match.tax,
          totalTax: sign * match.tax,
          totalAmount: sign * match.total,
          gstRate: slabFilter,
          documentType: inv.type,
        });
        const sk = String(slabFilter);
        if (slabTotals[sk]) slabTotals[sk].count += 1;
        continue;
      }

      // Complete report — invoice totals
      const tax = Number(inv.totalCgst) + Number(inv.totalSgst) + Number(inv.totalIgst);
      const qty = inv.lines.reduce((s, l) => s + Number(l.quantity), 0);
      entries.push({
        id: inv.id,
        date: fmtDate(inv.createdAt),
        dateIso: inv.createdAt.toISOString(),
        invoiceNumber: inv.invoiceNumber,
        name: inv.customer?.name ?? 'Walk-in',
        gstin: inv.customer?.gstin ?? '',
        qty: sign * qty,
        taxAmount: sign * Number(inv.subtotal),
        taxable: sign * Number(inv.subtotal),
        cgst: sign * Number(inv.totalCgst),
        sgst: sign * Number(inv.totalSgst),
        igst: sign * Number(inv.totalIgst),
        tax: sign * tax,
        totalTax: sign * tax,
        totalAmount: sign * Number(inv.grandTotal),
        documentType: inv.type,
      });
    }

    // Count invoices per slab for complete mode
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
    const byBranch: Record<string, number> = {};
    const byHsn: Record<string, { hsn: string; taxable: number; qty: number }> = {};
    for (const inv of invoices) {
      const sign = inv.type === 'CREDIT_NOTE' ? -1 : 1;
      byBranch[inv.branch?.name ?? 'Branch'] =
        (byBranch[inv.branch?.name ?? 'Branch'] ?? 0) + sign * Number(inv.grandTotal);
      if (inv.type !== 'CREDIT_NOTE') {
        for (const p of inv.payments) {
          byPayment[p.method] = (byPayment[p.method] ?? 0) + Number(p.amount);
        }
      }
      for (const line of inv.lines) {
        if (slabFilter != null && Number(line.gstRate) !== slabFilter) continue;
        const hsn = line.hsnCode || 'NA';
        if (!byHsn[hsn]) byHsn[hsn] = { hsn, taxable: 0, qty: 0 };
        byHsn[hsn].taxable += sign * Number(line.taxableAmount);
        byHsn[hsn].qty += sign * Number(line.quantity);
      }
    }

    const summary = {
      invoiceCount: entries.filter((e) => e.documentType !== 'CREDIT_NOTE').length,
      creditNoteCount: entries.filter((e) => e.documentType === 'CREDIT_NOTE').length,
      netSales: entries.reduce((s, e) => s + Number(e.totalAmount), 0),
      taxable: entries.reduce((s, e) => s + Number(e.taxable), 0),
      totalTax: entries.reduce((s, e) => s + Number(e.tax), 0),
      grossSales: entries
        .filter((e) => e.documentType !== 'CREDIT_NOTE')
        .reduce((s, e) => s + Number(e.totalAmount), 0),
      returnsTotal: entries
        .filter((e) => e.documentType === 'CREDIT_NOTE')
        .reduce((s, e) => s + Math.abs(Number(e.totalAmount)), 0),
      gstRate: slabFilter,
      byGstSlab: Object.values(slabTotals).sort((a, b) => a.gstRate - b.gstRate),
      byPayment: Object.entries(byPayment).map(([method, amount]) => ({ method, amount })),
      byBranch: Object.entries(byBranch).map(([branch, amount]) => ({ branch, amount })),
      byHsn: Object.values(byHsn).sort((a, b) => Math.abs(b.taxable) - Math.abs(a.taxable)),
    };

    const payload = { period, summary, entries };
    if (format === 'json') return payload;

    const headers = [
      'sn',
      'date',
      'name',
      'gstin',
      'qty',
      'invoiceNumber',
      'taxAmount',
      'cgst',
      'sgst',
      'totalTax',
      'totalAmount',
    ];
    const slabSuffix = slabFilter != null ? `_GST${slabFilter}pct` : '_Complete';
    const fileBase = `Sell_${slugPeriod(period)}${slabSuffix}`;
    const title =
      slabFilter != null ? `Sell Report — GST ${slabFilter}%` : 'Sell Report — Complete';

    return this.exportBundle({
      tenantId,
      format,
      filenameBase: fileBase,
      title,
      period,
      summaryCards: [
        { label: 'Total amount', value: summary.netSales },
        { label: 'Invoices', value: summary.invoiceCount },
        { label: 'Taxable', value: summary.taxable },
        { label: 'Tax', value: summary.totalTax },
      ],
      columns: [
        { key: 'sn', label: 'SN' },
        { key: 'date', label: 'Date' },
        { key: 'name', label: 'Name' },
        { key: 'gstin', label: 'GSTIN' },
        { key: 'qty', label: 'QTY', align: 'right' },
        { key: 'invoiceNumber', label: 'Invoice No.' },
        { key: 'taxAmount', label: 'TaxAmount', align: 'right' },
        { key: 'cgst', label: 'CGST', align: 'right' },
        { key: 'sgst', label: 'SGST', align: 'right' },
        { key: 'totalTax', label: 'Total Tax', align: 'right' },
        { key: 'totalAmount', label: 'Total Amount', align: 'right' },
      ],
      rows: entries,
      csvHeaders: headers,
      xlsxSheets: [
        { name: slabFilter != null ? `GST ${slabFilter}%` : 'Complete', headers, rows: entries },
        {
          name: 'By GST Slab',
          headers: ['gstRate', 'count', 'taxable', 'tax', 'totalAmount'],
          rows: summary.byGstSlab as unknown as Array<Record<string, unknown>>,
        },
      ],
    });
  }

  // ─── Buy report (purchase bills) ─────────────────────────────────

  async buyReport(
    tenantId: string,
    q: {
      from?: string;
      to?: string;
      fy?: string;
      days?: string;
      quarter?: string;
      supplierId?: string;
      gstRate?: string;
      format?: string;
    },
  ) {
    const period = this.period(q);
    const format = this.formatOrThrow(q.format);
    const slabFilter = this.parseGstRate(q.gstRate);

    const bills = await this.prisma.purchaseBill.findMany({
      where: {
        tenantId,
        status: { not: 'CANCELLED' },
        ...(q.supplierId ? { supplierId: q.supplierId } : {}),
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
      orderBy: [{ invoiceDate: 'asc' }, { createdAt: 'asc' }],
      include: {
        supplier: { select: { name: true, gstin: true } },
        lines: true,
      },
    });

    const posted = bills.filter((b) => b.status !== 'DRAFT');
    const slabTotals: Record<string, { gstRate: number; taxable: number; tax: number; totalAmount: number; count: number }> = {};
    const entries: Array<Record<string, unknown>> = [];

    for (const b of posted) {
      const date = b.invoiceDate ?? b.createdAt;
      const name = b.supplier?.name ?? b.supplierName ?? '';
      const gstin = b.supplier?.gstin ?? b.gstin ?? '';
      const qty = b.lines.reduce((s, l) => s + Number(l.quantity), 0);
      const cgst = Number(b.cgstAmount);
      const sgst = Number(b.sgstAmount);
      const igst = Number(b.igstAmount);

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
        // The bill's actual cgst/sgst/igst split (not the rate) tells us whether it's
        // inter-state — a 50/50 CGST/SGST assumption would misreport IGST-only bills.
        const isInterState = igst > 0 && cgst === 0 && sgst === 0;
        entries.push({
          id: `${b.id}-${slabFilter}`,
          date: fmtDate(date),
          dateIso: date.toISOString(),
          invoiceNumber: b.invoiceNumber,
          name,
          gstin,
          qty: Math.round(match.qty * 1000) / 1000,
          taxAmount: Math.round(match.taxable * 100) / 100,
          taxable: Math.round(match.taxable * 100) / 100,
          cgst: isInterState ? 0 : Math.round((match.tax / 2) * 100) / 100,
          sgst: isInterState ? 0 : Math.round((match.tax / 2) * 100) / 100,
          igst: isInterState ? Math.round(match.tax * 100) / 100 : 0,
          tax: Math.round(match.tax * 100) / 100,
          totalTax: Math.round(match.tax * 100) / 100,
          totalAmount: Math.round(match.total * 100) / 100,
          gstRate: slabFilter,
        });
        const sk = String(slabFilter);
        if (slabTotals[sk]) slabTotals[sk].count += 1;
        continue;
      }

      entries.push({
        id: b.id,
        date: fmtDate(date),
        dateIso: date.toISOString(),
        invoiceNumber: b.invoiceNumber,
        name,
        gstin,
        qty: Math.round(qty * 1000) / 1000,
        taxAmount: Number(b.subtotal),
        taxable: Number(b.subtotal),
        cgst,
        sgst,
        igst,
        tax: Number(b.taxAmount),
        totalTax: Number(b.taxAmount),
        totalAmount: Number(b.totalAmount),
      });
    }

    // SN as displayed order (oldest → newest for register; entries currently asc by date)
    entries.forEach((e, i) => {
      e.sn = i + 1;
    });

    if (slabFilter == null) {
      for (const b of posted) {
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

    const bySupplier: Record<string, { supplier: string; total: number; count: number }> = {};
    for (const e of entries) {
      const key = String(e.name || 'Unknown');
      if (!bySupplier[key]) bySupplier[key] = { supplier: key, total: 0, count: 0 };
      bySupplier[key].total += Number(e.totalAmount);
      bySupplier[key].count += 1;
    }

    const summary = {
      billCount: entries.length,
      taxable: entries.reduce((s, e) => s + Number(e.taxable), 0),
      tax: entries.reduce((s, e) => s + Number(e.tax), 0),
      total: entries.reduce((s, e) => s + Number(e.totalAmount), 0),
      gstRate: slabFilter,
      byGstSlab: Object.values(slabTotals).sort((a, b) => a.gstRate - b.gstRate),
      bySupplier: Object.values(bySupplier).sort((a, b) => b.total - a.total),
    };

    const payload = { period, summary, entries };
    if (format === 'json') return payload;

    const headers = [
      'sn',
      'date',
      'name',
      'gstin',
      'qty',
      'invoiceNumber',
      'taxAmount',
      'cgst',
      'sgst',
      'totalTax',
      'totalAmount',
    ];
    const slabSuffix = slabFilter != null ? `_GST${slabFilter}pct` : '_Complete';
    const fileBase = `Buy_${slugPeriod(period)}${slabSuffix}`;
    const title =
      slabFilter != null ? `Buy Report — GST ${slabFilter}%` : 'Buy Report — Complete';

    return this.exportBundle({
      tenantId,
      format,
      filenameBase: fileBase,
      title,
      period,
      summaryCards: [
        { label: 'Total amount', value: summary.total },
        { label: 'Bills', value: summary.billCount },
        { label: 'Taxable', value: summary.taxable },
        { label: 'Tax', value: summary.tax },
      ],
      columns: [
        { key: 'sn', label: 'SN' },
        { key: 'date', label: 'Date' },
        { key: 'name', label: 'Name' },
        { key: 'gstin', label: 'GSTIN' },
        { key: 'qty', label: 'QTY', align: 'right' },
        { key: 'invoiceNumber', label: 'Invoice No.' },
        { key: 'taxAmount', label: 'TaxAmount', align: 'right' },
        { key: 'cgst', label: 'CGST', align: 'right' },
        { key: 'sgst', label: 'SGST', align: 'right' },
        { key: 'totalTax', label: 'Total Tax', align: 'right' },
        { key: 'totalAmount', label: 'Total Amount', align: 'right' },
      ],
      rows: entries,
      csvHeaders: headers,
      xlsxSheets: [
        { name: slabFilter != null ? `GST ${slabFilter}%` : 'Complete', headers, rows: entries },
        {
          name: 'By GST Slab',
          headers: ['gstRate', 'count', 'taxable', 'tax', 'totalAmount'],
          rows: summary.byGstSlab as unknown as Array<Record<string, unknown>>,
        },
      ],
    });
  }

  private parseGstRate(raw?: string): number | null {
    if (raw == null || raw === '' || raw === 'all') return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      throw new BadRequestException('gstRate must be a number (e.g. 5, 12, 18, 28)');
    }
    return n;
  }

  // ─── Supplier ledger ─────────────────────────────────────────────

  async supplierLedger(
    tenantId: string,
    supplierId: string,
    q: { from?: string; to?: string; fy?: string; days?: string; quarter?: string; format?: string },
  ) {
    const period = this.period(q);
    const format = this.formatOrThrow(q.format);

    const supplier = await this.prisma.supplier.findFirst({
      where: { id: supplierId, tenantId },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');

    const allEntries = await this.prisma.supplierLedgerEntry.findMany({
      where: { tenantId, supplierId },
      orderBy: [{ entryDate: 'asc' }, { createdAt: 'asc' }],
      include: {
        bill: { select: { invoiceNumber: true } },
        payment: { select: { referenceNo: true, method: true } },
      },
    });

    const { opening, rows, closing } = this.buildPartyLedgerRows(
      allEntries.map((e) => ({
        id: e.id,
        entryDate: e.entryDate,
        type: e.type,
        amount: Number(e.amount),
        balanceAfter: Number(e.balanceAfter),
        // BILL increases payable; PAYMENT decreases
        signed: e.type === 'PAYMENT' ? -Number(e.amount) : Number(e.amount),
        voucher:
          e.bill?.invoiceNumber ??
          e.payment?.referenceNo ??
          e.notes ??
          e.type,
        notes: e.notes ?? '',
      })),
      period,
      Number(supplier.outstandingBalance),
    );

    const openBills = await this.prisma.purchaseBill.findMany({
      where: {
        tenantId,
        supplierId,
        status: { in: ['POSTED', 'PARTIALLY_PAID'] },
      },
      orderBy: { createdAt: 'asc' },
    });
    const now = Date.now();
    const aging = { current: 0, days30: 0, days60: 0, days90plus: 0 };
    for (const b of openBills) {
      const due = Number(b.totalAmount) - Number(b.paidAmount);
      const age = Math.floor((now - (b.invoiceDate ?? b.createdAt).getTime()) / 86400000);
      if (age <= 30) aging.current += due;
      else if (age <= 60) aging.days30 += due;
      else if (age <= 90) aging.days60 += due;
      else aging.days90plus += due;
    }

    const payload = {
      period,
      party: {
        id: supplier.id,
        name: supplier.name,
        phone: supplier.phone,
        gstin: supplier.gstin,
        outstandingBalance: Number(supplier.outstandingBalance),
      },
      openingBalance: opening,
      closingBalance: closing,
      aging,
      entries: rows,
    };
    if (format === 'json') return payload;

    const headers = ['date', 'type', 'voucher', 'debit', 'credit', 'balance', 'notes'];
    const fileBase = `SupplierLedger_${supplier.name.replace(/\W+/g, '_')}_${slugPeriod(period)}`;
    return this.exportBundle({
      tenantId,
      format,
      filenameBase: fileBase,
      title: 'Supplier Ledger',
      period,
      partyName: supplier.name,
      partyMeta: [supplier.phone, supplier.gstin].filter(Boolean).join(' · '),
      summaryCards: [
        { label: 'Opening', value: opening },
        { label: 'Closing', value: closing },
        { label: 'Current due', value: Number(supplier.outstandingBalance) },
      ],
      columns: [
        { key: 'date', label: 'Date' },
        { key: 'type', label: 'Type' },
        { key: 'voucher', label: 'Voucher' },
        { key: 'debit', label: 'Debit', align: 'right' },
        { key: 'credit', label: 'Credit', align: 'right' },
        { key: 'balance', label: 'Balance', align: 'right' },
      ],
      rows: rows as Array<Record<string, unknown>>,
      csvHeaders: headers,
      xlsxSheets: [{ name: 'Ledger', headers, rows: rows as Array<Record<string, unknown>> }],
    });
  }

  // ─── Customer ledger ─────────────────────────────────────────────

  async customerLedger(
    tenantId: string,
    customerId: string,
    q: { from?: string; to?: string; fy?: string; days?: string; quarter?: string; format?: string },
  ) {
    const period = this.period(q);
    const format = this.formatOrThrow(q.format);

    const customer = await this.prisma.customer.findFirst({
      where: { id: customerId, tenantId },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    let allEntries = await this.prisma.customerLedgerEntry.findMany({
      where: { tenantId, customerId },
      orderBy: [{ entryDate: 'asc' }, { createdAt: 'asc' }],
      include: {
        invoice: { select: { invoiceNumber: true, type: true } },
        payment: { select: { referenceNo: true, method: true } },
      },
    });

    type LedgerLike = {
      id: string;
      entryDate: Date;
      type: string;
      amount: unknown;
      balanceAfter: unknown;
      notes: string | null;
      invoice: { invoiceNumber: string; type: string } | null;
      payment: { referenceNo: string | null; method: string } | null;
    };

    let source: LedgerLike[] = allEntries;
    if (allEntries.length === 0) {
      source = await this.synthesizeCustomerLedger(tenantId, customerId);
    }

    const mapped = source.map((e) => {
      const amount = Number(e.amount);
      const signed =
        e.type === 'COLLECTION' || e.type === 'CREDIT_NOTE' ? -amount : amount;
      return {
        id: e.id,
        entryDate: e.entryDate,
        type: e.type,
        amount,
        balanceAfter: Number(e.balanceAfter),
        signed,
        voucher:
          e.invoice?.invoiceNumber ??
          e.payment?.referenceNo ??
          e.notes ??
          e.type,
        notes: e.notes ?? '',
      };
    });

    const { opening, rows, closing } = this.buildPartyLedgerRows(
      mapped,
      period,
      Number(customer.outstandingBalance),
    );

    const payload = {
      period,
      party: {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        gstin: customer.gstin,
        outstandingBalance: Number(customer.outstandingBalance),
        creditLimit: Number(customer.creditLimit),
      },
      openingBalance: opening,
      closingBalance: closing,
      entries: rows,
    };
    if (format === 'json') return payload;

    const headers = ['date', 'type', 'voucher', 'debit', 'credit', 'balance', 'notes'];
    const fileBase = `CustomerLedger_${customer.name.replace(/\W+/g, '_')}_${slugPeriod(period)}`;
    return this.exportBundle({
      tenantId,
      format,
      filenameBase: fileBase,
      title: 'Customer Ledger',
      period,
      partyName: customer.name,
      partyMeta: [customer.phone, customer.gstin].filter(Boolean).join(' · '),
      summaryCards: [
        { label: 'Opening', value: opening },
        { label: 'Closing', value: closing },
        { label: 'Outstanding', value: Number(customer.outstandingBalance) },
      ],
      columns: [
        { key: 'date', label: 'Date' },
        { key: 'type', label: 'Type' },
        { key: 'voucher', label: 'Voucher' },
        { key: 'debit', label: 'Debit', align: 'right' },
        { key: 'credit', label: 'Credit', align: 'right' },
        { key: 'balance', label: 'Balance', align: 'right' },
      ],
      rows: rows as Array<Record<string, unknown>>,
      csvHeaders: headers,
      xlsxSheets: [{ name: 'Ledger', headers, rows: rows as Array<Record<string, unknown>> }],
    });
  }

  /** Build running debit/credit rows with opening/closing for a period. */
  private buildPartyLedgerRows(
    all: Array<{
      id: string;
      entryDate: Date;
      type: string;
      amount: number;
      balanceAfter: number;
      signed: number;
      voucher: string;
      notes: string;
    }>,
    period: ReportPeriod,
    currentBalance: number,
  ) {
    const before = all.filter((e) => e.entryDate < period.from);
    const inPeriod = all.filter(
      (e) => e.entryDate >= period.from && e.entryDate <= period.to,
    );

    let opening: number;
    if (before.length > 0) {
      opening = before[before.length - 1].balanceAfter;
    } else if (all.length > 0) {
      // No prior entries — back out period activity from current balance
      const afterPeriod = all.filter((e) => e.entryDate > period.to);
      const netAfter = afterPeriod.reduce((s, e) => s + e.signed, 0);
      const netIn = inPeriod.reduce((s, e) => s + e.signed, 0);
      opening = currentBalance - netAfter - netIn;
    } else {
      opening = currentBalance;
    }

    let running = opening;
    const rows = inPeriod.map((e) => {
      running += e.signed;
      const debit = e.signed > 0 ? e.amount : 0;
      const credit = e.signed < 0 ? e.amount : 0;
      return {
        id: e.id,
        date: fmtDate(e.entryDate),
        dateIso: e.entryDate.toISOString(),
        type: e.type,
        voucher: e.voucher,
        debit,
        credit,
        balance: running,
        notes: e.notes,
      };
    });

    return { opening, rows, closing: running };
  }

  private async synthesizeCustomerLedger(tenantId: string, customerId: string) {
    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        customerId,
        status: 'FINALIZED',
      },
      orderBy: { createdAt: 'asc' },
      include: { payments: true },
    });
    const collections = await this.prisma.customerPayment.findMany({
      where: { tenantId, customerId },
      orderBy: { paymentDate: 'asc' },
    });

    type Syn = {
      id: string;
      entryDate: Date;
      type: 'INVOICE' | 'COLLECTION' | 'CREDIT_NOTE';
      amount: { toNumber?: () => number } | number;
      balanceAfter: { toNumber?: () => number } | number;
      notes: string | null;
      invoice: { invoiceNumber: string; type: string } | null;
      payment: { referenceNo: string | null; method: string } | null;
    };

    const events: Syn[] = [];
    for (const inv of invoices) {
      if (inv.type === 'CREDIT_NOTE') {
        events.push({
          id: `syn-cn-${inv.id}`,
          entryDate: inv.createdAt,
          type: 'CREDIT_NOTE',
          amount: Number(inv.grandTotal),
          balanceAfter: 0,
          notes: 'Synthesized from credit note',
          invoice: { invoiceNumber: inv.invoiceNumber, type: inv.type },
          payment: null,
        });
        continue;
      }
      const credit = inv.payments
        .filter((p) => p.method === 'CREDIT')
        .reduce((s, p) => s + Number(p.amount), 0);
      if (credit > 0) {
        events.push({
          id: `syn-inv-${inv.id}`,
          entryDate: inv.createdAt,
          type: 'INVOICE',
          amount: credit,
          balanceAfter: 0,
          notes: 'Synthesized from credit sale',
          invoice: { invoiceNumber: inv.invoiceNumber, type: inv.type },
          payment: null,
        });
      }
    }
    for (const p of collections) {
      events.push({
        id: `syn-pay-${p.id}`,
        entryDate: p.paymentDate,
        type: 'COLLECTION',
        amount: Number(p.amount),
        balanceAfter: 0,
        notes: p.notes,
        invoice: null,
        payment: { referenceNo: p.referenceNo, method: p.method },
      });
    }

    events.sort((a, b) => a.entryDate.getTime() - b.entryDate.getTime());
    let bal = 0;
    return events.map((e) => {
      const amt = Number(e.amount);
      if (e.type === 'INVOICE') bal += amt;
      else bal -= amt;
      return { ...e, amount: amt, balanceAfter: bal };
    });
  }

  // ─── Day-end / shift summary ─────────────────────────────────────

  async dayEnd(tenantId: string, dateStr?: string) {
    const date = dateStr?.trim() || new Date().toISOString().slice(0, 10);
    const from = startOfDay(new Date(date));
    const to = endOfDay(new Date(date));
    if (Number.isNaN(from.getTime())) {
      throw new BadRequestException('Invalid date; use YYYY-MM-DD');
    }

    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        createdAt: { gte: from, lte: to },
        status: { not: 'CANCELLED' },
      },
      include: { payments: { select: { method: true, amount: true } } },
    });

    const finalized = invoices.filter((i) => i.status === 'FINALIZED');
    const sales = finalized.filter((i) => i.type !== 'CREDIT_NOTE');
    const returns = finalized.filter((i) => i.type === 'CREDIT_NOTE');

    const paymentBreakdown: Record<string, number> = {};
    for (const inv of sales) {
      for (const p of inv.payments) {
        paymentBreakdown[p.method] = (paymentBreakdown[p.method] ?? 0) + Number(p.amount);
      }
    }

    return {
      date,
      billCount: invoices.length,
      finalizedCount: finalized.length,
      grossSales: sales.reduce((s, i) => s + Number(i.grandTotal), 0),
      paymentBreakdown,
      cashTotal: paymentBreakdown.CASH ?? 0,
      creditTotal: paymentBreakdown.CREDIT ?? 0,
      returnCount: returns.length,
      returnTotal: returns.reduce((s, i) => s + Number(i.grandTotal), 0),
    };
  }

  // ─── Rollups ─────────────────────────────────────────────────────

  async rollups(
    tenantId: string,
    q: { from?: string; to?: string; fy?: string; days?: string; quarter?: string },
  ) {
    const sell = (await this.sellReport(tenantId, { ...q, format: 'json' })) as {
      period: ReportPeriod;
      summary: {
        netSales: number;
        byPayment: Array<{ method: string; amount: number }>;
        byBranch: Array<{ branch: string; amount: number }>;
        byHsn: Array<{ hsn: string; taxable: number; qty: number }>;
      };
    };
    const buy = (await this.buyReport(tenantId, { ...q, format: 'json' })) as {
      summary: {
        total: number;
        bySupplier: Array<{ supplier: string; total: number; count: number }>;
      };
    };

    return {
      period: sell.period,
      sell: {
        netSales: sell.summary.netSales,
        byPayment: sell.summary.byPayment,
        byBranch: sell.summary.byBranch,
        byHsn: sell.summary.byHsn,
      },
      buy: {
        total: buy.summary.total,
        bySupplier: buy.summary.bySupplier,
      },
    };
  }

  /**
   * ITR pack: accounting FY summary + sell/buy registers + quarterly split.
   * format=json|csv|xlsx|pdf
   */
  async itrPack(tenantId: string, q: { fy?: string; format?: string }) {
    const fyKey =
      q.fy?.trim() ||
      (() => {
        const parsed = resolveReportPeriod({});
        return parsed.fyKey!;
      })();
    const parsed = parseFyKey(fyKey);
    if (!parsed) throw new BadRequestException(`Invalid fy "${fyKey}"`);

    const format = this.formatOrThrow(q.format);
    const itr = await this.accounting.getItrPrepSummary(tenantId, parsed.key);

    const sellFy = (await this.sellReport(tenantId, { fy: parsed.key, format: 'json' })) as {
      period: ReportPeriod;
      summary: Record<string, number | unknown>;
      entries: Array<Record<string, unknown>>;
    };
    const buyFy = (await this.buyReport(tenantId, { fy: parsed.key, format: 'json' })) as {
      period: ReportPeriod;
      summary: Record<string, number | unknown>;
      entries: Array<Record<string, unknown>>;
    };

    const quarters = [];
    for (let qn = 1; qn <= 4; qn++) {
      const sellQ = (await this.sellReport(tenantId, {
        fy: parsed.key,
        quarter: String(qn),
        format: 'json',
      })) as { summary: { netSales: number; invoiceCount: number; totalTax: number } };
      const buyQ = (await this.buyReport(tenantId, {
        fy: parsed.key,
        quarter: String(qn),
        format: 'json',
      })) as { summary: { total: number; billCount: number; tax: number } };
      quarters.push({
        quarter: qn,
        label: `Q${qn}`,
        sellNet: sellQ.summary.netSales,
        sellInvoices: sellQ.summary.invoiceCount,
        sellTax: sellQ.summary.totalTax,
        buyTotal: buyQ.summary.total,
        buyBills: buyQ.summary.billCount,
        buyTax: buyQ.summary.tax,
      });
    }

    const payload = {
      financialYear: parsed.key,
      period: sellFy.period,
      itr,
      sell: {
        summary: sellFy.summary,
        entryCount: sellFy.entries.length,
      },
      buy: {
        summary: buyFy.summary,
        entryCount: buyFy.entries.length,
      },
      quarters,
      links: {
        sellRegister: `/reports/sell?fy=${parsed.key}`,
        buyRegister: `/reports/buy?fy=${parsed.key}`,
        itrCsv: `/accounting/itr-prep/export?fy=${parsed.key}`,
        tallyXml: `/accounting/itr-prep/export/tally?fy=${parsed.key}`,
      },
    };

    if (format === 'json') return payload;

    const summaryRows = [
      { field: 'Financial Year', value: parsed.key },
      { field: 'Gross Turnover (ITR)', value: itr.grossTurnover },
      { field: 'Gross Sales', value: itr.grossSales },
      { field: 'Returns', value: itr.returnsTotal },
      { field: 'Total Expenses', value: itr.totalExpenses },
      { field: 'Net Profit', value: itr.netProfit },
      { field: 'Presumptive Eligible', value: itr.presumptiveEligible ? 'Yes' : 'No' },
      { field: 'Sell Net (register)', value: Number(sellFy.summary.netSales ?? 0) },
      { field: 'Buy Total (register)', value: Number(buyFy.summary.total ?? 0) },
      { field: 'Sell Invoice Count', value: Number(sellFy.summary.invoiceCount ?? 0) },
      { field: 'Buy Bill Count', value: Number(buyFy.summary.billCount ?? 0) },
    ];

    const quarterRows = quarters.map((row) => ({
      quarter: row.label,
      sellNet: row.sellNet,
      sellInvoices: row.sellInvoices,
      sellTax: row.sellTax,
      buyTotal: row.buyTotal,
      buyBills: row.buyBills,
      buyTax: row.buyTax,
    }));

    const fileBase = `ITR_Pack_FY${parsed.key}`;

    if (format === 'csv') {
      const csv = [
        rowsToCsv(
          ['field', 'value'],
          summaryRows as Array<Record<string, unknown>>,
        ),
        '',
        'Quarterly sell & buy',
        rowsToCsv(
          ['quarter', 'sellNet', 'sellInvoices', 'sellTax', 'buyTotal', 'buyBills', 'buyTax'],
          quarterRows as Array<Record<string, unknown>>,
        ),
      ].join('\n');
      return { filename: `${fileBase}.csv`, csv };
    }

    if (format === 'xlsx') {
      const sellHeaders = ['date', 'invoiceNumber', 'name', 'gstin', 'taxable', 'tax', 'totalAmount'];
      const buyHeaders = ['date', 'invoiceNumber', 'name', 'gstin', 'taxable', 'tax', 'totalAmount'];
      return {
        filename: `${fileBase}.xlsx`,
        base64: rowsToXlsxBase64([
          {
            name: 'ITR Summary',
            headers: ['field', 'value'],
            rows: summaryRows as Array<Record<string, unknown>>,
          },
          {
            name: 'Quarterly',
            headers: ['quarter', 'sellNet', 'sellInvoices', 'sellTax', 'buyTotal', 'buyBills', 'buyTax'],
            rows: quarterRows as Array<Record<string, unknown>>,
          },
          {
            name: 'Sell',
            headers: sellHeaders,
            rows: sellFy.entries,
          },
          {
            name: 'Buy',
            headers: buyHeaders,
            rows: buyFy.entries,
          },
        ]),
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
    }

    // pdf
    return this.exportBundle({
      tenantId,
      format: 'pdf',
      filenameBase: fileBase,
      title: `ITR Pack — FY ${parsed.key}`,
      period: sellFy.period,
      summaryCards: [
        { label: 'Gross turnover', value: itr.grossTurnover },
        { label: 'Sell net', value: Number(sellFy.summary.netSales ?? 0) },
        { label: 'Buy total', value: Number(buyFy.summary.total ?? 0) },
        { label: 'Net profit', value: itr.netProfit },
      ],
      columns: [
        { key: 'quarter', label: 'Quarter' },
        { key: 'sellNet', label: 'Sell', align: 'right' },
        { key: 'buyTotal', label: 'Buy', align: 'right' },
        { key: 'sellTax', label: 'Sell tax', align: 'right' },
        { key: 'buyTax', label: 'Buy tax', align: 'right' },
      ],
      rows: quarterRows as Array<Record<string, unknown>>,
      csvHeaders: ['quarter', 'sellNet', 'buyTotal'],
      xlsxSheets: [],
    });
  }

  private async exportBundle(opts: {
    tenantId: string;
    format: ReportFormat;
    filenameBase: string;
    title: string;
    period: ReportPeriod;
    shopName?: string;
    partyName?: string;
    partyMeta?: string;
    summaryCards: Array<{ label: string; value: number }>;
    columns: Array<{ key: string; label: string; align?: 'left' | 'right' }>;
    rows: Array<Record<string, unknown>>;
    csvHeaders: string[];
    xlsxSheets: Array<{ name: string; headers: string[]; rows: Array<Record<string, unknown>> }>;
  }) {
    return buildExportResponse(this.prisma, opts);
  }

  // ─── Receivables / payables lists (Khata + Ledgers) ───────────────

  async receivablesReport(tenantId: string, q: { format?: string }) {
    const format = this.formatOrThrow(q.format);
    const aging = await this.customers.getAging(tenantId);
    const now = new Date();
    const period: ReportPeriod = {
      from: startOfDay(now),
      to: endOfDay(now),
      label: `As of ${fmtDate(now)}`,
      fyKey: null,
      quarter: null,
    };

    const entries = aging.map((r, i) => {
      const address = [r.address, r.addressLine2, r.city, r.stateCode, r.pincode]
        .filter(Boolean)
        .join(', ');
      return {
        sn: i + 1,
        name: r.name,
        phone: r.phone ?? '',
        email: r.email ?? '',
        gstin: r.gstin ?? '',
        segment: r.segment ?? '',
        address,
        city: r.city ?? '',
        pincode: r.pincode ?? '',
        stateCode: r.stateCode ?? '',
        creditLimit: Number(r.creditLimit ?? 0),
        advanceBalance: Number(r.advanceBalance ?? 0),
        outstanding: Number(r.outstanding ?? 0),
        loyaltyPoints: Number(r.loyaltyPoints ?? 0),
        whatsappOptIn: r.whatsappOptIn ? 'Yes' : 'No',
        agingCurrent: Number(r.aging?.current ?? 0),
        aging30: Number(r.aging?.days30 ?? 0),
        aging60: Number(r.aging?.days60 ?? 0),
        aging90plus: Number(r.aging?.days90plus ?? 0),
      };
    });

    const total = entries.reduce((s, e) => s + e.outstanding, 0);
    const headers = [
      'sn',
      'name',
      'phone',
      'email',
      'gstin',
      'segment',
      'address',
      'creditLimit',
      'advanceBalance',
      'outstanding',
      'loyaltyPoints',
      'whatsappOptIn',
    ];

    const payload = { period, summary: { partyCount: entries.length, total }, entries };
    if (format === 'json') return payload;

    return this.exportBundle({
      tenantId,
      format,
      filenameBase: `Receivables_${now.toISOString().slice(0, 10)}`,
      title: 'Customer Receivables (Udhaar)',
      period,
      summaryCards: [
        { label: 'Total receivable', value: total },
        { label: 'Parties', value: entries.length },
      ],
      columns: [
        { key: 'sn', label: 'SN' },
        { key: 'name', label: 'Name' },
        { key: 'phone', label: 'Phone' },
        { key: 'gstin', label: 'GSTIN' },
        { key: 'address', label: 'Address' },
        { key: 'creditLimit', label: 'Limit', align: 'right' },
        { key: 'outstanding', label: 'Outstanding', align: 'right' },
      ],
      rows: entries,
      csvHeaders: headers,
      xlsxSheets: [{ name: 'Receivables', headers, rows: entries }],
    });
  }

  async payablesReport(tenantId: string, q: { format?: string }) {
    const format = this.formatOrThrow(q.format);
    const aging = await this.inventory.getSupplierAging(tenantId);
    const now = new Date();
    const period: ReportPeriod = {
      from: startOfDay(now),
      to: endOfDay(now),
      label: `As of ${fmtDate(now)}`,
      fyKey: null,
      quarter: null,
    };

    const entries = aging.map((r, i) => {
      const address = [r.address, r.addressLine2, r.city, r.stateCode, r.pincode]
        .filter(Boolean)
        .join(', ');
      return {
        sn: i + 1,
        name: r.name,
        phone: r.phone ?? '',
        email: r.email ?? '',
        gstin: r.gstin ?? '',
        address,
        city: r.city ?? '',
        pincode: r.pincode ?? '',
        stateCode: r.stateCode ?? '',
        isMsme: r.isMsme ? 'Yes' : 'No',
        paymentTermsDays: r.paymentTermsDays ?? '',
        bankName: r.bankName ?? '',
        ifsc: r.ifsc ?? '',
        advanceBalance: Number(r.advanceBalance ?? 0),
        outstanding: Number(r.outstanding ?? 0),
        billCount: Number(r.billCount ?? 0),
        overdueCount: Number(r.overdueCount ?? 0),
        msmeOver45: Number(r.msmeOver45 ?? 0),
      };
    });

    const total = entries.reduce((s, e) => s + e.outstanding, 0);
    const overdue = entries.reduce((s, e) => s + e.overdueCount, 0);
    const headers = [
      'sn',
      'name',
      'phone',
      'email',
      'gstin',
      'address',
      'isMsme',
      'paymentTermsDays',
      'bankName',
      'ifsc',
      'billCount',
      'overdueCount',
      'msmeOver45',
      'advanceBalance',
      'outstanding',
    ];

    const payload = {
      period,
      summary: { partyCount: entries.length, total, overdueCount: overdue },
      entries,
    };
    if (format === 'json') return payload;

    return this.exportBundle({
      tenantId,
      format,
      filenameBase: `Payables_${now.toISOString().slice(0, 10)}`,
      title: 'Supplier Payables (Khata)',
      period,
      summaryCards: [
        { label: 'Total payable', value: total },
        { label: 'Parties', value: entries.length },
        { label: 'Overdue bills', value: overdue },
      ],
      columns: [
        { key: 'sn', label: 'SN' },
        { key: 'name', label: 'Name' },
        { key: 'phone', label: 'Phone' },
        { key: 'gstin', label: 'GSTIN' },
        { key: 'address', label: 'Address' },
        { key: 'billCount', label: 'Bills', align: 'right' },
        { key: 'overdueCount', label: 'Overdue', align: 'right' },
        { key: 'outstanding', label: 'Outstanding', align: 'right' },
      ],
      rows: entries,
      csvHeaders: headers,
      xlsxSheets: [{ name: 'Payables', headers, rows: entries }],
    });
  }

  // ─── Stock valuation (snapshot) ──────────────────────────────────

  async stockValuation(
    tenantId: string,
    q: { category?: string; gstRate?: string; format?: string },
  ) {
    const format = this.formatOrThrow(q.format);
    const slabFilter = this.parseGstRate(q.gstRate);
    const products = await this.prisma.product.findMany({
      where: {
        tenantId,
        isActive: true,
        ...(q.category?.trim()
          ? { category: { equals: q.category.trim(), mode: 'insensitive' } }
          : {}),
        ...(slabFilter != null ? { gstRate: slabFilter } : {}),
      },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });

    const entries = products.map((p) => {
      const qty = Number(p.stockQty);
      const unitCost = Number(p.purchasePrice || p.salePrice || 0);
      const unitSale = Number(p.salePrice || 0);
      return {
        sku: p.sku,
        name: p.name,
        category: p.category?.trim() || 'Uncategorized',
        brand: p.brand ?? '',
        gstRate: Number(p.gstRate),
        stockQty: qty,
        purchasePrice: unitCost,
        salePrice: unitSale,
        stockValueCost: Math.round(qty * unitCost * 100) / 100,
        stockValueSale: Math.round(qty * unitSale * 100) / 100,
        lowStock: qty <= Number(p.lowStockThreshold),
      };
    });

    const byCategory: Record<
      string,
      { category: string; skuCount: number; stockQty: number; stockValueCost: number; stockValueSale: number }
    > = {};
    const byGst: Record<
      string,
      { gstRate: number; skuCount: number; stockQty: number; stockValueCost: number; stockValueSale: number }
    > = {};

    for (const row of entries) {
      if (!byCategory[row.category]) {
        byCategory[row.category] = {
          category: row.category,
          skuCount: 0,
          stockQty: 0,
          stockValueCost: 0,
          stockValueSale: 0,
        };
      }
      byCategory[row.category].skuCount += 1;
      byCategory[row.category].stockQty += row.stockQty;
      byCategory[row.category].stockValueCost += row.stockValueCost;
      byCategory[row.category].stockValueSale += row.stockValueSale;

      const gk = String(row.gstRate);
      if (!byGst[gk]) {
        byGst[gk] = {
          gstRate: row.gstRate,
          skuCount: 0,
          stockQty: 0,
          stockValueCost: 0,
          stockValueSale: 0,
        };
      }
      byGst[gk].skuCount += 1;
      byGst[gk].stockQty += row.stockQty;
      byGst[gk].stockValueCost += row.stockValueCost;
      byGst[gk].stockValueSale += row.stockValueSale;
    }

    const summary = {
      skuCount: entries.length,
      stockQty: entries.reduce((s, e) => s + e.stockQty, 0),
      stockValueCost: entries.reduce((s, e) => s + e.stockValueCost, 0),
      stockValueSale: entries.reduce((s, e) => s + e.stockValueSale, 0),
      lowStockCount: entries.filter((e) => e.lowStock).length,
      byCategory: Object.values(byCategory).sort((a, b) => a.category.localeCompare(b.category)),
      byGstSlab: Object.values(byGst).sort((a, b) => a.gstRate - b.gstRate),
    };

    const period: ReportPeriod = {
      label: 'As of now',
      from: new Date(),
      to: new Date(),
      fyKey: null,
      quarter: null,
    };
    const payload = { period, summary, entries };
    if (format === 'json') return payload;

    const headers = [
      'sku',
      'name',
      'category',
      'brand',
      'gstRate',
      'stockQty',
      'purchasePrice',
      'salePrice',
      'stockValueCost',
      'stockValueSale',
    ];
    return this.exportBundle({
      tenantId,
      format,
      filenameBase: 'Stock_Valuation',
      title: 'Stock Valuation',
      period,
      summaryCards: [
        { label: 'SKUs', value: summary.skuCount },
        { label: 'Qty', value: summary.stockQty },
        { label: 'Cost value', value: summary.stockValueCost },
        { label: 'Sale value', value: summary.stockValueSale },
      ],
      columns: [
        { key: 'sku', label: 'SKU' },
        { key: 'name', label: 'Product' },
        { key: 'category', label: 'Category' },
        { key: 'gstRate', label: 'GST %', align: 'right' },
        { key: 'stockQty', label: 'Qty', align: 'right' },
        { key: 'stockValueCost', label: 'Cost value', align: 'right' },
        { key: 'stockValueSale', label: 'Sale value', align: 'right' },
      ],
      rows: entries,
      csvHeaders: headers,
      xlsxSheets: [
        { name: 'Valuation', headers, rows: entries },
        {
          name: 'By Category',
          headers: ['category', 'skuCount', 'stockQty', 'stockValueCost', 'stockValueSale'],
          rows: summary.byCategory as unknown as Array<Record<string, unknown>>,
        },
        {
          name: 'By GST',
          headers: ['gstRate', 'skuCount', 'stockQty', 'stockValueCost', 'stockValueSale'],
          rows: summary.byGstSlab as unknown as Array<Record<string, unknown>>,
        },
      ],
    });
  }

  // ─── Stock movements (ledger) ────────────────────────────────────

  async stockMovements(
    tenantId: string,
    q: {
      from?: string;
      to?: string;
      fy?: string;
      days?: string;
      quarter?: string;
      productId?: string;
      type?: string;
      format?: string;
    },
  ) {
    const period = this.period(q);
    const format = this.formatOrThrow(q.format);
    const typeFilter =
      q.type && ['PURCHASE', 'SALE', 'ADJUSTMENT', 'RETURN', 'REPAIR_USE', 'TRANSFER'].includes(q.type)
        ? (q.type as
            | 'PURCHASE'
            | 'SALE'
            | 'ADJUSTMENT'
            | 'RETURN'
            | 'REPAIR_USE'
            | 'TRANSFER')
        : undefined;

    const rows = await this.prisma.stockLedger.findMany({
      where: {
        tenantId,
        createdAt: { gte: period.from, lte: period.to },
        ...(q.productId ? { productId: q.productId } : {}),
        ...(typeFilter ? { type: typeFilter } : {}),
      },
      orderBy: { createdAt: 'asc' },
      include: {
        product: {
          select: { sku: true, name: true, category: true, gstRate: true },
        },
      },
    });

    const entries = rows.map((r) => ({
      date: fmtDate(r.createdAt),
      type: r.type,
      sku: r.product.sku,
      name: r.product.name,
      category: r.product.category ?? '',
      gstRate: Number(r.product.gstRate),
      quantity: Number(r.quantity),
      notes: r.notes ?? '',
      referenceId: r.referenceId ?? '',
    }));

    const byType: Record<string, { type: string; count: number; qtyIn: number; qtyOut: number }> = {};
    for (const e of entries) {
      if (!byType[e.type]) byType[e.type] = { type: e.type, count: 0, qtyIn: 0, qtyOut: 0 };
      byType[e.type].count += 1;
      if (e.quantity >= 0) byType[e.type].qtyIn += e.quantity;
      else byType[e.type].qtyOut += Math.abs(e.quantity);
    }

    const summary = {
      movementCount: entries.length,
      qtyIn: entries.filter((e) => e.quantity > 0).reduce((s, e) => s + e.quantity, 0),
      qtyOut: entries.filter((e) => e.quantity < 0).reduce((s, e) => s + Math.abs(e.quantity), 0),
      byType: Object.values(byType),
    };

    const payload = { period, summary, entries };
    if (format === 'json') return payload;

    const headers = ['date', 'type', 'sku', 'name', 'category', 'gstRate', 'quantity', 'notes'];
    return this.exportBundle({
      tenantId,
      format,
      filenameBase: `Stock_Movements_${slugPeriod(period)}`,
      title: 'Stock Movements',
      period,
      summaryCards: [
        { label: 'Movements', value: summary.movementCount },
        { label: 'Qty in', value: summary.qtyIn },
        { label: 'Qty out', value: summary.qtyOut },
      ],
      columns: [
        { key: 'date', label: 'Date' },
        { key: 'type', label: 'Type' },
        { key: 'sku', label: 'SKU' },
        { key: 'name', label: 'Product' },
        { key: 'quantity', label: 'Qty', align: 'right' },
        { key: 'notes', label: 'Notes' },
      ],
      rows: entries,
      csvHeaders: headers,
      xlsxSheets: [
        { name: 'Movements', headers, rows: entries },
        {
          name: 'By Type',
          headers: ['type', 'count', 'qtyIn', 'qtyOut'],
          rows: summary.byType as unknown as Array<Record<string, unknown>>,
        },
      ],
    });
  }
}
