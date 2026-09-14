import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { CustomerPaymentMethod, CustomerSegment, Prisma } from '@prisma/client';
import { parseAddressPayload, validateGstin } from '@retail-sarathi/gst-engine';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingService } from '../accounting/accounting.service';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';

type Tx = Prisma.TransactionClient;

@Injectable()
export class CustomersService {
  constructor(
    private prisma: PrismaService,
    private accounting: AccountingService,
  ) {}

  private normalizeCustomerAddress(
    dto: CreateCustomerDto | UpdateCustomerDto,
    existingStateCode?: string | null,
  ) {
    try {
      const parsed = parseAddressPayload({
        address: dto.address,
        addressLine2: dto.addressLine2,
        city: dto.city,
        stateCode: dto.stateCode ?? existingStateCode,
        pincode: dto.pincode,
        country: dto.country ?? 'IN',
      });
      if (dto.gstin && validateGstin(dto.gstin.toUpperCase()) && parsed.stateCode) {
        const gstState = dto.gstin.slice(0, 2);
        if (gstState !== parsed.stateCode) {
          throw new BadRequestException(
            `State code ${parsed.stateCode} does not match GSTIN state ${gstState}.`,
          );
        }
      }
      return parsed;
    } catch (err) {
      throw new BadRequestException(err instanceof Error ? err.message : 'Invalid address');
    }
  }

  async findAll(
    tenantId: string,
    opts?: {
      search?: string;
      segment?: string;
      page?: number;
      pageSize?: number;
      stateCode?: string;
      outstanding?: string;
      hasGstin?: string;
      hasLoyalty?: string;
      sortBy?: string;
      sortDir?: string;
    },
  ) {
    const search = opts?.search?.trim();
    const segment = opts?.segment?.trim();
    const stateCode = opts?.stateCode?.trim();
    const outstanding = opts?.outstanding?.trim().toLowerCase();
    const hasGstin = opts?.hasGstin?.trim().toLowerCase();
    const hasLoyalty = opts?.hasLoyalty?.trim().toLowerCase();
    const sortDir = opts?.sortDir?.toLowerCase() === 'desc' ? 'desc' : 'asc';
    const sortBy = opts?.sortBy?.trim() || 'name';

    const and: Array<Record<string, unknown>> = [];
    if (search) {
      and.push({
        OR: [
          { name: { contains: search, mode: 'insensitive' as const } },
          { phone: { contains: search } },
          { email: { contains: search, mode: 'insensitive' as const } },
          { city: { contains: search, mode: 'insensitive' as const } },
          { pincode: { contains: search } },
          { gstin: { contains: search, mode: 'insensitive' as const } },
          { address: { contains: search, mode: 'insensitive' as const } },
        ],
      });
    }
    if (hasGstin === 'yes') {
      and.push({
        AND: [{ gstin: { not: null } }, { gstin: { not: '' } }],
      });
    } else if (hasGstin === 'no') {
      and.push({
        OR: [{ gstin: null }, { gstin: '' }],
      });
    }

    const where: Record<string, unknown> = {
      tenantId,
      ...(segment ? { segment: segment as CustomerSegment } : {}),
      ...(stateCode ? { stateCode } : {}),
      ...(outstanding === 'due'
        ? { outstandingBalance: { gt: 0 } }
        : outstanding === 'clear'
          ? { outstandingBalance: { lte: 0 } }
          : {}),
      ...(hasLoyalty === 'yes'
        ? { loyaltyPoints: { gt: 0 } }
        : hasLoyalty === 'no'
          ? { loyaltyPoints: { lte: 0 } }
          : {}),
      ...(and.length ? { AND: and } : {}),
    };

    const orderByMap: Record<string, Record<string, unknown>> = {
      name: { name: sortDir },
      phone: { phone: sortDir },
      email: { email: sortDir },
      gstin: { gstin: sortDir },
      address: { address: sortDir },
      city: { city: sortDir },
      segment: { segment: sortDir },
      creditLimit: { creditLimit: sortDir },
      outstandingBalance: { outstandingBalance: sortDir },
      loyaltyPoints: { loyaltyPoints: sortDir },
      createdAt: { createdAt: sortDir },
      updatedAt: { updatedAt: sortDir },
      createdBy: { createdBy: { name: sortDir } },
      updatedBy: { updatedBy: { name: sortDir } },
    };
    const orderBy = orderByMap[sortBy] ?? { name: 'asc' };

    const userSelect = { select: { id: true, name: true } as const };
    const includeUsers = {
      createdBy: userSelect,
      updatedBy: userSelect,
    };

    const wantsPagination = opts?.page != null || opts?.pageSize != null;
    if (!wantsPagination) {
      // Legacy callers (POS, repairs, desktop) expect a full array.
      return this.prisma.customer.findMany({
        where,
        orderBy,
        include: includeUsers,
      });
    }

    const page = Math.max(1, opts?.page ?? 1);
    const pageSize = Math.min(Math.max(opts?.pageSize ?? 25, 1), 200);
    const [items, total] = await Promise.all([
      this.prisma.customer.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: includeUsers,
      }),
      this.prisma.customer.count({ where }),
    ]);
    return { items, total, page, pageSize };
  }

  async findOne(tenantId: string, id: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, tenantId },
      include: {
        createdBy: { select: { id: true, name: true } },
        updatedBy: { select: { id: true, name: true } },
        invoices: { take: 10, orderBy: { createdAt: 'desc' } },
        repairJobs: { take: 10, orderBy: { createdAt: 'desc' } },
        loyaltyTransactions: { take: 20, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  async create(tenantId: string, dto: CreateCustomerDto, userId?: string) {
    const addr = this.normalizeCustomerAddress(dto);
    return this.prisma.customer.create({
      data: {
        tenantId,
        name: dto.name,
        phone: dto.phone,
        email: dto.email,
        gstin: dto.gstin,
        address: addr.address,
        addressLine2: addr.addressLine2,
        city: addr.city,
        pincode: addr.pincode,
        country: addr.country ?? 'IN',
        stateCode: addr.stateCode,
        segment: (dto.segment as CustomerSegment) ?? 'RETAIL',
        creditLimit: dto.creditLimit ?? 0,
        tags: dto.tags ?? [],
        whatsappOptIn: dto.whatsappOptIn ?? false,
        ...(userId
          ? { createdByUserId: userId, updatedByUserId: userId }
          : {}),
      },
      include: {
        createdBy: { select: { id: true, name: true } },
        updatedBy: { select: { id: true, name: true } },
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateCustomerDto, userId?: string) {
    const existing = await this.findOne(tenantId, id);
    const touchingAddress =
      dto.address !== undefined ||
      dto.addressLine2 !== undefined ||
      dto.city !== undefined ||
      dto.pincode !== undefined ||
      dto.country !== undefined ||
      dto.stateCode !== undefined;

    const addr = touchingAddress
      ? this.normalizeCustomerAddress(
          {
            ...dto,
            address: dto.address ?? existing.address ?? undefined,
            addressLine2: dto.addressLine2 ?? existing.addressLine2 ?? undefined,
            city: dto.city ?? existing.city ?? undefined,
            pincode: dto.pincode ?? existing.pincode ?? undefined,
            country: dto.country ?? existing.country ?? undefined,
            stateCode: dto.stateCode ?? existing.stateCode ?? undefined,
            gstin: dto.gstin ?? existing.gstin ?? undefined,
          },
          existing.stateCode,
        )
      : null;

    return this.prisma.customer.update({
      where: { id },
      data: {
        name: dto.name,
        phone: dto.phone,
        email: dto.email,
        gstin: dto.gstin,
        ...(addr
          ? {
              address: addr.address,
              addressLine2: addr.addressLine2,
              city: addr.city,
              pincode: addr.pincode,
              country: addr.country ?? 'IN',
              stateCode: addr.stateCode,
            }
          : dto.stateCode !== undefined
            ? { stateCode: dto.stateCode }
            : {}),
        segment: dto.segment ? (dto.segment as CustomerSegment) : undefined,
        creditLimit: dto.creditLimit,
        tags: dto.tags,
        whatsappOptIn: dto.whatsappOptIn,
        ...(userId ? { updatedByUserId: userId } : {}),
      },
      include: {
        createdBy: { select: { id: true, name: true } },
        updatedBy: { select: { id: true, name: true } },
      },
    });
  }

  async earnLoyalty(tenantId: string, customerId: string, amount: number, referenceId?: string) {
    const points = Math.floor(amount / 100);
    if (points <= 0) return null;

    return this.prisma.$transaction(async (tx) => {
      await tx.customer.update({
        where: { id: customerId },
        data: { loyaltyPoints: { increment: points } },
      });
      return tx.loyaltyTransaction.create({
        data: {
          tenantId,
          customerId,
          points,
          reason: `Earned on purchase ₹${amount}`,
          referenceId,
        },
      });
    });
  }

  async redeemLoyalty(tenantId: string, customerId: string, points: number) {
    const customer = await this.findOne(tenantId, customerId);
    if (points <= 0) throw new BadRequestException('Points must be positive');
    if (customer.loyaltyPoints < points) {
      throw new BadRequestException('Insufficient loyalty points');
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.customer.update({
        where: { id: customerId },
        data: { loyaltyPoints: { decrement: points } },
      });
      return tx.loyaltyTransaction.create({
        data: {
          tenantId,
          customerId,
          points: -points,
          reason: `Redeemed ${points} points`,
        },
      });
    });
  }

  /** Udhaar aging — remaining credit after collections allocated to invoices */
  async getAging(tenantId: string, customerId?: string) {
    const customers = await this.prisma.customer.findMany({
      where: {
        tenantId,
        outstandingBalance: { gt: 0 },
        ...(customerId ? { id: customerId } : {}),
      },
      orderBy: { outstandingBalance: 'desc' },
    });

    const now = Date.now();
    const result = [];
    for (const c of customers) {
      const creditInvoices = await this.prisma.invoice.findMany({
        where: {
          tenantId,
          customerId: c.id,
          status: 'FINALIZED',
          type: { not: 'CREDIT_NOTE' },
          payments: { some: { method: 'CREDIT' } },
        },
        orderBy: { createdAt: 'asc' },
        include: {
          payments: true,
          customerPaymentAllocations: true,
        },
      });

      let d0 = 0;
      let d30 = 0;
      let d60 = 0;
      let d90 = 0;
      for (const inv of creditInvoices) {
        const creditAmt = inv.payments
          .filter((p) => p.method === 'CREDIT')
          .reduce((s, p) => s + Number(p.amount), 0);
        const allocated = inv.customerPaymentAllocations.reduce(
          (s, a) => s + Number(a.amount),
          0,
        );
        const remaining = Math.max(0, creditAmt - allocated);
        if (remaining <= 0.01) continue;
        const ageDays = Math.floor((now - inv.createdAt.getTime()) / 86400000);
        if (ageDays <= 30) d0 += remaining;
        else if (ageDays <= 60) d30 += remaining;
        else if (ageDays <= 90) d60 += remaining;
        else d90 += remaining;
      }

      result.push({
        customerId: c.id,
        name: c.name,
        phone: c.phone,
        email: c.email,
        gstin: c.gstin,
        address: c.address,
        addressLine2: c.addressLine2,
        city: c.city,
        pincode: c.pincode,
        stateCode: c.stateCode,
        country: c.country,
        segment: c.segment,
        outstanding: Number(c.outstandingBalance),
        creditLimit: Number(c.creditLimit),
        advanceBalance: Number(c.advanceBalance),
        loyaltyPoints: c.loyaltyPoints,
        whatsappOptIn: c.whatsappOptIn,
        aging: { current: d0, days30: d30, days60: d60, days90plus: d90 },
      });
    }
    return result;
  }

  async collectPayment(
    tenantId: string,
    customerId: string,
    data: {
      amount: number;
      method?: string;
      reference?: string;
      notes?: string;
      paymentDate?: string;
      bankName?: string;
      attachmentPath?: string;
      attachmentName?: string;
      attachmentMime?: string;
      allocations?: Array<{ invoiceId: string; amount: number }>;
    },
  ) {
    const customer = await this.findOne(tenantId, customerId);
    const amount = Number(data.amount);
    if (amount <= 0) throw new BadRequestException('Amount must be positive');

    const methodRaw = (data.method ?? 'CASH').toUpperCase();
    const allowed: CustomerPaymentMethod[] = [
      'CASH',
      'UPI',
      'CARD',
      'CHEQUE',
      'BANK_TRANSFER',
      'OTHER',
    ];
    const method = (allowed.includes(methodRaw as CustomerPaymentMethod)
      ? methodRaw
      : 'OTHER') as CustomerPaymentMethod;

    const paymentDate = data.paymentDate ? new Date(data.paymentDate) : new Date();
    const outstanding = Number(customer.outstandingBalance);
    const towardDues = Math.min(amount, outstanding);
    const advancePart = Math.max(0, this.round2(amount - towardDues));

    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.customer.update({
        where: { id: customerId },
        data: {
          outstandingBalance: { decrement: towardDues },
          ...(advancePart > 0.01 ? { advanceBalance: { increment: advancePart } } : {}),
        },
      });

      const payment = await tx.customerPayment.create({
        data: {
          tenantId,
          customerId,
          amount,
          method,
          status: 'POSTED',
          referenceNo: data.reference?.trim() || null,
          bankName: data.bankName?.trim() || null,
          notes: data.notes?.trim() || null,
          paymentDate,
          attachmentPath: data.attachmentPath,
          attachmentName: data.attachmentName,
          attachmentMime: data.attachmentMime,
        },
      });

      if (towardDues > 0.01) {
        await this.appendCustomerLedger(tx, {
          tenantId,
          customerId,
          type: 'COLLECTION',
          amount: towardDues,
          paymentId: payment.id,
          notes: data.notes,
          entryDate: payment.paymentDate,
        });
      }

      let remaining = towardDues;
      const openInvoices = await tx.invoice.findMany({
        where: {
          tenantId,
          customerId,
          status: 'FINALIZED',
          type: { not: 'CREDIT_NOTE' },
          payments: { some: { method: 'CREDIT' } },
        },
        orderBy: { createdAt: 'asc' },
        include: {
          payments: true,
          customerPaymentAllocations: true,
        },
      });

      const targets = data.allocations?.length
        ? data.allocations.map((a) => ({
            invoiceId: a.invoiceId,
            amount: a.amount,
            inv: openInvoices.find((i) => i.id === a.invoiceId),
          }))
        : openInvoices.map((inv) => {
            const creditAmt = inv.payments
              .filter((p) => p.method === 'CREDIT')
              .reduce((s, p) => s + Number(p.amount), 0);
            const allocated = inv.customerPaymentAllocations.reduce(
              (s, a) => s + Number(a.amount),
              0,
            );
            return { invoiceId: inv.id, amount: Math.max(0, creditAmt - allocated), inv };
          });

      for (const target of targets) {
        if (remaining <= 0.01) break;
        const inv = target.inv || openInvoices.find((i) => i.id === target.invoiceId);
        if (!inv) continue;
        const creditAmt = inv.payments
          .filter((p) => p.method === 'CREDIT')
          .reduce((s, p) => s + Number(p.amount), 0);
        const allocated = inv.customerPaymentAllocations.reduce(
          (s, a) => s + Number(a.amount),
          0,
        );
        const due = creditAmt - allocated;
        if (due <= 0.01) continue;
        const apply = Math.min(due, remaining, target.amount > 0 ? target.amount : due);
        if (apply <= 0.01) continue;
        await tx.customerPaymentAllocation.create({
          data: { paymentId: payment.id, invoiceId: inv.id, amount: apply },
        });
        remaining -= apply;
      }

      return {
        customer: updated,
        collection: {
          id: payment.id,
          amount,
          method,
          reference: data.reference,
          notes: data.notes,
          advanceAmount: advancePart,
          collectedAt: payment.paymentDate.toISOString(),
        },
      };
    });

    await this.accounting
      .autoPostCollectionIfEnabled(tenantId, result.collection.id, amount)
      .catch(() => null);
    return result;
  }

  private round2(n: number) {
    return Math.round(n * 100) / 100;
  }

  async voidCustomerPayment(tenantId: string, paymentId: string, reason?: string) {
    const payment = await this.prisma.customerPayment.findFirst({
      where: { id: paymentId, tenantId },
      include: { allocations: true },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status !== 'POSTED') {
      throw new BadRequestException(`Payment is already ${payment.status}`);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const restored = payment.allocations.reduce((s, a) => s + Number(a.amount), 0);
      await tx.customerPaymentAllocation.deleteMany({ where: { paymentId } });
      const updated = await tx.customer.update({
        where: { id: payment.customerId },
        data: { outstandingBalance: { increment: restored } },
      });
      await tx.customerPayment.update({
        where: { id: paymentId },
        data: {
          status: 'VOIDED',
          voidedAt: new Date(),
          voidReason: reason?.trim() || null,
        },
      });
      await this.appendCustomerLedger(tx, {
        tenantId,
        customerId: payment.customerId,
        type: 'ADJUSTMENT',
        amount: restored > 0 ? restored : Number(payment.amount),
        paymentId,
        notes: [`Voided collection`, reason?.trim()].filter(Boolean).join(' · '),
        entryDate: new Date(),
      });
      return { paymentId, status: 'VOIDED' as const, customer: updated, restored };
    });

    await this.accounting
      .reverseCollectionIfEnabled(
        tenantId,
        paymentId,
        result.restored > 0 ? result.restored : Number(payment.amount),
      )
      .catch(() => null);
    return result;
  }

  async logCustomerReminder(tenantId: string, customerId: string, userId?: string) {
    const statement = await this.getStatement(tenantId, customerId);
    const c = statement.customer;
    const text =
      statement.whatsappShareUrl
        ? decodeURIComponent(
            (statement.whatsappShareUrl.split('text=')[1] || '').replace(/\+/g, ' '),
          )
        : `Namaste ${c.name}, your outstanding is ₹${Number(c.outstandingBalance).toFixed(2)}.`;
    const phone = c.phone.replace(/\D/g, '');
    const waPhone = phone.length === 10 ? `91${phone}` : phone;
    const waUrl = waPhone
      ? `https://wa.me/${waPhone}?text=${encodeURIComponent(
          `Namaste ${c.name}, your outstanding with us is ₹${Number(c.outstandingBalance).toFixed(2)}.`,
        )}`
      : null;
    const log = await this.prisma.partyReminderLog.create({
      data: {
        tenantId,
        partyType: 'CUSTOMER',
        partyId: customerId,
        channel: 'WHATSAPP',
        templateKey: 'DUES_SUMMARY',
        body: text || `Outstanding ₹${Number(c.outstandingBalance)}`,
        outstandingSnapshot: Number(c.outstandingBalance),
        status: 'SENT',
        createdByUserId: userId || null,
      },
    });
    return { text, waUrl, reminderId: log.id, outstanding: Number(c.outstandingBalance) };
  }

  async getOpenCreditInvoices(tenantId: string, customerId: string) {
    await this.findOne(tenantId, customerId);
    const invoices = await this.prisma.invoice.findMany({
      where: {
        tenantId,
        customerId,
        status: 'FINALIZED',
        type: { not: 'CREDIT_NOTE' },
        payments: { some: { method: 'CREDIT' } },
      },
      orderBy: { createdAt: 'asc' },
      include: { payments: true, customerPaymentAllocations: true },
    });
    return invoices
      .map((inv) => {
        const creditAmt = inv.payments
          .filter((p) => p.method === 'CREDIT')
          .reduce((s, p) => s + Number(p.amount), 0);
        const allocated = inv.customerPaymentAllocations.reduce(
          (s, a) => s + Number(a.amount),
          0,
        );
        const dueAmount = Math.max(0, creditAmt - allocated);
        return {
          id: inv.id,
          invoiceNumber: inv.invoiceNumber,
          createdAt: inv.createdAt,
          creditAmt,
          allocated,
          dueAmount,
        };
      })
      .filter((i) => i.dueAmount > 0.01);
  }

  async getStatement(tenantId: string, customerId: string) {
    const customer = await this.findOne(tenantId, customerId);
    const [invoices, ledger, payments] = await Promise.all([
      this.prisma.invoice.findMany({
        where: { tenantId, customerId, status: { in: ['FINALIZED', 'CANCELLED'] } },
        orderBy: { createdAt: 'desc' },
        take: 100,
        include: { payments: true, lines: true },
      }),
      this.prisma.customerLedgerEntry.findMany({
        where: { tenantId, customerId },
        orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
        take: 100,
        include: {
          invoice: { select: { invoiceNumber: true } },
          payment: { select: { referenceNo: true, method: true } },
        },
      }),
      this.prisma.customerPayment.findMany({
        where: { tenantId, customerId },
        orderBy: { paymentDate: 'desc' },
        take: 50,
        include: { allocations: true },
      }),
    ]);
    return {
      customer,
      invoices,
      ledger,
      payments,
      whatsappShareUrl: customer.whatsappOptIn
        ? `https://wa.me/91${customer.phone.replace(/\D/g, '').slice(-10)}?text=${encodeURIComponent(
            `Namaste ${customer.name}, your outstanding with us is ₹${Number(customer.outstandingBalance).toFixed(2)}. — RetailSarathi`,
          )}`
        : null,
    };
  }

  async whatsappStatement(tenantId: string, customerId: string) {
    const stmt = await this.getStatement(tenantId, customerId);
    const c = stmt.customer;
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    const text = `Namaste ${c.name}, your outstanding with ${tenant?.name || 'us'} is ₹${Number(c.outstandingBalance).toFixed(2)}. Statement attached / linked.`;
    const { buildReportHtml } = await import('../reports/report-html.util');
    const html = buildReportHtml({
      title: 'Customer statement',
      shopName: tenant?.name,
      shopMeta: [tenant?.gstin ? `GSTIN ${tenant.gstin}` : null, tenant?.phone].filter(Boolean).join(' · ') || undefined,
      partyName: c.name,
      partyMeta: c.phone,
      periodLabel: 'Current outstanding',
      summary: [
        { label: 'Outstanding', value: `₹${Number(c.outstandingBalance).toFixed(2)}` },
        { label: 'Ledger rows', value: String(stmt.ledger.length) },
      ],
      columns: [
        { key: 'date', label: 'Date' },
        { key: 'type', label: 'Type' },
        { key: 'amount', label: 'Amount', align: 'right' },
        { key: 'balance', label: 'Balance', align: 'right' },
      ],
      rows: stmt.ledger.slice(0, 40).map((e) => ({
        date: new Date(e.entryDate).toISOString().slice(0, 10),
        type: e.type,
        amount: Number(e.amount),
        balance: Number(e.balanceAfter),
      })),
    });
    const { sendWhatsAppWithOptionalMedia } = await import('../common/whatsapp.util');
    const wa = await sendWhatsAppWithOptionalMedia({
      phone: c.phone,
      text,
      htmlDocument: html,
      filename: `customer-statement-${c.id.slice(-6)}.html`,
      meta: { type: 'customer_statement', customerId },
    });
    await this.prisma.partyReminderLog.create({
      data: {
        tenantId,
        partyType: 'CUSTOMER',
        partyId: customerId,
        channel: 'WHATSAPP',
        templateKey: 'STATEMENT_MEDIA',
        body: text,
        outstandingSnapshot: Number(c.outstandingBalance),
        status: wa.sent ? 'SENT' : 'FAILED',
      },
    });
    return { ...wa, outstanding: Number(c.outstandingBalance) };
  }

  /** Append ledger row after outstandingBalance already updated in the same tx. */
  async appendCustomerLedger(
    tx: Tx,
    opts: {
      tenantId: string;
      customerId: string;
      type: 'INVOICE' | 'COLLECTION' | 'CREDIT_NOTE' | 'ADJUSTMENT';
      amount: number;
      invoiceId?: string;
      paymentId?: string;
      notes?: string | null;
      entryDate?: Date;
    },
  ) {
    if (opts.amount <= 0) return null;
    const customer = await tx.customer.findUnique({ where: { id: opts.customerId } });
    if (!customer) return null;
    return tx.customerLedgerEntry.create({
      data: {
        tenantId: opts.tenantId,
        customerId: opts.customerId,
        type: opts.type,
        amount: opts.amount,
        balanceAfter: Number(customer.outstandingBalance),
        invoiceId: opts.invoiceId,
        paymentId: opts.paymentId,
        notes: opts.notes ?? null,
        entryDate: opts.entryDate ?? new Date(),
      },
    });
  }
}
