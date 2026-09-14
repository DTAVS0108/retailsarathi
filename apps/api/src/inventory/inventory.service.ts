import { Injectable, NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AccountingService } from '../accounting/accounting.service';

@Injectable()
export class InventoryService {
  constructor(
    private prisma: PrismaService,
    private accounting: AccountingService,
  ) {}

  private round2(n: number) {
    return Math.round(n * 100) / 100;
  }

  private addDays(date: Date, days: number) {
    const d = new Date(date);
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + days);
    return d;
  }

  private resolveDueDate(invoiceDate: Date | null | undefined, termsDays: number, explicit?: Date | null) {
    if (explicit) return explicit;
    if (invoiceDate) return this.addDays(invoiceDate, termsDays);
    return this.addDays(new Date(), termsDays);
  }

  private agingBucket(dueOrInvoice: Date | null | undefined, dueAmount: number) {
    if (!(dueAmount > 0.009)) return 'PAID' as const;
    const anchor = dueOrInvoice ?? new Date();
    const ageDays = Math.floor((Date.now() - anchor.getTime()) / 86400000);
    if (ageDays <= 0) return 'CURRENT' as const; // not yet due
    if (ageDays <= 30) return 'DUE_0_30' as const;
    if (ageDays <= 60) return 'DUE_31_60' as const;
    if (ageDays <= 90) return 'DUE_61_90' as const;
    return 'DUE_90_PLUS' as const;
  }

  private billMissingFields(bill: {
    invoiceNumber?: string | null;
    invoiceDate?: Date | null;
    gstin?: string | null;
    supplierId?: string | null;
    supplierName?: string | null;
    subtotal?: unknown;
    taxAmount?: unknown;
    totalAmount?: unknown;
    lines?: unknown[];
  }) {
    const missing: string[] = [];
    if (!bill.invoiceNumber?.trim()) missing.push('invoiceNumber');
    if (!bill.invoiceDate) missing.push('invoiceDate');
    if (!bill.supplierId && !bill.supplierName?.trim()) missing.push('supplier');
    if (!bill.gstin?.trim()) missing.push('gstin');
    if (!(Number(bill.totalAmount) > 0)) missing.push('totalAmount');
    if (!(Array.isArray(bill.lines) ? bill.lines.length : 1)) missing.push('items');
    const sub = Number(bill.subtotal || 0);
    const tax = Number(bill.taxAmount || 0);
    const total = Number(bill.totalAmount || 0);
    if (sub > 0 && tax >= 0 && total > 0 && Math.abs(sub + tax - total) > 1) {
      missing.push('totalsMismatch');
    }
    return missing;
  }

  private decorateBill<T extends {
    invoiceDate: Date | null;
    dueDate?: Date | null;
    totalAmount: unknown;
    paidAmount: unknown;
    invoiceNumber?: string | null;
    gstin?: string | null;
    supplierId?: string | null;
    supplierName?: string | null;
    subtotal?: unknown;
    taxAmount?: unknown;
    cgstAmount?: unknown;
    sgstAmount?: unknown;
    igstAmount?: unknown;
    lines?: unknown[];
    status: string;
  }>(bill: T) {
    const dueAmount = this.round2(Math.max(0, Number(bill.totalAmount) - Number(bill.paidAmount)));
    const anchor = bill.dueDate ?? bill.invoiceDate;
    const ageDays = anchor
      ? Math.floor((Date.now() - new Date(anchor).getTime()) / 86400000)
      : 0;
    const overdueDays = dueAmount > 0.009 && ageDays > 0 ? ageDays : 0;
    return {
      ...bill,
      dueAmount,
      ageDays,
      overdueDays,
      agingBucket: this.agingBucket(anchor, dueAmount),
      missingFields: this.billMissingFields(bill),
      cgstAmount: Number(bill.cgstAmount ?? 0),
      sgstAmount: Number(bill.sgstAmount ?? 0),
      igstAmount: Number(bill.igstAmount ?? 0),
      subtotal: Number(bill.subtotal ?? 0),
      taxAmount: Number(bill.taxAmount ?? 0),
      totalAmount: Number(bill.totalAmount),
      paidAmount: Number(bill.paidAmount),
    };
  }

  // ─── Suppliers ─────────────────────────────────────────────────

  async listSuppliers(
    tenantId: string,
    opts: {
      includeArchived?: boolean;
      /** Name / GSTIN / phone / email / address / bank search (case-insensitive) */
      search?: string;
      /** due = outstanding > 0, clear = settled, all = no balance filter */
      outstanding?: 'due' | 'clear' | 'all';
      sort?: 'name' | 'pending' | 'open';
    } = {},
  ) {
    const search = opts.search?.trim();
    const outstanding = opts.outstanding && opts.outstanding !== 'all' ? opts.outstanding : undefined;
    const sort = opts.sort ?? (outstanding === 'due' ? 'pending' : 'name');

    const searchOr = search
      ? {
          OR: [
            { name: { contains: search, mode: 'insensitive' as const } },
            { phone: { contains: search, mode: 'insensitive' as const } },
            { email: { contains: search, mode: 'insensitive' as const } },
            { gstin: { contains: search, mode: 'insensitive' as const } },
            { address: { contains: search, mode: 'insensitive' as const } },
            { addressLine2: { contains: search, mode: 'insensitive' as const } },
            { city: { contains: search, mode: 'insensitive' as const } },
            { pincode: { contains: search, mode: 'insensitive' as const } },
            { bankName: { contains: search, mode: 'insensitive' as const } },
            { bankAccount: { contains: search, mode: 'insensitive' as const } },
            { ifsc: { contains: search, mode: 'insensitive' as const } },
            { bankBranch: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : undefined;

    const balanceWhere =
      outstanding === 'due'
        ? { outstandingBalance: { gt: 0 } }
        : outstanding === 'clear'
          ? { outstandingBalance: { lte: 0 } }
          : undefined;

    const suppliers = await this.prisma.supplier.findMany({
      where: {
        tenantId,
        ...(opts.includeArchived
          ? { purgedAt: null }
          : { isActive: true }),
        ...searchOr,
        ...balanceWhere,
      },
      orderBy:
        sort === 'pending'
          ? [{ outstandingBalance: 'desc' }, { name: 'asc' }]
          : sort === 'name'
            ? { name: 'asc' }
            : { name: 'asc' },
    });
    if (!suppliers.length) return [];

    const ids = suppliers.map((s) => s.id);
    const [bills, paymentGroups] = await Promise.all([
      this.prisma.purchaseBill.findMany({
        where: { tenantId, supplierId: { in: ids } },
        select: {
          supplierId: true,
          totalAmount: true,
          paidAmount: true,
          status: true,
        },
      }),
      this.prisma.supplierPayment.groupBy({
        by: ['supplierId'],
        where: { tenantId, supplierId: { in: ids } },
        _sum: { amount: true },
        _count: true,
      }),
    ]);

    const paymentMap = new Map(
      paymentGroups.map((p) => [
        p.supplierId,
        {
          clearedPayments: Number(p._sum.amount ?? 0),
          paymentCount: p._count,
        },
      ]),
    );

    type BillAgg = {
      billCount: number;
      openBillCount: number;
      paidBillCount: number;
      totalBilled: number;
      pendingFromBills: number;
    };
    const billMap = new Map<string, BillAgg>();
    for (const b of bills) {
      if (!b.supplierId) continue;
      if (b.status === 'CANCELLED') continue;
      const cur = billMap.get(b.supplierId) ?? {
        billCount: 0,
        openBillCount: 0,
        paidBillCount: 0,
        totalBilled: 0,
        pendingFromBills: 0,
      };
      const total = Number(b.totalAmount);
      const paid = Number(b.paidAmount);
      cur.billCount += 1;
      cur.totalBilled += total;
      cur.pendingFromBills += Math.max(0, total - paid);
      if (b.status === 'PAID') cur.paidBillCount += 1;
      else if (b.status === 'POSTED' || b.status === 'PARTIALLY_PAID') cur.openBillCount += 1;
      billMap.set(b.supplierId, cur);
    }

    const mapped = suppliers.map((s) => {
      const billsAgg = billMap.get(s.id) ?? {
        billCount: 0,
        openBillCount: 0,
        paidBillCount: 0,
        totalBilled: 0,
        pendingFromBills: 0,
      };
      const payAgg = paymentMap.get(s.id) ?? { clearedPayments: 0, paymentCount: 0 };
      const pendingPayable = Number(s.outstandingBalance);
      return {
        ...s,
        summary: {
          pendingPayable,
          clearedPayments: payAgg.clearedPayments,
          paymentCount: payAgg.paymentCount,
          billCount: billsAgg.billCount,
          openBillCount: billsAgg.openBillCount,
          paidBillCount: billsAgg.paidBillCount,
          totalBilled: billsAgg.totalBilled,
        },
      };
    });

    // Corrections / archive view needs every row. Pickers collapse same-GSTIN duplicates.
    let result = mapped;
    if (!opts.includeArchived) {
      const preferred = new Map<string, (typeof mapped)[number]>();
      const withoutGstin: typeof mapped = [];
      for (const s of mapped) {
        const g = s.gstin?.trim().toUpperCase();
        if (!g) {
          withoutGstin.push(s);
          continue;
        }
        const prev = preferred.get(g);
        if (!prev) {
          preferred.set(g, s);
          continue;
        }
        const prevScore = prev.summary.billCount * 1000 + (prev.isActive ? 1 : 0);
        const nextScore = s.summary.billCount * 1000 + (s.isActive ? 1 : 0);
        if (
          nextScore > prevScore ||
          (nextScore === prevScore && new Date(s.createdAt).getTime() < new Date(prev.createdAt).getTime())
        ) {
          preferred.set(g, s);
        }
      }
      result = [...preferred.values(), ...withoutGstin];
    }

    result.sort((a, b) => {
      if (sort === 'open') {
        const diff = b.summary.openBillCount - a.summary.openBillCount;
        if (diff !== 0) return diff;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      }
      if (sort === 'pending') {
        const diff = b.summary.pendingPayable - a.summary.pendingPayable;
        if (Math.abs(diff) > 0.009) return diff > 0 ? 1 : -1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      }
      return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    });

    return result;
  }

  /**
   * Create supplier, or reuse existing when GSTIN (preferred) or exact name already matches.
   * Prevents duplicate “M/s …” rows for the same GSTIN from Stock-in Save supplier.
   */
  async createSupplier(
    tenantId: string,
    data: {
      name: string;
      phone?: string;
      email?: string;
      gstin?: string;
      address?: string;
      addressLine2?: string;
      city?: string;
      pincode?: string;
      country?: string;
      stateCode?: string;
      bankName?: string;
      bankAccount?: string;
      ifsc?: string;
      bankBranch?: string;
      isMsme?: boolean;
      paymentTermsDays?: number;
    },
  ) {
    if (!data.name?.trim()) throw new BadRequestException('Supplier name required');

    const name = data.name.trim();
    const gstin = data.gstin?.trim().toUpperCase() || undefined;
    const phone = data.phone?.trim() || undefined;
    const email = data.email?.trim() || undefined;
    const address = data.address?.trim() || undefined;
    const addressLine2 = data.addressLine2?.trim() || undefined;
    const city = data.city?.trim() || undefined;
    const pincode = data.pincode?.trim().replace(/\D/g, '').slice(0, 6) || undefined;
    const country = data.country?.trim().toUpperCase() || 'IN';
    const stateCode =
      data.stateCode?.trim().replace(/\D/g, '').padStart(2, '0').slice(0, 2) ||
      (gstin && gstin.length >= 2 ? gstin.slice(0, 2) : undefined);
    const bankName = data.bankName?.trim() || undefined;
    const bankAccount = data.bankAccount?.replace(/\s+/g, '') || undefined;
    const ifsc = data.ifsc?.trim().toUpperCase() || undefined;
    const bankBranch = data.bankBranch?.trim() || undefined;
    const isMsme = data.isMsme === true;
    const paymentTermsDays =
      data.paymentTermsDays && data.paymentTermsDays > 0 ? data.paymentTermsDays : 30;

    let existing = gstin
      ? await this.prisma.supplier.findFirst({
          where: { tenantId, gstin: { equals: gstin, mode: 'insensitive' } },
          orderBy: { createdAt: 'asc' },
        })
      : null;

    if (!existing && name) {
      const byName = await this.prisma.supplier.findFirst({
        where: { tenantId, name: { equals: name, mode: 'insensitive' } },
        orderBy: { createdAt: 'asc' },
      });
      if (byName) {
        const existingGst = byName.gstin?.trim().toUpperCase() || '';
        if (!gstin || !existingGst || existingGst === gstin) {
          existing = byName;
        }
      }
    }

    if (existing) {
      if (gstin && existing.gstin && existing.gstin.toUpperCase() !== gstin) {
        throw new BadRequestException(
          `Supplier “${existing.name}” already exists with a different GSTIN. Select it from the list or use a different name.`,
        );
      }
      const patch: Record<string, unknown> = {};
      if (!existing.isActive) patch.isActive = true;
      if (name && name !== existing.name) patch.name = name;
      if (gstin && !existing.gstin) patch.gstin = gstin;
      if (phone && !existing.phone) patch.phone = phone;
      if (email && !existing.email) patch.email = email;
      if (address && !existing.address) patch.address = address;
      if (addressLine2 && !existing.addressLine2) patch.addressLine2 = addressLine2;
      if (city && !existing.city) patch.city = city;
      if (pincode && !existing.pincode) patch.pincode = pincode;
      if (country && !existing.country) patch.country = country;
      if (stateCode && !existing.stateCode) patch.stateCode = stateCode;
      if (bankName && !existing.bankName) patch.bankName = bankName;
      if (bankAccount && !existing.bankAccount) patch.bankAccount = bankAccount;
      if (ifsc && !existing.ifsc) patch.ifsc = ifsc;
      if (bankBranch && !existing.bankBranch) patch.bankBranch = bankBranch;
      if (Object.keys(patch).length) {
        return this.prisma.supplier.update({ where: { id: existing.id }, data: patch });
      }
      return existing;
    }

    return this.prisma.supplier.create({
      data: {
        tenantId,
        name,
        phone,
        email,
        gstin,
        address,
        addressLine2,
        city,
        pincode,
        country,
        stateCode,
        bankName,
        bankAccount,
        ifsc,
        bankBranch,
        isMsme,
        paymentTermsDays,
      },
    });
  }

  /**
   * Find or create supplier from invoice header. Prefer GSTIN match, then name.
   * Backfills empty phone/address/gstin/bank fields on an existing record.
   */
  async ensureSupplierFromInvoice(
    tenantId: string,
    data: {
      supplierId?: string;
      name?: string;
      gstin?: string;
      phone?: string;
      address?: string;
      bankName?: string;
      bankAccount?: string;
      ifsc?: string;
      bankBranch?: string;
    },
  ) {
    const name = data.name?.trim();
    const gstin = data.gstin?.trim().toUpperCase() || undefined;
    const phone = data.phone?.trim() || undefined;
    const address = data.address?.trim() || undefined;
    const bankName = data.bankName?.trim() || undefined;
    const bankAccount = data.bankAccount?.replace(/\s+/g, '') || undefined;
    const ifsc = data.ifsc?.trim().toUpperCase() || undefined;
    const bankBranch = data.bankBranch?.trim() || undefined;

    let supplier = data.supplierId
      ? await this.prisma.supplier.findFirst({ where: { id: data.supplierId, tenantId } })
      : null;

    if (!supplier && gstin) {
      supplier = await this.prisma.supplier.findFirst({
        where: { tenantId, isActive: true, gstin: { equals: gstin, mode: 'insensitive' } },
      });
    }
    if (!supplier && name) {
      supplier = await this.prisma.supplier.findFirst({
        where: { tenantId, isActive: true, name: { equals: name, mode: 'insensitive' } },
      });
    }
    // Fall back to archived match so we can restore rather than duplicate
    if (!supplier && gstin) {
      supplier = await this.prisma.supplier.findFirst({
        where: { tenantId, gstin: { equals: gstin, mode: 'insensitive' } },
      });
    }
    if (!supplier && name) {
      supplier = await this.prisma.supplier.findFirst({
        where: { tenantId, name: { equals: name, mode: 'insensitive' } },
      });
    }

    if (!supplier) {
      if (!name && !gstin) return null;
      return this.prisma.supplier.create({
        data: {
          tenantId,
          name: name || `Supplier ${gstin}`,
          gstin,
          phone,
          address,
          bankName,
          bankAccount,
          ifsc,
          bankBranch,
        },
      });
    }

    const patch: {
      name?: string;
      gstin?: string;
      phone?: string;
      address?: string;
      bankName?: string;
      bankAccount?: string;
      ifsc?: string;
      bankBranch?: string;
      isActive?: boolean;
    } = {};
    if (!supplier.isActive) patch.isActive = true;
    if (name && (!supplier.name || supplier.name.length < name.length)) patch.name = name;
    if (gstin && !supplier.gstin) patch.gstin = gstin;
    if (phone && !supplier.phone) patch.phone = phone;
    if (address && !supplier.address) patch.address = address;
    if (bankName && !supplier.bankName) patch.bankName = bankName;
    if (bankAccount && !supplier.bankAccount) patch.bankAccount = bankAccount;
    if (ifsc && !supplier.ifsc) patch.ifsc = ifsc;
    if (bankBranch && !supplier.bankBranch) patch.bankBranch = bankBranch;
    if (Object.keys(patch).length === 0) return supplier;
    return this.prisma.supplier.update({ where: { id: supplier.id }, data: patch });
  }

  async updateSupplier(
    tenantId: string,
    id: string,
    data: {
      name?: string;
      phone?: string;
      email?: string;
      gstin?: string;
      address?: string;
      addressLine2?: string | null;
      city?: string | null;
      pincode?: string | null;
      country?: string | null;
      stateCode?: string | null;
      bankName?: string;
      bankAccount?: string;
      ifsc?: string;
      bankBranch?: string;
      isMsme?: boolean;
      paymentTermsDays?: number;
    },
  ) {
    const existing = await this.prisma.supplier.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Supplier not found');

    const nextGstin =
      data.gstin !== undefined ? data.gstin.trim().toUpperCase() || null : undefined;
    if (nextGstin) {
      const clash = await this.prisma.supplier.findFirst({
        where: {
          tenantId,
          id: { not: id },
          gstin: { equals: nextGstin, mode: 'insensitive' },
        },
      });
      if (clash) {
        throw new BadRequestException(
          `GSTIN ${nextGstin} already belongs to “${clash.name}”. Open that supplier instead of duplicating.`,
        );
      }
    }

    const nextStateCode =
      data.stateCode !== undefined
        ? data.stateCode
          ? String(data.stateCode).replace(/\D/g, '').padStart(2, '0').slice(0, 2)
          : null
        : undefined;
    const nextPincode =
      data.pincode !== undefined
        ? data.pincode
          ? String(data.pincode).replace(/\D/g, '').slice(0, 6)
          : null
        : undefined;

    return this.prisma.supplier.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.phone !== undefined ? { phone: data.phone } : {}),
        ...(data.email !== undefined ? { email: data.email } : {}),
        ...(nextGstin !== undefined ? { gstin: nextGstin } : {}),
        ...(data.address !== undefined ? { address: data.address } : {}),
        ...(data.addressLine2 !== undefined
          ? { addressLine2: data.addressLine2?.trim() || null }
          : {}),
        ...(data.city !== undefined ? { city: data.city?.trim() || null } : {}),
        ...(nextPincode !== undefined ? { pincode: nextPincode } : {}),
        ...(data.country !== undefined
          ? { country: data.country?.trim().toUpperCase() || 'IN' }
          : {}),
        ...(nextStateCode !== undefined ? { stateCode: nextStateCode } : {}),
        ...(data.bankName !== undefined ? { bankName: data.bankName?.trim() || null } : {}),
        ...(data.bankAccount !== undefined
          ? { bankAccount: data.bankAccount ? data.bankAccount.replace(/\s+/g, '') : null }
          : {}),
        ...(data.ifsc !== undefined
          ? { ifsc: data.ifsc ? data.ifsc.trim().toUpperCase() : null }
          : {}),
        ...(data.bankBranch !== undefined ? { bankBranch: data.bankBranch?.trim() || null } : {}),
        ...(data.isMsme !== undefined ? { isMsme: Boolean(data.isMsme) } : {}),
        ...(data.paymentTermsDays !== undefined && data.paymentTermsDays > 0
          ? { paymentTermsDays: data.paymentTermsDays }
          : {}),
      },
    });
  }

  // ─── Purchase orders ───────────────────────────────────────────

  listPurchaseOrders(tenantId: string, status?: string) {
    return this.prisma.purchaseOrder
      .findMany({
        where: {
          tenantId,
          ...(status ? { status: status as never } : { status: { not: 'CANCELLED' } }),
        },
        orderBy: { createdAt: 'desc' },
        include: {
          supplier: true,
          branch: true,
          lines: { include: { product: true } },
        },
        take: 100,
      })
      .then((rows) => rows.map((po) => this.decoratePurchaseOrder(po)));
  }

  private decoratePurchaseOrder<
    T extends {
      status: string;
      supplierId?: string | null;
      lines: Array<{
        quantity: unknown;
        receivedQty: unknown;
        unitCost: unknown;
        product?: { trackSerial?: boolean } | null;
      }>;
    },
  >(po: T) {
    const orderedQty = po.lines.reduce((s, l) => s + Number(l.quantity), 0);
    const receivedQty = po.lines.reduce((s, l) => s + Number(l.receivedQty), 0);
    const orderedValue = this.round2(
      po.lines.reduce((s, l) => s + Number(l.quantity) * Number(l.unitCost), 0),
    );
    const receivedValue = this.round2(
      po.lines.reduce((s, l) => s + Number(l.receivedQty) * Number(l.unitCost), 0),
    );
    const missingFields: string[] = [];
    if (!po.supplierId) missingFields.push('supplier');
    if (!po.lines.length) missingFields.push('items');
    if (['ORDERED', 'PARTIAL'].includes(po.status) && receivedQty + 0.001 < orderedQty) {
      missingFields.push('receive');
    }
    return {
      ...po,
      orderedQty,
      receivedQty,
      remainingQty: this.round2(Math.max(0, orderedQty - receivedQty)),
      orderedValue,
      receivedValue,
      progressPct:
        orderedQty > 0 ? Math.min(100, Math.round((receivedQty / orderedQty) * 100)) : 0,
      missingFields,
    };
  }

  async createPurchaseOrder(
    tenantId: string,
    branchId: string,
    data: {
      supplierId?: string;
      notes?: string;
      lines: Array<{ productId: string; quantity: number; unitCost?: number }>;
    },
  ) {
    if (!branchId) throw new BadRequestException('Branch is required to create a purchase order');
    if (!data.lines?.length) throw new BadRequestException('Add at least one PO line');

    for (const line of data.lines) {
      if (!(Number(line.quantity) > 0)) {
        throw new BadRequestException('Each PO line needs quantity > 0');
      }
      const product = await this.prisma.product.findFirst({
        where: { id: line.productId, tenantId, isActive: true },
      });
      if (!product) throw new BadRequestException(`Product ${line.productId} not found`);
    }

    const year = new Date().getFullYear();
    const prefix = `PO-${year}-`;
    const last = await this.prisma.purchaseOrder.findFirst({
      where: { tenantId, poNumber: { startsWith: prefix } },
      orderBy: { poNumber: 'desc' },
    });
    const seq = last ? parseInt(last.poNumber.replace(prefix, ''), 10) + 1 : 1;
    const poNumber = `${prefix}${String(Number.isFinite(seq) ? seq : 1).padStart(5, '0')}`;

    const created = await this.prisma.purchaseOrder.create({
      data: {
        tenantId,
        branchId,
        supplierId: data.supplierId,
        poNumber,
        status: 'ORDERED',
        notes: data.notes,
        orderedAt: new Date(),
        lines: {
          create: data.lines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            unitCost: l.unitCost ?? 0,
          })),
        },
      },
      include: { lines: { include: { product: true } }, supplier: true },
    });
    return this.decoratePurchaseOrder(created);
  }

  async cancelPurchaseOrder(tenantId: string, poId: string) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id: poId, tenantId },
      include: { lines: true },
    });
    if (!po) throw new NotFoundException('Purchase order not found');
    if (po.status === 'CANCELLED') return this.decoratePurchaseOrder({ ...po, lines: po.lines });
    if (po.status === 'RECEIVED') {
      throw new BadRequestException('Fully received POs cannot be cancelled — void stock via Corrections if needed');
    }
    const anyReceived = po.lines.some((l) => Number(l.receivedQty) > 0);
    if (anyReceived) {
      throw new BadRequestException(
        'PO has partial receipts. Finish receiving or reverse stock manually before cancelling.',
      );
    }
    const updated = await this.prisma.purchaseOrder.update({
      where: { id: poId },
      data: { status: 'CANCELLED' },
      include: { lines: { include: { product: true } }, supplier: true },
    });
    return this.decoratePurchaseOrder(updated);
  }

  /** Goods receipt (GRN) — receive quantities against PO lines */
  async receivePurchaseOrder(
    tenantId: string,
    poId: string,
    receipts: Array<{ lineId: string; quantity: number; serialNumbers?: string[] }>,
    opts: {
      createPurchaseBill?: boolean;
      invoiceNumber?: string;
      /** Force DRAFT bill even on full receive (supplier invoice pending). */
      billAsDraft?: boolean;
    } = {},
  ) {
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id: poId, tenantId },
      include: { lines: { include: { product: true } }, supplier: true },
    });
    if (!po) throw new NotFoundException('Purchase order not found');
    if (po.status === 'CANCELLED' || po.status === 'RECEIVED') {
      throw new BadRequestException(`Cannot receive PO in status ${po.status}`);
    }
    if (!receipts?.length) throw new BadRequestException('Add at least one receipt line');

    const waveLines: Array<{
      productId: string;
      productName: string;
      sku?: string | null;
      quantity: number;
      unitCost: number;
      hsnCode?: string | null;
      gstRate: number;
    }> = [];

    const updatedPo = await this.prisma.$transaction(async (tx) => {
      for (const receipt of receipts) {
        const line = po.lines.find((l) => l.id === receipt.lineId);
        if (!line) throw new BadRequestException(`Line ${receipt.lineId} not on PO`);
        const qty = Number(receipt.quantity);
        if (qty <= 0) continue;

        const remaining = Number(line.quantity) - Number(line.receivedQty);
        if (qty > remaining + 0.001) {
          throw new BadRequestException(
            `Receiving more than ordered for ${line.product?.name || line.id}`,
          );
        }

        const serials = (receipt.serialNumbers ?? []).map((s) => s.trim()).filter(Boolean);
        if (line.product?.trackSerial) {
          if (serials.length !== Math.round(qty)) {
            throw new BadRequestException(
              `"${line.product.name}" needs exactly ${Math.round(qty)} serial/IMEI number(s)`,
            );
          }
        }
        for (const serial of serials) {
          const clash = await tx.productSerial.findFirst({
            where: {
              OR: [{ serialNumber: serial }, { imei: serial }],
              product: { tenantId },
            },
          });
          if (clash) throw new BadRequestException(`Serial already exists: ${serial}`);
        }

        await tx.purchaseOrderLine.update({
          where: { id: line.id },
          data: { receivedQty: { increment: qty } },
        });

        const unitCost = Number(line.unitCost || 0);
        await tx.product.update({
          where: { id: line.productId },
          data: {
            stockQty: { increment: qty },
            ...(unitCost > 0 ? { purchasePrice: unitCost } : {}),
          },
        });

        await tx.stockLedger.create({
          data: {
            tenantId,
            productId: line.productId,
            type: 'PURCHASE',
            quantity: qty,
            referenceId: po.id,
            notes: `GRN for ${po.poNumber}`,
          },
        });

        const branchStock = await tx.branchStock.findUnique({
          where: {
            branchId_productId: { branchId: po.branchId, productId: line.productId },
          },
        });
        if (branchStock) {
          await tx.branchStock.update({
            where: { id: branchStock.id },
            data: { quantity: { increment: qty } },
          });
        } else {
          await tx.branchStock.create({
            data: {
              tenantId,
              branchId: po.branchId,
              productId: line.productId,
              quantity: qty,
            },
          });
        }

        for (const serial of serials) {
          await tx.productSerial.create({
            data: {
              productId: line.productId,
              serialNumber: serial,
              imei: serial,
              status: 'IN_STOCK',
            },
          });
        }

        waveLines.push({
          productId: line.productId,
          productName: line.product?.name || 'Item',
          sku: line.product?.sku,
          quantity: qty,
          unitCost,
          hsnCode: line.product?.hsnCode,
          gstRate: Number(line.product?.gstRate || 0),
        });
      }

      const updated = await tx.purchaseOrder.findUnique({
        where: { id: po.id },
        include: { lines: { include: { product: true } }, supplier: true },
      });
      const allReceived = updated!.lines.every(
        (l) => Number(l.receivedQty) + 0.001 >= Number(l.quantity),
      );
      const anyReceived = updated!.lines.some((l) => Number(l.receivedQty) > 0);

      return tx.purchaseOrder.update({
        where: { id: po.id },
        data: {
          status: allReceived ? 'RECEIVED' : anyReceived ? 'PARTIAL' : po.status,
          receivedAt: allReceived ? new Date() : undefined,
        },
        include: { lines: { include: { product: true } }, supplier: true },
      });
    });

    let purchaseBill = null as Awaited<ReturnType<InventoryService['upsertPurchaseBillFromStockIn']>> | null;
    const wantBill = opts.createPurchaseBill !== false && updatedPo.supplierId && waveLines.length > 0;
    if (wantBill) {
      const isPartial = updatedPo.status === 'PARTIAL';
      const asDraft = opts.billAsDraft === true || (isPartial && !opts.invoiceNumber?.trim());
      const invoiceNumber =
        opts.invoiceNumber?.trim() ||
        `${asDraft ? 'DRAFT-' : ''}GRN-${updatedPo.poNumber.replace(/^PO-/, '')}-${Date.now().toString(36).toUpperCase()}`;
      try {
        purchaseBill = await this.upsertPurchaseBillFromStockIn(tenantId, {
          supplierId: updatedPo.supplierId ?? undefined,
          supplierName: updatedPo.supplier?.name,
          invoiceNumber,
          invoiceDate: new Date(),
          gstin: updatedPo.supplier?.gstin ?? undefined,
          notes: JSON.stringify({
            source: 'po-grn',
            poNumber: updatedPo.poNumber,
            poId: updatedPo.id,
            wave: true,
          }),
          status: asDraft ? 'DRAFT' : 'POSTED',
          lines: waveLines.map((l) => ({
            productId: l.productId,
            productName: l.productName,
            sku: l.sku ?? undefined,
            quantity: l.quantity,
            unitCost: l.unitCost,
            hsnCode: l.hsnCode ?? undefined,
            gstRate: l.gstRate,
          })),
        });
      } catch {
        /* bill may already exist for invoice # — GRN stock still applied */
      }
    }

    return {
      ...this.decoratePurchaseOrder(updatedPo),
      purchaseBill,
    };
  }

  // ─── Stock take ────────────────────────────────────────────────

  private decorateStockTake<
    T extends {
      status: string;
      lines: Array<{
        systemQty: unknown;
        countedQty: unknown | null;
        varianceReason?: string | null;
      }>;
    },
  >(take: T) {
    const lineCount = take.lines.length;
    const countedLines = take.lines.filter((l) => l.countedQty != null).length;
    const varianceLines = take.lines.filter((l) => {
      if (l.countedQty == null) return false;
      return Math.abs(Number(l.countedQty) - Number(l.systemQty)) >= 0.001;
    }).length;
    const varianceQty = this.round2(
      take.lines.reduce((s, l) => {
        if (l.countedQty == null) return s;
        return s + (Number(l.countedQty) - Number(l.systemQty));
      }, 0),
    );
    const missingReasons = take.lines.filter((l) => {
      if (l.countedQty == null) return false;
      if (Math.abs(Number(l.countedQty) - Number(l.systemQty)) < 0.001) return false;
      return !l.varianceReason?.trim();
    }).length;
    const missingFields: string[] = [];
    if (take.status === 'OPEN' && countedLines < lineCount) missingFields.push('counts');
    if ((take.status === 'OPEN' || take.status === 'PENDING_APPROVAL') && varianceLines > 0) {
      missingFields.push('reviewVariances');
    }
    if ((take.status === 'OPEN' || take.status === 'PENDING_APPROVAL') && missingReasons > 0) {
      missingFields.push('varianceReasons');
    }
    return {
      ...take,
      lineCount,
      countedLines,
      uncountedLines: lineCount - countedLines,
      varianceLines,
      varianceQty,
      missingReasons,
      progressPct: lineCount ? Math.round((countedLines / lineCount) * 100) : 0,
      missingFields,
      lines: take.lines.map((l) => ({
        ...l,
        variance:
          l.countedQty == null ? null : this.round2(Number(l.countedQty) - Number(l.systemQty)),
      })),
    };
  }

  async listStockTakes(tenantId: string, status?: string) {
    const rows = await this.prisma.stockTake.findMany({
      where: {
        tenantId,
        ...(status ? { status: status as never } : {}),
      },
      orderBy: { createdAt: 'desc' },
      include: { branch: true, lines: { include: { product: true } } },
      take: 50,
    });
    return rows.map((t) => this.decorateStockTake(t));
  }

  async startStockTake(
    tenantId: string,
    branchId: string,
    data: {
      notes?: string;
      productIds?: string[];
      /** Filter by product.category string */
      category?: string;
      /** A / B / C grades (uses cached Product.abcGrade) */
      abcGrades?: string[];
    },
  ) {
    if (!branchId) throw new BadRequestException('Branch is required to start a stock take');

    const open = await this.prisma.stockTake.findFirst({
      where: { tenantId, status: { in: ['OPEN', 'PENDING_APPROVAL'] } },
    });
    if (open) {
      throw new BadRequestException(
        'An open or pending-approval stock take already exists. Complete, approve, or cancel it first.',
      );
    }

    let productIds = data.productIds?.filter(Boolean);
    if (!productIds?.length && data.abcGrades?.length) {
      const grades = data.abcGrades.map((g) => g.toUpperCase());
      const graded = await this.prisma.product.findMany({
        where: { tenantId, isActive: true, abcGrade: { in: grades } },
        select: { id: true },
        take: 500,
      });
      productIds = graded.map((p) => p.id);
    }

    const products = await this.prisma.product.findMany({
      where: {
        tenantId,
        isActive: true,
        ...(productIds?.length ? { id: { in: productIds } } : {}),
        ...(data.category?.trim()
          ? { category: { equals: data.category.trim(), mode: 'insensitive' } }
          : {}),
      },
      take: 500,
    });
    if (!products.length) throw new BadRequestException('No active products to count');

    const branchRows = await this.prisma.branchStock.findMany({
      where: { tenantId, branchId, productId: { in: products.map((p) => p.id) } },
    });
    const branchMap = new Map(branchRows.map((b) => [b.productId, Number(b.quantity)]));

    const created = await this.prisma.stockTake.create({
      data: {
        tenantId,
        branchId,
        notes: data.notes,
        status: 'OPEN',
        filterMeta: {
          category: data.category ?? null,
          abcGrades: data.abcGrades ?? null,
          productCount: products.length,
        },
        lines: {
          create: products.map((p) => ({
            productId: p.id,
            systemQty: branchMap.has(p.id) ? branchMap.get(p.id)! : Number(p.stockQty),
            countedQty: null,
          })),
        },
      },
      include: { lines: { include: { product: true } }, branch: true },
    });
    return this.decorateStockTake(created);
  }

  async updateStockTakeCounts(
    tenantId: string,
    id: string,
    lines: Array<{ lineId: string; countedQty: number; varianceReason?: string }>,
  ) {
    const take = await this.prisma.stockTake.findFirst({ where: { id, tenantId } });
    if (!take) throw new NotFoundException('Stock take not found');
    if (take.status !== 'OPEN' && take.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException('Stock take is not open');
    }

    await this.prisma.$transaction(
      lines.map((l) =>
        this.prisma.stockTakeLine.updateMany({
          where: { id: l.lineId, stockTakeId: id },
          data: {
            countedQty: l.countedQty,
            ...(l.varianceReason !== undefined
              ? { varianceReason: l.varianceReason?.trim() || null }
              : {}),
          },
        }),
      ),
    );

    const updated = await this.prisma.stockTake.findFirst({
      where: { id },
      include: { lines: { include: { product: true } }, branch: true },
    });
    return this.decorateStockTake(updated!);
  }

  /** Scan barcode/SKU — increment counted qty by 1 (or set if first count). */
  async scanStockTakeCount(
    tenantId: string,
    id: string,
    code: string,
    opts: { increment?: number } = {},
  ) {
    const take = await this.prisma.stockTake.findFirst({
      where: { id, tenantId, status: 'OPEN' },
      include: { lines: { include: { product: true } }, branch: true },
    });
    if (!take) throw new NotFoundException('Open stock take not found');
    const q = code.trim();
    if (!q) throw new BadRequestException('Scan code required');

    const line = take.lines.find(
      (l) =>
        l.product.barcode === q ||
        l.product.sku.toLowerCase() === q.toLowerCase() ||
        l.product.id === q,
    );
    if (!line) {
      throw new NotFoundException(`No line for barcode/SKU “${q}” in this stock take`);
    }

    const inc = opts.increment && opts.increment > 0 ? opts.increment : 1;
    const next = (line.countedQty != null ? Number(line.countedQty) : 0) + inc;
    await this.prisma.stockTakeLine.update({
      where: { id: line.id },
      data: { countedQty: next },
    });

    const updated = await this.prisma.stockTake.findFirst({
      where: { id },
      include: { lines: { include: { product: true } }, branch: true },
    });
    return {
      ...this.decorateStockTake(updated!),
      scannedLineId: line.id,
      scannedCountedQty: next,
      productName: line.product.name,
    };
  }

  /**
   * Submit counts. If any variance, move to PENDING_APPROVAL (unless forceComplete).
   * Zero-variance sessions complete immediately.
   */
  async completeStockTake(
    tenantId: string,
    id: string,
    opts: { forceComplete?: boolean; approvedByUserId?: string } = {},
  ) {
    const take = await this.prisma.stockTake.findFirst({
      where: { id, tenantId },
      include: { lines: true },
    });
    if (!take) throw new NotFoundException('Stock take not found');
    if (take.status !== 'OPEN' && take.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException('Stock take is not open');
    }

    const uncounted = take.lines.filter((l) => l.countedQty == null);
    if (uncounted.length) {
      throw new BadRequestException(
        `${uncounted.length} line(s) still uncounted. Save counts for every product before completing.`,
      );
    }

    const varianceLines = take.lines.filter(
      (l) => Math.abs(Number(l.countedQty) - Number(l.systemQty)) >= 0.001,
    );
    const missingReasons = varianceLines.filter((l) => !l.varianceReason?.trim());
    if (missingReasons.length) {
      throw new BadRequestException(
        `${missingReasons.length} variance line(s) need a reason (shrink / damage / found / recount / other).`,
      );
    }

    if (varianceLines.length && take.status === 'OPEN' && !opts.forceComplete) {
      const pending = await this.prisma.stockTake.update({
        where: { id },
        data: { status: 'PENDING_APPROVAL' },
        include: { lines: { include: { product: true } }, branch: true },
      });
      return this.decorateStockTake(pending);
    }

    return this.applyStockTakeAdjustments(tenantId, id, opts.approvedByUserId);
  }

  async approveStockTake(tenantId: string, id: string, approvedByUserId?: string) {
    const take = await this.prisma.stockTake.findFirst({ where: { id, tenantId } });
    if (!take) throw new NotFoundException('Stock take not found');
    if (take.status !== 'PENDING_APPROVAL' && take.status !== 'OPEN') {
      throw new BadRequestException('Only pending or open stock takes can be approved');
    }
    return this.completeStockTake(tenantId, id, { forceComplete: true, approvedByUserId });
  }

  private async applyStockTakeAdjustments(
    tenantId: string,
    id: string,
    approvedByUserId?: string,
  ) {
    const take = await this.prisma.stockTake.findFirst({
      where: { id, tenantId },
      include: { lines: true },
    });
    if (!take) throw new NotFoundException('Stock take not found');

    return this.prisma.$transaction(async (tx) => {
      for (const line of take.lines) {
        const counted = Number(line.countedQty);
        const variance = counted - Number(line.systemQty);
        if (Math.abs(variance) < 0.001) {
          await tx.product.update({
            where: { id: line.productId },
            data: { lastCountedAt: new Date() },
          });
          continue;
        }

        await tx.product.update({
          where: { id: line.productId },
          data: { stockQty: counted, lastCountedAt: new Date() },
        });

        const branchStock = await tx.branchStock.findUnique({
          where: {
            branchId_productId: { branchId: take.branchId, productId: line.productId },
          },
        });
        if (branchStock) {
          await tx.branchStock.update({
            where: { id: branchStock.id },
            data: { quantity: counted },
          });
        } else {
          await tx.branchStock.create({
            data: {
              tenantId,
              branchId: take.branchId,
              productId: line.productId,
              quantity: counted,
            },
          });
        }

        const reason = line.varianceReason?.trim() || 'unspecified';
        await tx.stockLedger.create({
          data: {
            tenantId,
            productId: line.productId,
            type: 'ADJUSTMENT',
            quantity: variance,
            referenceId: take.id,
            notes: `Stock take variance (${reason})`,
          },
        });
      }

      const done = await tx.stockTake.update({
        where: { id },
        data: {
          status: 'COMPLETED',
          completedAt: new Date(),
          approvedAt: new Date(),
          approvedByUserId: approvedByUserId || null,
        },
        include: { lines: { include: { product: true } }, branch: true },
      });
      return this.decorateStockTake(done);
    });
  }

  async cancelStockTake(tenantId: string, id: string) {
    const take = await this.prisma.stockTake.findFirst({ where: { id, tenantId } });
    if (!take) throw new NotFoundException('Stock take not found');
    if (take.status !== 'OPEN' && take.status !== 'PENDING_APPROVAL') {
      throw new BadRequestException('Only open or pending stock takes can be cancelled');
    }
    const updated = await this.prisma.stockTake.update({
      where: { id },
      data: { status: 'CANCELLED' },
      include: { lines: { include: { product: true } }, branch: true },
    });
    return this.decorateStockTake(updated);
  }

  /** Product IDs due for ABC cycle count (A=7d, B=30d, C=90d). */
  async getAbcCyclePlan(tenantId: string) {
    const products = await this.prisma.product.findMany({
      where: { tenantId, isActive: true },
      select: {
        id: true,
        name: true,
        sku: true,
        category: true,
        abcGrade: true,
        lastCountedAt: true,
        stockQty: true,
      },
      take: 2000,
    });
    const now = Date.now();
    const cadence: Record<string, number> = { A: 7, B: 30, C: 90 };
    const due: typeof products = [];
    const byGrade = { A: [] as string[], B: [] as string[], C: [] as string[], NONE: [] as string[] };
    for (const p of products) {
      const grade = (p.abcGrade || 'NONE').toUpperCase();
      const days = cadence[grade] ?? 90;
      const last = p.lastCountedAt ? p.lastCountedAt.getTime() : 0;
      const overdue = !last || now - last > days * 86400000;
      if (grade === 'A' || grade === 'B' || grade === 'C') {
        byGrade[grade as 'A' | 'B' | 'C'].push(p.id);
      } else {
        byGrade.NONE.push(p.id);
      }
      if (overdue) due.push(p);
    }
    return {
      cadenceDays: cadence,
      dueCount: due.length,
      due,
      productIdsByGrade: byGrade,
    };
  }

  async getPurchaseRegister(
    tenantId: string,
    opts: { dateFrom?: Date; dateTo?: Date } = {},
  ) {
    const bills = await this.prisma.purchaseBill.findMany({
      where: {
        tenantId,
        status: { not: 'CANCELLED' },
        ...(opts.dateFrom || opts.dateTo
          ? {
              invoiceDate: {
                ...(opts.dateFrom ? { gte: opts.dateFrom } : {}),
                ...(opts.dateTo ? { lte: opts.dateTo } : {}),
              },
            }
          : {}),
      },
      include: { supplier: { select: { id: true, name: true, gstin: true, isMsme: true } } },
      orderBy: [{ invoiceDate: 'desc' }, { createdAt: 'desc' }],
      take: 500,
    });
    const rows = bills.map((b) => ({
      id: b.id,
      invoiceNumber: b.invoiceNumber,
      invoiceDate: b.invoiceDate,
      supplierId: b.supplierId,
      supplierName: b.supplier?.name || b.supplierName,
      gstin: b.supplier?.gstin || b.gstin,
      isMsme: b.supplier?.isMsme ?? false,
      status: b.status,
      taxableValue: Number(b.subtotal),
      cgst: Number(b.cgstAmount),
      sgst: Number(b.sgstAmount),
      igst: Number(b.igstAmount),
      taxAmount: Number(b.taxAmount),
      totalAmount: Number(b.totalAmount),
    }));
    const totals = rows.reduce(
      (acc, r) => {
        acc.taxable += r.taxableValue;
        acc.cgst += r.cgst;
        acc.sgst += r.sgst;
        acc.igst += r.igst;
        acc.total += r.totalAmount;
        return acc;
      },
      { taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 },
    );
    return { rows, totals, count: rows.length };
  }

  async postDraftPurchaseBill(tenantId: string, billId: string, invoiceNumber?: string) {
    const bill = await this.prisma.purchaseBill.findFirst({
      where: { id: billId, tenantId },
      include: { lines: true },
    });
    if (!bill) throw new NotFoundException('Purchase bill not found');
    if (bill.status !== 'DRAFT') throw new BadRequestException('Only DRAFT bills can be posted');

    const newNumber = invoiceNumber?.trim() || bill.invoiceNumber.replace(/^DRAFT-/, '');
    if (newNumber !== bill.invoiceNumber) {
      const clash = await this.prisma.purchaseBill.findUnique({
        where: { tenantId_invoiceNumber: { tenantId, invoiceNumber: newNumber } },
      });
      if (clash) throw new ConflictException(`Invoice ${newNumber} already exists`);
    }

    const total = Number(bill.totalAmount);
    return this.prisma.$transaction(async (tx) => {
      const posted = await tx.purchaseBill.update({
        where: { id: bill.id },
        data: {
          status: 'POSTED',
          invoiceNumber: newNumber,
        },
        include: { lines: true, supplier: true },
      });
      if (bill.supplierId && total > 0) {
        const supplier = await tx.supplier.update({
          where: { id: bill.supplierId },
          data: { outstandingBalance: { increment: total } },
        });
        await tx.supplierLedgerEntry.create({
          data: {
            tenantId,
            supplierId: bill.supplierId,
            type: 'BILL',
            amount: total,
            balanceAfter: supplier.outstandingBalance,
            billId: bill.id,
            notes: `Posted draft ${newNumber}`,
          },
        });
      }
      return this.decorateBill(posted);
    });
  }

  // ─── Purchase bills (supplier invoice → many products) ───────────

  async listPurchaseBills(
    tenantId: string,
    filters: {
      supplierId?: string;
      supplierName?: string;
      /** Free-text: invoice #, GSTIN, IRN, supplier name, notes, place of supply */
      search?: string;
      dateFrom?: Date;
      dateTo?: Date;
      createdByUserId?: string;
      status?: string;
      includeCancelled?: boolean;
      unpaidOnly?: boolean;
      agingBucket?: string;
    } = {},
  ) {
    const and: Array<Record<string, unknown>> = [{ tenantId }];

    if (filters.supplierId) and.push({ supplierId: filters.supplierId });

    const supplierQuery = filters.supplierName?.trim();
    if (supplierQuery && !filters.supplierId) {
      and.push({
        OR: [
          { supplierName: { contains: supplierQuery, mode: 'insensitive' } },
          { supplier: { name: { contains: supplierQuery, mode: 'insensitive' } } },
        ],
      });
    }

    const search = filters.search?.trim();
    if (search) {
      and.push({
        OR: [
          { invoiceNumber: { contains: search, mode: 'insensitive' } },
          { gstin: { contains: search, mode: 'insensitive' } },
          { irn: { contains: search, mode: 'insensitive' } },
          { placeOfSupply: { contains: search, mode: 'insensitive' } },
          { notes: { contains: search, mode: 'insensitive' } },
          { supplierName: { contains: search, mode: 'insensitive' } },
          { billImageName: { contains: search, mode: 'insensitive' } },
          { supplier: { name: { contains: search, mode: 'insensitive' } } },
          { supplier: { gstin: { contains: search, mode: 'insensitive' } } },
          { supplier: { phone: { contains: search, mode: 'insensitive' } } },
          { lines: { some: { productName: { contains: search, mode: 'insensitive' } } } },
          { lines: { some: { sku: { contains: search, mode: 'insensitive' } } } },
          { lines: { some: { hsnCode: { contains: search, mode: 'insensitive' } } } },
        ],
      });
    }

    if (filters.createdByUserId) and.push({ createdByUserId: filters.createdByUserId });

    if (filters.status) {
      and.push({ status: filters.status });
    } else if (!filters.includeCancelled) {
      and.push({ status: { not: 'CANCELLED' } });
    }

    if (filters.unpaidOnly) {
      and.push({ status: { in: ['POSTED', 'PARTIALLY_PAID', 'DRAFT'] } });
    }

    if (filters.dateFrom || filters.dateTo) {
      const invoiceRange: Record<string, Date> = {};
      const createdRange: Record<string, Date> = {};
      if (filters.dateFrom) {
        invoiceRange.gte = filters.dateFrom;
        createdRange.gte = filters.dateFrom;
      }
      if (filters.dateTo) {
        invoiceRange.lte = filters.dateTo;
        createdRange.lte = filters.dateTo;
      }
      and.push({
        OR: [
          { invoiceDate: { not: null, ...invoiceRange } },
          { invoiceDate: null, createdAt: createdRange },
        ],
      });
    }

    const rows = await this.prisma.purchaseBill.findMany({
      where: { AND: and },
      orderBy: [{ invoiceDate: 'desc' }, { createdAt: 'desc' }],
      include: {
        supplier: { select: { id: true, name: true, gstin: true, phone: true } },
        createdBy: { select: { id: true, name: true, email: true } },
        lines: {
          include: { product: { select: { id: true, sku: true, name: true, barcode: true } } },
        },
        _count: { select: { lines: true, allocations: true } },
      },
      take: 200,
    });

    let decorated = rows.map((b) => this.decorateBill(b));
    if (filters.agingBucket) {
      const bucket = filters.agingBucket.toUpperCase();
      decorated = decorated.filter((b) => b.agingBucket === bucket);
    }

    const summary = {
      billCount: decorated.length,
      unpaidCount: decorated.filter((b) => b.dueAmount > 0.009).length,
      overdueCount: decorated.filter((b) => b.overdueDays > 0).length,
      totalBilled: this.round2(decorated.reduce((s, b) => s + Number(b.totalAmount), 0)),
      totalPaid: this.round2(decorated.reduce((s, b) => s + Number(b.paidAmount), 0)),
      totalDue: this.round2(decorated.reduce((s, b) => s + b.dueAmount, 0)),
      taxTotal: this.round2(decorated.reduce((s, b) => s + Number(b.taxAmount), 0)),
      aging: {
        current: this.round2(
          decorated.filter((b) => b.agingBucket === 'CURRENT').reduce((s, b) => s + b.dueAmount, 0),
        ),
        days30: this.round2(
          decorated.filter((b) => b.agingBucket === 'DUE_0_30').reduce((s, b) => s + b.dueAmount, 0),
        ),
        days60: this.round2(
          decorated.filter((b) => b.agingBucket === 'DUE_31_60').reduce((s, b) => s + b.dueAmount, 0),
        ),
        days90: this.round2(
          decorated.filter((b) => b.agingBucket === 'DUE_61_90').reduce((s, b) => s + b.dueAmount, 0),
        ),
        days90plus: this.round2(
          decorated
            .filter((b) => b.agingBucket === 'DUE_90_PLUS')
            .reduce((s, b) => s + b.dueAmount, 0),
        ),
      },
    };

    return { items: decorated, summary };
  }

  async getPurchaseBill(tenantId: string, id: string) {
    const bill = await this.prisma.purchaseBill.findFirst({
      where: { id, tenantId },
      include: {
        supplier: true,
        createdBy: { select: { id: true, name: true, email: true } },
        lines: { include: { product: true } },
        allocations: {
          include: { payment: true },
        },
        ledgerEntries: { orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }] },
      },
    });
    if (!bill) throw new NotFoundException('Purchase bill not found');

    let meta: Record<string, unknown> | null = null;
    if (bill.notes) {
      try {
        const parsed = JSON.parse(bill.notes);
        if (parsed && typeof parsed === 'object') meta = parsed as Record<string, unknown>;
      } catch {
        meta = null;
      }
    }

    return {
      ...this.decorateBill(bill),
      meta,
      freeNotes:
        meta && typeof meta.notes === 'string'
          ? meta.notes
          : meta
            ? null
            : bill.notes,
    };
  }

  /** Payables aging — unpaid purchase bills by due/invoice age */
  async getSupplierAging(tenantId: string, supplierId?: string) {
    const bills = await this.prisma.purchaseBill.findMany({
      where: {
        tenantId,
        status: { in: ['POSTED', 'PARTIALLY_PAID'] },
        ...(supplierId ? { supplierId } : {}),
      },
      include: {
        supplier: {
          select: {
            id: true,
            name: true,
            gstin: true,
            phone: true,
            email: true,
            isMsme: true,
            address: true,
            addressLine2: true,
            city: true,
            pincode: true,
            stateCode: true,
            paymentTermsDays: true,
            bankName: true,
            bankAccount: true,
            ifsc: true,
            advanceBalance: true,
          },
        },
      },
      orderBy: [{ dueDate: 'asc' }, { invoiceDate: 'asc' }],
    });

    const bySupplier = new Map<
      string,
      {
        supplierId: string | null;
        name: string;
        gstin: string | null;
        phone: string | null;
        email: string | null;
        isMsme: boolean;
        address: string | null;
        addressLine2: string | null;
        city: string | null;
        pincode: string | null;
        stateCode: string | null;
        paymentTermsDays: number | null;
        bankName: string | null;
        bankAccount: string | null;
        ifsc: string | null;
        advanceBalance: number;
        outstanding: number;
        billCount: number;
        overdueCount: number;
        /** MSME compliance: dues older than 45 days */
        msmeOver45: number;
        aging: { current: number; days30: number; days60: number; days90: number; days90plus: number };
        bills: Array<ReturnType<InventoryService['decorateBill']>>;
      }
    >();

    for (const bill of bills) {
      const decorated = this.decorateBill(bill);
      if (!(decorated.dueAmount > 0.009)) continue;
      const key = bill.supplierId || bill.supplierName || 'unknown';
      let row = bySupplier.get(key);
      if (!row) {
        row = {
          supplierId: bill.supplierId,
          name: bill.supplier?.name || bill.supplierName || 'Unknown supplier',
          gstin: bill.supplier?.gstin || bill.gstin || null,
          phone: bill.supplier?.phone || null,
          email: bill.supplier?.email || null,
          isMsme: Boolean(bill.supplier?.isMsme),
          address: bill.supplier?.address || null,
          addressLine2: bill.supplier?.addressLine2 || null,
          city: bill.supplier?.city || null,
          pincode: bill.supplier?.pincode || null,
          stateCode: bill.supplier?.stateCode || null,
          paymentTermsDays: bill.supplier?.paymentTermsDays ?? null,
          bankName: bill.supplier?.bankName || null,
          bankAccount: bill.supplier?.bankAccount || null,
          ifsc: bill.supplier?.ifsc || null,
          advanceBalance: Number(bill.supplier?.advanceBalance ?? 0),
          outstanding: 0,
          billCount: 0,
          overdueCount: 0,
          msmeOver45: 0,
          aging: { current: 0, days30: 0, days60: 0, days90: 0, days90plus: 0 },
          bills: [],
        };
        bySupplier.set(key, row);
      }
      row.outstanding = this.round2(row.outstanding + decorated.dueAmount);
      row.billCount += 1;
      if (decorated.overdueDays > 0) row.overdueCount += 1;
      if (row.isMsme && decorated.overdueDays > 45) {
        row.msmeOver45 = this.round2(row.msmeOver45 + decorated.dueAmount);
      }
      row.bills.push(decorated);
      switch (decorated.agingBucket) {
        case 'CURRENT':
          row.aging.current = this.round2(row.aging.current + decorated.dueAmount);
          break;
        case 'DUE_0_30':
          row.aging.days30 = this.round2(row.aging.days30 + decorated.dueAmount);
          break;
        case 'DUE_31_60':
          row.aging.days60 = this.round2(row.aging.days60 + decorated.dueAmount);
          break;
        case 'DUE_61_90':
          row.aging.days90 = this.round2(row.aging.days90 + decorated.dueAmount);
          break;
        case 'DUE_90_PLUS':
          row.aging.days90plus = this.round2(row.aging.days90plus + decorated.dueAmount);
          break;
      }
    }

    return [...bySupplier.values()].sort((a, b) => b.outstanding - a.outstanding);
  }

  /**
   * Void a posted purchase bill carefully:
   * - Blocks when payments are allocated / paidAmount > 0
   * - Reverses stock (and excess IN_STOCK serials)
   * - Reverses unpaid supplier payable via ADJUSTMENT ledger
   * - Soft-cancels bill (frees invoice number for re-entry)
   */
  async voidPurchaseBill(tenantId: string, id: string, reason?: string) {
    const bill = await this.getPurchaseBill(tenantId, id);
    if (bill.status === 'CANCELLED') {
      throw new BadRequestException('Purchase bill is already voided');
    }
    // Only active (POSTED) allocations block voiding
    const activeAllocs = (bill.allocations ?? []).filter((a: { payment?: { status?: string } }) => {
      const st = a.payment?.status;
      return !st || st === 'POSTED';
    });
    if (Number(bill.paidAmount) > 0 || activeAllocs.length > 0) {
      throw new BadRequestException(
        'Cannot void: this bill has payments. Void or bounce payments on the supplier page first.',
      );
    }

    const reasonText = reason?.trim() || 'Mistaken purchase / stock-in';
    const unpaid = Math.max(0, Number(bill.totalAmount) - Number(bill.paidAmount));

    for (const line of bill.lines) {
      if (!line.productId) continue;
      const qty = Number(line.quantity);
      if (!(qty > 0)) continue;
      const product = await this.prisma.product.findFirst({
        where: { id: line.productId, tenantId },
      });
      if (!product) continue;
      if (Number(product.stockQty) + 1e-9 < qty) {
        throw new BadRequestException(
          `Cannot void: "${product.name}" has stock ${Number(product.stockQty)} but bill line needs ${qty} reversed (some may already be sold). Adjust stock or sell/return first.`,
        );
      }
    }

    return this.prisma.$transaction(async (tx) => {
      for (const line of bill.lines) {
        if (!line.productId) continue;
        const qty = Number(line.quantity);
        if (!(qty > 0)) continue;

        const product = await tx.product.update({
          where: { id: line.productId },
          data: { stockQty: { decrement: qty } },
        });

        // Keep branch stock in sync
        const branchStock = await tx.branchStock.findFirst({
          where: { tenantId, productId: line.productId },
        });
        if (branchStock) {
          const nextQty = Math.max(0, Number(branchStock.quantity) - qty);
          await tx.branchStock.update({
            where: { id: branchStock.id },
            data: { quantity: nextQty },
          });
        }

        await tx.stockLedger.create({
          data: {
            tenantId,
            productId: line.productId,
            type: 'ADJUSTMENT',
            quantity: -qty,
            referenceId: bill.id,
            notes: `Void purchase bill ${bill.invoiceNumber} · ${reasonText}`,
          },
        });

        if (product.trackSerial) {
          const serials = await tx.productSerial.findMany({
            where: { productId: line.productId, status: 'IN_STOCK' },
            orderBy: { createdAt: 'desc' },
            take: Math.ceil(qty),
          });
          if (serials.length) {
            await tx.productSerial.deleteMany({
              where: { id: { in: serials.map((s) => s.id) } },
            });
          }
        }
      }

      if (bill.supplierId && unpaid > 0) {
        const supplier = await tx.supplier.update({
          where: { id: bill.supplierId },
          data: { outstandingBalance: { decrement: unpaid } },
        });
        await tx.supplierLedgerEntry.create({
          data: {
            tenantId,
            supplierId: bill.supplierId,
            type: 'ADJUSTMENT',
            amount: unpaid,
            balanceAfter: Number(supplier.outstandingBalance),
            billId: bill.id,
            notes: `Void purchase bill ${bill.invoiceNumber} · ${reasonText}`,
            entryDate: new Date(),
          },
        });
      }

      const freedNumber = `${bill.invoiceNumber}__VOID__${Date.now().toString(36)}`;
      return tx.purchaseBill.update({
        where: { id: bill.id },
        data: {
          status: 'CANCELLED',
          invoiceNumber: freedNumber.slice(0, 120),
          notes: [bill.notes, `VOIDED: ${reasonText}`].filter(Boolean).join('\n'),
        },
        include: {
          supplier: true,
          lines: { include: { product: { select: { id: true, sku: true, name: true } } } },
        },
      });
    });
  }

  async archiveSupplier(tenantId: string, id: string) {
    const supplier = await this.prisma.supplier.findFirst({ where: { id, tenantId } });
    if (!supplier) throw new NotFoundException('Supplier not found');
    if (!supplier.isActive) return supplier;

    const openBills = await this.prisma.purchaseBill.count({
      where: {
        tenantId,
        supplierId: id,
        status: { in: ['POSTED', 'PARTIALLY_PAID', 'DRAFT'] },
      },
    });
    if (openBills > 0) {
      throw new BadRequestException(
        `Cannot archive: ${openBills} open purchase bill(s). Void or pay them first.`,
      );
    }
    if (Math.abs(Number(supplier.outstandingBalance)) > 0.009) {
      throw new BadRequestException(
        `Cannot archive: outstanding balance is ₹${Number(supplier.outstandingBalance).toFixed(2)}. Clear khata first.`,
      );
    }

    return this.prisma.supplier.update({
      where: { id },
      data: { isActive: false, archivedAt: new Date(), purgedAt: null },
    });
  }

  async restoreSupplier(tenantId: string, id: string) {
    const supplier = await this.prisma.supplier.findFirst({ where: { id, tenantId } });
    if (!supplier) throw new NotFoundException('Supplier not found');
    if (supplier.isActive) return supplier;
    if (supplier.purgedAt) {
      throw new BadRequestException('This supplier was permanently removed from archive and cannot be restored');
    }
    return this.prisma.supplier.update({
      where: { id },
      data: { isActive: true, archivedAt: null, purgedAt: null },
    });
  }

  /**
   * Daily job: drop archived suppliers older than retentionDays from Corrections.
   * Keeps khata history (never hard-deletes suppliers with bills/ledger); marks purgedAt instead.
   */
  async purgeExpiredArchivedSuppliers(retentionDays = 30) {
    const days = Math.max(1, retentionDays);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const candidates = await this.prisma.supplier.findMany({
      where: {
        isActive: false,
        purgedAt: null,
        OR: [
          { archivedAt: { lte: cutoff } },
          { archivedAt: null, updatedAt: { lte: cutoff } },
        ],
      },
      select: { id: true, name: true },
      take: 500,
    });

    let purged = 0;
    for (const s of candidates) {
      await this.prisma.supplier.update({
        where: { id: s.id },
        data: { purgedAt: new Date() },
      });
      purged += 1;
    }
    return { scanned: candidates.length, purged, retentionDays: days };
  }

  /**
   * Lookup active purchase bill by invoice # (blocks accidental duplicate stock-in).
   */
  async checkPurchaseInvoice(tenantId: string, invoiceNumber: string) {
    const key = invoiceNumber.trim();
    if (!key) throw new BadRequestException('Invoice number required');
    const bill = await this.prisma.purchaseBill.findFirst({
      where: {
        tenantId,
        invoiceNumber: key,
        status: { not: 'CANCELLED' },
      },
      select: {
        id: true,
        invoiceNumber: true,
        invoiceDate: true,
        supplierName: true,
        supplierId: true,
        status: true,
        totalAmount: true,
        paidAmount: true,
        createdAt: true,
        supplier: { select: { id: true, name: true } },
        _count: { select: { lines: true } },
      },
    });
    if (!bill) {
      return { exists: false as const, invoiceNumber: key };
    }
    return {
      exists: true as const,
      invoiceNumber: key,
      bill: {
        ...bill,
        totalAmount: Number(bill.totalAmount),
        paidAmount: Number(bill.paidAmount),
        dueAmount: Math.max(0, Number(bill.totalAmount) - Number(bill.paidAmount)),
      },
      message: `Invoice ${key} already exists (${bill.status}). Change the invoice number, void the old bill in Corrections, or explicitly append lines.`,
    };
  }

  /**
   * Create or append a purchase bill when stocking from a supplier invoice.
   * Same invoiceNumber groups products only when allowAppend=true.
   * Default: reject duplicates so the same supplier invoice is not posted twice.
   */
  async upsertPurchaseBillFromStockIn(
    tenantId: string,
    data: {
      supplierId?: string;
      supplierName?: string;
      supplierPhone?: string;
      supplierAddress?: string;
      bankName?: string;
      bankAccount?: string;
      ifsc?: string;
      bankBranch?: string;
      createdByUserId?: string;
      invoiceNumber: string;
      invoiceDate?: Date | null;
      dueDate?: Date | null;
      paymentTermsDays?: number;
      gstin?: string;
      placeOfSupply?: string;
      irn?: string;
      uploadId?: string;
      billImagePath?: string;
      billImageName?: string;
      billImageMime?: string;
      notes?: string;
      taxableValue?: number;
      taxAmount?: number;
      cgstAmount?: number;
      sgstAmount?: number;
      igstAmount?: number;
      totalAmount?: number;
      /** When false (default), refuse if an active bill already has this invoice #. */
      allowAppend?: boolean;
      /** DRAFT skips AP ledger until posted. */
      status?: 'DRAFT' | 'POSTED';
      lines: Array<{
        productId?: string;
        productName: string;
        sku?: string;
        quantity: number;
        unitCost: number;
        hsnCode?: string;
        gstRate?: number;
      }>;
    },
  ) {
    const invoiceNumber = data.invoiceNumber.trim();
    if (!invoiceNumber) throw new BadRequestException('Invoice number required for purchase bill');

    const ensured = await this.ensureSupplierFromInvoice(tenantId, {
      supplierId: data.supplierId,
      name: data.supplierName,
      gstin: data.gstin,
      phone: data.supplierPhone,
      address: data.supplierAddress,
      bankName: data.bankName,
      bankAccount: data.bankAccount,
      ifsc: data.ifsc,
      bankBranch: data.bankBranch,
    });
    const supplierId = ensured?.id ?? data.supplierId;

    const lineRows = data.lines.map((l) => {
      const qty = Number(l.quantity);
      const unit = Number(l.unitCost || 0);
      return {
        productId: l.productId,
        productName: l.productName,
        sku: l.sku,
        quantity: qty,
        unitCost: unit,
        lineTotal: this.round2(qty * unit),
        hsnCode: l.hsnCode,
        gstRate: l.gstRate,
      };
    });
    const addSubtotal = this.round2(lineRows.reduce((s, l) => s + Number(l.lineTotal), 0));
    const addTaxFromRates = this.round2(
      lineRows.reduce((s, l) => {
        const rate = Number(l.gstRate || 0);
        return rate > 0 ? s + Number(l.lineTotal) * (rate / 100) : s;
      }, 0),
    );

    const cgst = data.cgstAmount != null && Number.isFinite(data.cgstAmount) ? Number(data.cgstAmount) : 0;
    const sgst = data.sgstAmount != null && Number.isFinite(data.sgstAmount) ? Number(data.sgstAmount) : 0;
    const igst = data.igstAmount != null && Number.isFinite(data.igstAmount) ? Number(data.igstAmount) : 0;
    const taxFromParts = this.round2(cgst + sgst + igst);
    const billTax =
      data.taxAmount != null && Number.isFinite(data.taxAmount)
        ? Number(data.taxAmount)
        : taxFromParts || addTaxFromRates;
    const billSubtotal =
      data.taxableValue != null && Number.isFinite(data.taxableValue) && data.taxableValue > 0
        ? Number(data.taxableValue)
        : addSubtotal;
    const billTotal =
      data.totalAmount != null && Number.isFinite(data.totalAmount) && data.totalAmount > 0
        ? Number(data.totalAmount)
        : this.round2(billSubtotal + billTax);
    const payableIncrement = billTotal > 0 ? billTotal : addSubtotal;
    const terms = data.paymentTermsDays && data.paymentTermsDays > 0 ? data.paymentTermsDays : 30;
    const invoiceDate = data.invoiceDate ?? null;
    const dueDate = this.resolveDueDate(invoiceDate, terms, data.dueDate);
    const allowAppend = Boolean(data.allowAppend);
    const billStatus = data.status === 'DRAFT' ? 'DRAFT' : 'POSTED';

    return this.prisma.$transaction(async (tx) => {
      let bill = await tx.purchaseBill.findUnique({
        where: { tenantId_invoiceNumber: { tenantId, invoiceNumber } },
      });

      if (bill && bill.status === 'CANCELLED') {
        // Invoice # was freed via void rename — treat as new create path below
        bill = null;
      } else if (bill && !allowAppend) {
        throw new ConflictException(
          `Duplicate invoice ${invoiceNumber}: already posted as ${bill.status}. ` +
            `Open the existing purchase bill, void it in Corrections if it was a mistake, ` +
            `or confirm again with appendToExistingBill=true to add more lines.`,
        );
      }

      if (!bill) {
        bill = await tx.purchaseBill.create({
          data: {
            tenantId,
            supplierId,
            supplierName: data.supplierName ?? ensured?.name,
            invoiceNumber,
            invoiceDate: invoiceDate ?? undefined,
            dueDate,
            paymentTermsDays: terms,
            gstin: data.gstin ?? ensured?.gstin,
            placeOfSupply: data.placeOfSupply,
            irn: data.irn,
            uploadId: data.uploadId,
            billImagePath: data.billImagePath,
            billImageName: data.billImageName,
            billImageMime: data.billImageMime,
            subtotal: billSubtotal,
            taxAmount: billTax,
            cgstAmount: cgst,
            sgstAmount: sgst,
            igstAmount: igst,
            totalAmount: billTotal,
            paidAmount: 0,
            status: billStatus,
            notes: data.notes,
            createdByUserId: data.createdByUserId,
            lines: { create: lineRows },
          },
        });

        if (supplierId && billStatus === 'POSTED') {
          const supplier = await tx.supplier.update({
            where: { id: supplierId },
            data: { outstandingBalance: { increment: payableIncrement } },
          });
          await tx.supplierLedgerEntry.create({
            data: {
              tenantId,
              supplierId,
              type: 'BILL',
              amount: payableIncrement,
              balanceAfter: Number(supplier.outstandingBalance),
              billId: bill.id,
              notes: `Purchase bill ${invoiceNumber}`,
              entryDate: invoiceDate ?? new Date(),
            },
          });
        }
      } else {
        for (const row of lineRows) {
          await tx.purchaseBillLine.create({
            data: { billId: bill.id, ...row },
          });
        }

        const addTax = addTaxFromRates > 0 ? addTaxFromRates : 0;
        let nextSubtotal = this.round2(Number(bill.subtotal) + addSubtotal);
        let nextTax = this.round2(Number(bill.taxAmount) + addTax);
        let nextTotal = this.round2(Number(bill.totalAmount) + addSubtotal + addTax);
        let nextCgst = Number(bill.cgstAmount);
        let nextSgst = Number(bill.sgstAmount);
        let nextIgst = Number(bill.igstAmount);

        if (data.totalAmount != null && Number(data.totalAmount) > nextTotal + 0.05) {
          nextTotal = Number(data.totalAmount);
          if (data.taxableValue != null && data.taxableValue > 0) nextSubtotal = Number(data.taxableValue);
          if (data.taxAmount != null) nextTax = Number(data.taxAmount);
          if (cgst || sgst || igst) {
            nextCgst = cgst;
            nextSgst = sgst;
            nextIgst = igst;
          }
        } else if (addTax > 0 && !(cgst || sgst || igst) && Number(bill.igstAmount) <= 0) {
          nextCgst = this.round2(Number(bill.cgstAmount) + addTax / 2);
          nextSgst = this.round2(Number(bill.sgstAmount) + addTax / 2);
        }

        const payableDelta = this.round2(nextTotal - Number(bill.totalAmount));
        const paid = Number(bill.paidAmount);
        bill = await tx.purchaseBill.update({
          where: { id: bill.id },
          data: {
            subtotal: nextSubtotal,
            taxAmount: nextTax,
            cgstAmount: nextCgst,
            sgstAmount: nextSgst,
            igstAmount: nextIgst,
            totalAmount: nextTotal,
            supplierId: bill.supplierId ?? supplierId,
            supplierName: bill.supplierName ?? data.supplierName ?? ensured?.name,
            gstin: bill.gstin ?? data.gstin ?? ensured?.gstin,
            placeOfSupply: bill.placeOfSupply ?? data.placeOfSupply,
            irn: bill.irn ?? data.irn,
            dueDate: bill.dueDate ?? dueDate,
            invoiceDate: bill.invoiceDate ?? invoiceDate ?? undefined,
            uploadId: bill.uploadId ?? data.uploadId,
            billImagePath: bill.billImagePath ?? data.billImagePath,
            billImageName: bill.billImageName ?? data.billImageName,
            billImageMime: bill.billImageMime ?? data.billImageMime,
            notes: bill.notes ?? data.notes,
            status:
              paid <= 0 ? 'POSTED' : paid + 0.001 >= nextTotal ? 'PAID' : 'PARTIALLY_PAID',
          },
        });

        if ((supplierId || bill.supplierId) && payableDelta > 0.009) {
          const sid = (supplierId ?? bill.supplierId)!;
          const supplier = await tx.supplier.update({
            where: { id: sid },
            data: { outstandingBalance: { increment: payableDelta } },
          });
          await tx.supplierLedgerEntry.create({
            data: {
              tenantId,
              supplierId: sid,
              type: 'BILL',
              amount: payableDelta,
              balanceAfter: Number(supplier.outstandingBalance),
              billId: bill.id,
              notes: `Added lines to bill ${invoiceNumber}`,
              entryDate: invoiceDate ?? new Date(),
            },
          });
        }
      }

      return tx.purchaseBill.findUnique({
        where: { id: bill.id },
        include: { lines: true, supplier: true },
      });
    });
  }

  async attachBillImage(
    tenantId: string,
    billId: string,
    file: { path: string; originalname: string; mimetype?: string },
  ) {
    const bill = await this.prisma.purchaseBill.findFirst({ where: { id: billId, tenantId } });
    if (!bill) throw new NotFoundException('Purchase bill not found');
    return this.prisma.purchaseBill.update({
      where: { id: billId },
      data: {
        billImagePath: file.path,
        billImageName: file.originalname,
        billImageMime: file.mimetype,
      },
    });
  }

  // ─── Supplier ledger & payments ─────────────────────────────────

  async getSupplierDetail(tenantId: string, id: string) {
    const supplier = await this.prisma.supplier.findFirst({ where: { id, tenantId } });
    if (!supplier) throw new NotFoundException('Supplier not found');
    const [bills, payments, ledger, billAgg, paymentAgg, reminders] = await Promise.all([
      this.prisma.purchaseBill.findMany({
        where: { tenantId, supplierId: id },
        orderBy: { createdAt: 'desc' },
        include: { lines: true, _count: { select: { lines: true } } },
        take: 50,
      }),
      this.prisma.supplierPayment.findMany({
        where: { tenantId, supplierId: id },
        orderBy: { paymentDate: 'desc' },
        include: { allocations: { include: { bill: true } } },
        take: 50,
      }),
      this.prisma.supplierLedgerEntry.findMany({
        where: { tenantId, supplierId: id },
        orderBy: [{ entryDate: 'desc' }, { createdAt: 'desc' }],
        include: { bill: true, payment: true },
        take: 100,
      }),
      this.prisma.purchaseBill.findMany({
        where: { tenantId, supplierId: id, status: { not: 'CANCELLED' } },
        select: { totalAmount: true, paidAmount: true, status: true },
      }),
      this.prisma.supplierPayment.aggregate({
        where: { tenantId, supplierId: id, status: 'POSTED' },
        _sum: { amount: true },
        _count: true,
      }),
      this.prisma.partyReminderLog.findMany({
        where: { tenantId, partyType: 'SUPPLIER', partyId: id },
        orderBy: { createdAt: 'desc' },
        include: { createdBy: { select: { id: true, name: true } } },
        take: 20,
      }),
    ]);

    const totalBilled = billAgg.reduce((sum, b) => sum + Number(b.totalAmount), 0);
    const clearedPayments = Number(paymentAgg._sum.amount ?? 0);
    const pendingPayable = Number(supplier.outstandingBalance);
    const openBillCount = billAgg.filter(
      (b) => b.status === 'POSTED' || b.status === 'PARTIALLY_PAID',
    ).length;
    const paidBillCount = billAgg.filter((b) => b.status === 'PAID').length;

    return {
      supplier,
      bills: bills.map((b) => this.decorateBill(b)),
      payments,
      ledger,
      reminders,
      summary: {
        pendingPayable,
        advanceBalance: Number(supplier.advanceBalance),
        clearedPayments,
        totalBilled,
        openBillCount,
        paidBillCount,
        billCount: billAgg.length,
        paymentCount: paymentAgg._count,
      },
    };
  }

  async recordSupplierPayment(
    tenantId: string,
    data: {
      supplierId: string;
      amount: number;
      tdsAmount?: number;
      method?: string;
      paymentDate?: string;
      referenceNo?: string;
      bankName?: string;
      notes?: string;
      attachmentPath?: string;
      attachmentName?: string;
      attachmentMime?: string;
      allocations?: Array<{ billId: string; amount: number }>;
    },
  ) {
    const amount = Number(data.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Payment amount must be positive');
    }
    const tdsAmount = Math.max(0, Number(data.tdsAmount) || 0);
    /** Dues cleared toward bills = cash + TDS */
    const settleBudget = this.round2(amount + tdsAmount);

    const supplier = await this.prisma.supplier.findFirst({
      where: { id: data.supplierId, tenantId },
    });
    if (!supplier) throw new NotFoundException('Supplier not found');

    const method = (data.method || 'CASH') as
      | 'CASH'
      | 'UPI'
      | 'NEFT'
      | 'RTGS'
      | 'CHEQUE'
      | 'BANK_TRANSFER'
      | 'OTHER';
    const paymentDate = data.paymentDate ? new Date(data.paymentDate) : new Date();

    const created = await this.prisma.$transaction(async (tx) => {
      const payment = await tx.supplierPayment.create({
        data: {
          tenantId,
          supplierId: data.supplierId,
          amount,
          tdsAmount,
          method,
          status: 'POSTED',
          paymentDate,
          referenceNo: data.referenceNo,
          bankName: data.bankName,
          notes: data.notes,
          attachmentPath: data.attachmentPath,
          attachmentName: data.attachmentName,
          attachmentMime: data.attachmentMime,
        },
      });

      let remaining = settleBudget;
      const allocations = data.allocations?.length
        ? data.allocations
        : (
            await tx.purchaseBill.findMany({
              where: {
                tenantId,
                supplierId: data.supplierId,
                status: { in: ['POSTED', 'PARTIALLY_PAID'] },
              },
              orderBy: { invoiceDate: 'asc' },
            })
          ).map((b) => ({
            billId: b.id,
            amount: Math.max(0, Number(b.totalAmount) - Number(b.paidAmount)),
          }));

      let allocatedTotal = 0;
      for (const alloc of allocations) {
        if (remaining <= 0.001) break;
        const bill = await tx.purchaseBill.findFirst({
          where: { id: alloc.billId, tenantId, supplierId: data.supplierId },
        });
        if (!bill) continue;
        const due = Number(bill.totalAmount) - Number(bill.paidAmount);
        if (due <= 0) continue;
        const apply = Math.min(remaining, alloc.amount > 0 ? alloc.amount : due, due);
        if (apply <= 0) continue;

        await tx.supplierPaymentAllocation.create({
          data: { paymentId: payment.id, billId: bill.id, amount: apply },
        });
        const newPaid = Number(bill.paidAmount) + apply;
        await tx.purchaseBill.update({
          where: { id: bill.id },
          data: {
            paidAmount: newPaid,
            status:
              newPaid + 0.001 >= Number(bill.totalAmount) ? 'PAID' : 'PARTIALLY_PAID',
          },
        });
        remaining -= apply;
        allocatedTotal = this.round2(allocatedTotal + apply);
      }

      const advanceAmount = this.round2(Math.max(0, remaining));
      if (advanceAmount > 0.001) {
        await tx.supplierPayment.update({
          where: { id: payment.id },
          data: { advanceAmount },
        });
      }

      // Outstanding drops by dues settled (allocated portion of settleBudget).
      // Advance portion also reduces cash payable via advanceBalance (not outstanding).
      const duesCleared = this.round2(allocatedTotal);
      const updated = await tx.supplier.update({
        where: { id: data.supplierId },
        data: {
          outstandingBalance: { decrement: duesCleared },
          ...(advanceAmount > 0.001
            ? { advanceBalance: { increment: advanceAmount } }
            : {}),
        },
      });

      await tx.supplierLedgerEntry.create({
        data: {
          tenantId,
          supplierId: data.supplierId,
          type: 'PAYMENT',
          amount: duesCleared > 0.001 ? duesCleared : amount,
          balanceAfter: Number(updated.outstandingBalance),
          paymentId: payment.id,
          notes: [
            `Payment via ${method}`,
            tdsAmount > 0 ? `TDS ${tdsAmount}` : null,
            data.referenceNo ? `Ref ${data.referenceNo}` : null,
            advanceAmount > 0.001 ? `Advance ${advanceAmount}` : null,
            data.notes,
          ]
            .filter(Boolean)
            .join(' · '),
          entryDate: paymentDate,
        },
      });

      if (advanceAmount > 0.001) {
        await tx.supplierLedgerEntry.create({
          data: {
            tenantId,
            supplierId: data.supplierId,
            type: 'ADVANCE',
            amount: advanceAmount,
            balanceAfter: Number(updated.outstandingBalance),
            paymentId: payment.id,
            notes: 'Unallocated payment held as advance',
            entryDate: paymentDate,
          },
        });
      }

      return tx.supplierPayment.findUnique({
        where: { id: payment.id },
        include: { allocations: { include: { bill: true } }, supplier: true },
      });
    });

    if (created?.id) {
      await this.accounting
        .autoPostSupplierPaymentIfEnabled(tenantId, created.id, amount, {
          description: `Supplier payment ${created.id}${tdsAmount > 0 ? ` (TDS ${tdsAmount})` : ''}`,
        })
        .catch(() => null);
    }
    return created;
  }

  listSupplierPayments(tenantId: string, supplierId?: string) {
    return this.prisma.supplierPayment.findMany({
      where: { tenantId, ...(supplierId ? { supplierId } : {}) },
      orderBy: { paymentDate: 'desc' },
      include: { supplier: true, allocations: { include: { bill: true } } },
      take: 100,
    });
  }

  private async reversePaymentAllocations(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tx: any,
    tenantId: string,
    paymentId: string,
  ) {
    const allocations = await tx.supplierPaymentAllocation.findMany({
      where: { paymentId },
      include: { bill: true },
    });
    let restored = 0;
    for (const alloc of allocations) {
      const bill = alloc.bill;
      if (!bill || bill.tenantId !== tenantId) continue;
      const amt = Number(alloc.amount);
      const newPaid = Math.max(0, Number(bill.paidAmount) - amt);
      await tx.purchaseBill.update({
        where: { id: bill.id },
        data: {
          paidAmount: newPaid,
          status:
            bill.status === 'CANCELLED'
              ? 'CANCELLED'
              : newPaid <= 0.001
                ? 'POSTED'
                : newPaid + 0.001 >= Number(bill.totalAmount)
                  ? 'PAID'
                  : 'PARTIALLY_PAID',
        },
      });
      restored = this.round2(restored + amt);
    }
    await tx.supplierPaymentAllocation.deleteMany({ where: { paymentId } });
    return restored;
  }

  async voidSupplierPayment(tenantId: string, paymentId: string, reason?: string) {
    const payment = await this.prisma.supplierPayment.findFirst({
      where: { id: paymentId, tenantId },
      include: { supplier: true },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status !== 'POSTED') {
      throw new BadRequestException(`Payment is already ${payment.status}`);
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const restored = await this.reversePaymentAllocations(tx, tenantId, paymentId);
      const advance = Number(payment.advanceAmount) || 0;
      const updated = await tx.supplier.update({
        where: { id: payment.supplierId },
        data: {
          outstandingBalance: { increment: restored },
          ...(advance > 0.001 ? { advanceBalance: { decrement: advance } } : {}),
        },
      });
      await tx.supplierPayment.update({
        where: { id: paymentId },
        data: {
          status: 'VOIDED',
          voidedAt: new Date(),
          voidReason: reason?.trim() || null,
          advanceAmount: 0,
        },
      });
      await tx.supplierLedgerEntry.create({
        data: {
          tenantId,
          supplierId: payment.supplierId,
          type: 'PAYMENT_REVERSAL',
          amount: restored > 0.001 ? restored : Number(payment.amount),
          balanceAfter: Number(updated.outstandingBalance),
          paymentId,
          notes: [`Voided payment`, reason?.trim()].filter(Boolean).join(' · '),
          entryDate: new Date(),
        },
      });
      return {
        payment: await tx.supplierPayment.findUnique({
          where: { id: paymentId },
          include: { allocations: true, supplier: true },
        }),
        cashOut: Number(payment.amount),
      };
    });
    await this.accounting
      .reverseSupplierPaymentIfEnabled(tenantId, paymentId, result.cashOut, 'void')
      .catch(() => null);
    return result.payment;
  }

  async bounceSupplierPayment(tenantId: string, paymentId: string, reason?: string) {
    const payment = await this.prisma.supplierPayment.findFirst({
      where: { id: paymentId, tenantId },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status !== 'POSTED') {
      throw new BadRequestException(`Payment is already ${payment.status}`);
    }
    if (payment.method !== 'CHEQUE') {
      throw new BadRequestException('Bounce applies to cheque payments only');
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const restored = await this.reversePaymentAllocations(tx, tenantId, paymentId);
      const advance = Number(payment.advanceAmount) || 0;
      const updated = await tx.supplier.update({
        where: { id: payment.supplierId },
        data: {
          outstandingBalance: { increment: restored },
          ...(advance > 0.001 ? { advanceBalance: { decrement: advance } } : {}),
        },
      });
      await tx.supplierPayment.update({
        where: { id: paymentId },
        data: {
          status: 'BOUNCED',
          bouncedAt: new Date(),
          bounceReason: reason?.trim() || null,
          advanceAmount: 0,
        },
      });
      await tx.supplierLedgerEntry.create({
        data: {
          tenantId,
          supplierId: payment.supplierId,
          type: 'PAYMENT_REVERSAL',
          amount: restored > 0.001 ? restored : Number(payment.amount),
          balanceAfter: Number(updated.outstandingBalance),
          paymentId,
          notes: [`Cheque bounced`, reason?.trim()].filter(Boolean).join(' · '),
          entryDate: new Date(),
        },
      });
      return {
        payment: await tx.supplierPayment.findUnique({
          where: { id: paymentId },
          include: { allocations: true, supplier: true },
        }),
        cashOut: Number(payment.amount),
      };
    });
    await this.accounting
      .reverseSupplierPaymentIfEnabled(tenantId, paymentId, result.cashOut, 'bounce')
      .catch(() => null);
    return result.payment;
  }

  async reallocateSupplierPayment(
    tenantId: string,
    paymentId: string,
    allocations: Array<{ billId: string; amount: number }>,
  ) {
    const payment = await this.prisma.supplierPayment.findFirst({
      where: { id: paymentId, tenantId },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    if (payment.status !== 'POSTED') {
      throw new BadRequestException('Only posted payments can be reallocated');
    }
    const settleBudget = this.round2(Number(payment.amount) + Number(payment.tdsAmount || 0));

    return this.prisma.$transaction(async (tx) => {
      const oldRestored = await this.reversePaymentAllocations(tx, tenantId, paymentId);
      // Temporarily put dues back was already done via reverse; outstanding was not updated.
      // reverse only updates bills — we need outstanding sync:
      await tx.supplier.update({
        where: { id: payment.supplierId },
        data: {
          outstandingBalance: { increment: oldRestored },
          ...(Number(payment.advanceAmount) > 0.001
            ? { advanceBalance: { decrement: Number(payment.advanceAmount) } }
            : {}),
        },
      });

      let remaining = settleBudget;
      let allocatedTotal = 0;
      for (const alloc of allocations) {
        if (remaining <= 0.001) break;
        const bill = await tx.purchaseBill.findFirst({
          where: { id: alloc.billId, tenantId, supplierId: payment.supplierId },
        });
        if (!bill) continue;
        const due = Number(bill.totalAmount) - Number(bill.paidAmount);
        if (due <= 0) continue;
        const apply = Math.min(remaining, alloc.amount > 0 ? alloc.amount : due, due);
        if (apply <= 0) continue;
        await tx.supplierPaymentAllocation.create({
          data: { paymentId, billId: bill.id, amount: apply },
        });
        const newPaid = Number(bill.paidAmount) + apply;
        await tx.purchaseBill.update({
          where: { id: bill.id },
          data: {
            paidAmount: newPaid,
            status: newPaid + 0.001 >= Number(bill.totalAmount) ? 'PAID' : 'PARTIALLY_PAID',
          },
        });
        remaining -= apply;
        allocatedTotal = this.round2(allocatedTotal + apply);
      }

      const advanceAmount = this.round2(Math.max(0, remaining));
      await tx.supplierPayment.update({
        where: { id: paymentId },
        data: { advanceAmount },
      });
      const updated = await tx.supplier.update({
        where: { id: payment.supplierId },
        data: {
          outstandingBalance: { decrement: allocatedTotal },
          ...(advanceAmount > 0.001 ? { advanceBalance: { increment: advanceAmount } } : {}),
        },
      });
      await tx.supplierLedgerEntry.create({
        data: {
          tenantId,
          supplierId: payment.supplierId,
          type: 'ADJUSTMENT',
          amount: 0,
          balanceAfter: Number(updated.outstandingBalance),
          paymentId,
          notes: `Reallocated payment · bills ${allocatedTotal}${advanceAmount > 0 ? ` · advance ${advanceAmount}` : ''}`,
          entryDate: new Date(),
        },
      });

      return tx.supplierPayment.findUnique({
        where: { id: paymentId },
        include: { allocations: { include: { bill: true } }, supplier: true },
      });
    });
  }

  async applySupplierAdvance(
    tenantId: string,
    supplierId: string,
    data: { amount?: number; allocations?: Array<{ billId: string; amount: number }> },
  ) {
    const supplier = await this.prisma.supplier.findFirst({ where: { id: supplierId, tenantId } });
    if (!supplier) throw new NotFoundException('Supplier not found');
    const available = Number(supplier.advanceBalance);
    if (available <= 0.001) throw new BadRequestException('No advance balance');

    const budget = data.amount != null ? Math.min(Number(data.amount), available) : available;
    if (!(budget > 0)) throw new BadRequestException('Invalid advance amount');

    return this.prisma.$transaction(async (tx) => {
      let remaining = budget;
      const targets =
        data.allocations?.length
          ? data.allocations
          : (
              await tx.purchaseBill.findMany({
                where: {
                  tenantId,
                  supplierId,
                  status: { in: ['POSTED', 'PARTIALLY_PAID'] },
                },
                orderBy: { invoiceDate: 'asc' },
              })
            ).map((b) => ({
              billId: b.id,
              amount: Math.max(0, Number(b.totalAmount) - Number(b.paidAmount)),
            }));

      let applied = 0;
      // Synthetic zero-cash payment for allocation trail
      const payment = await tx.supplierPayment.create({
        data: {
          tenantId,
          supplierId,
          amount: 0,
          tdsAmount: 0,
          advanceAmount: 0,
          method: 'OTHER',
          status: 'POSTED',
          paymentDate: new Date(),
          notes: 'Applied from advance balance',
        },
      });

      for (const alloc of targets) {
        if (remaining <= 0.001) break;
        const bill = await tx.purchaseBill.findFirst({
          where: { id: alloc.billId, tenantId, supplierId },
        });
        if (!bill) continue;
        const due = Number(bill.totalAmount) - Number(bill.paidAmount);
        if (due <= 0) continue;
        const apply = Math.min(remaining, alloc.amount > 0 ? alloc.amount : due, due);
        if (apply <= 0) continue;
        await tx.supplierPaymentAllocation.create({
          data: { paymentId: payment.id, billId: bill.id, amount: apply },
        });
        const newPaid = Number(bill.paidAmount) + apply;
        await tx.purchaseBill.update({
          where: { id: bill.id },
          data: {
            paidAmount: newPaid,
            status: newPaid + 0.001 >= Number(bill.totalAmount) ? 'PAID' : 'PARTIALLY_PAID',
          },
        });
        remaining -= apply;
        applied = this.round2(applied + apply);
      }

      if (applied <= 0.001) {
        throw new BadRequestException('No open bills to apply advance');
      }

      await tx.supplierPayment.update({
        where: { id: payment.id },
        data: { amount: applied, notes: `Applied advance ₹${applied}` },
      });

      const updated = await tx.supplier.update({
        where: { id: supplierId },
        data: {
          advanceBalance: { decrement: applied },
          outstandingBalance: { decrement: applied },
        },
      });

      await tx.supplierLedgerEntry.create({
        data: {
          tenantId,
          supplierId,
          type: 'PAYMENT',
          amount: applied,
          balanceAfter: Number(updated.outstandingBalance),
          paymentId: payment.id,
          notes: 'Advance applied to bills',
          entryDate: new Date(),
        },
      });

      return {
        applied,
        advanceBalance: Number(updated.advanceBalance),
        outstandingBalance: Number(updated.outstandingBalance),
        paymentId: payment.id,
      };
    });
  }

  async postSupplierAdjustment(
    tenantId: string,
    supplierId: string,
    data: { type: 'DEBIT_NOTE' | 'CREDIT_NOTE'; amount: number; notes?: string; entryDate?: string },
  ) {
    const amount = Number(data.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('Amount must be positive');
    }
    const supplier = await this.prisma.supplier.findFirst({ where: { id: supplierId, tenantId } });
    if (!supplier) throw new NotFoundException('Supplier not found');

    const isDebit = data.type === 'DEBIT_NOTE'; // reduces payable
    const entryDate = data.entryDate ? new Date(data.entryDate) : new Date();

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.supplier.update({
        where: { id: supplierId },
        data: {
          outstandingBalance: isDebit ? { decrement: amount } : { increment: amount },
        },
      });
      const entry = await tx.supplierLedgerEntry.create({
        data: {
          tenantId,
          supplierId,
          type: data.type,
          amount,
          balanceAfter: Number(updated.outstandingBalance),
          notes: data.notes?.trim() || (isDebit ? 'Debit note' : 'Credit note'),
          entryDate,
        },
      });
      return { supplier: updated, entry };
    });
  }

  async getDuesCalendar(tenantId: string, from?: Date, to?: Date) {
    const start = from ?? (() => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      return d;
    })();
    const end = to ?? (() => {
      const d = new Date(start);
      d.setDate(d.getDate() + 7);
      d.setHours(23, 59, 59, 999);
      return d;
    })();

    const bills = await this.prisma.purchaseBill.findMany({
      where: {
        tenantId,
        status: { in: ['POSTED', 'PARTIALLY_PAID'] },
        dueDate: { gte: start, lte: end },
      },
      include: {
        supplier: { select: { id: true, name: true, phone: true, gstin: true } },
      },
      orderBy: [{ dueDate: 'asc' }, { invoiceDate: 'asc' }],
      take: 200,
    });

    const items = bills
      .map((b) => this.decorateBill(b))
      .filter((b) => b.dueAmount > 0.009);

    const totalDue = this.round2(items.reduce((s, b) => s + b.dueAmount, 0));
    return {
      from: start.toISOString(),
      to: end.toISOString(),
      billCount: items.length,
      totalDue,
      items,
    };
  }

  buildSupplierWhatsAppDues(
    supplier: { name: string; phone?: string | null; outstandingBalance: unknown },
    bills: Array<{ invoiceNumber: string; dueAmount: number; dueDate?: Date | string | null }>,
    shopName?: string,
  ) {
    const pending = Number(supplier.outstandingBalance);
    const open = bills.filter((b) => b.dueAmount > 0.009).slice(0, 12);
    const lines = [
      shopName ? `*${shopName}*` : null,
      `Namaste ${supplier.name},`,
      `Pending payable: ₹${pending.toLocaleString('en-IN')}`,
      open.length ? 'Open bills:' : null,
      ...open.map(
        (b) =>
          `• ${b.invoiceNumber} — ₹${b.dueAmount.toLocaleString('en-IN')}${
            b.dueDate ? ` (due ${new Date(b.dueDate).toLocaleDateString('en-IN')})` : ''
          }`,
      ),
      'Please arrange payment. Thank you.',
    ].filter(Boolean) as string[];
    const text = lines.join('\n');
    const phone = (supplier.phone || '').replace(/\D/g, '');
    const waPhone = phone.length >= 10 ? (phone.length === 10 ? `91${phone}` : phone) : '';
    const waUrl = waPhone
      ? `https://wa.me/${waPhone}?text=${encodeURIComponent(text)}`
      : null;
    return { text, waUrl, phone: supplier.phone || null, outstanding: pending, billCount: open.length };
  }

  async getSupplierWhatsAppDues(tenantId: string, supplierId: string) {
    const detail = await this.getSupplierDetail(tenantId, supplierId);
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    return this.buildSupplierWhatsAppDues(
      detail.supplier,
      detail.bills.map((b) => ({
        invoiceNumber: b.invoiceNumber,
        dueAmount: b.dueAmount,
        dueDate: b.dueDate,
      })),
      tenant?.name,
    );
  }

  async logSupplierReminder(
    tenantId: string,
    supplierId: string,
    userId: string | undefined,
    opts?: { templateKey?: string; channel?: 'WHATSAPP' | 'SMS' | 'CALL_NOTE' },
  ) {
    const payload = await this.getSupplierWhatsAppDues(tenantId, supplierId);
    const log = await this.prisma.partyReminderLog.create({
      data: {
        tenantId,
        partyType: 'SUPPLIER',
        partyId: supplierId,
        channel: opts?.channel || 'WHATSAPP',
        templateKey: opts?.templateKey || 'DUES_SUMMARY',
        body: payload.text,
        outstandingSnapshot: payload.outstanding,
        billCount: payload.billCount,
        status: 'SENT',
        createdByUserId: userId || null,
      },
    });
    return { ...payload, reminderId: log.id, createdAt: log.createdAt };
  }

  async listSupplierReminders(tenantId: string, supplierId: string) {
    return this.prisma.partyReminderLog.findMany({
      where: { tenantId, partyType: 'SUPPLIER', partyId: supplierId },
      orderBy: { createdAt: 'desc' },
      include: { createdBy: { select: { id: true, name: true } } },
      take: 50,
    });
  }

  async bulkOverdueReminders(tenantId: string, userId?: string) {
    const aging = await this.getSupplierAging(tenantId);
    const overdue = aging.filter((r) => r.overdueCount > 0 && r.supplierId);
    const results = [];
    for (const row of overdue) {
      if (!row.supplierId) continue;
      const sent = await this.logSupplierReminder(tenantId, row.supplierId, userId, {
        templateKey: 'OVERDUE_BULK',
      });
      results.push({
        supplierId: row.supplierId,
        name: row.name,
        phone: row.phone,
        outstanding: row.outstanding,
        overdueCount: row.overdueCount,
        waUrl: sent.waUrl,
        text: sent.text,
        reminderId: sent.reminderId,
      });
    }
    return { count: results.length, items: results };
  }

  async getSupplierPaymentReceipt(tenantId: string, paymentId: string) {
    const payment = await this.prisma.supplierPayment.findFirst({
      where: { id: paymentId, tenantId },
      include: {
        supplier: true,
        allocations: { include: { bill: true } },
      },
    });
    if (!payment) throw new NotFoundException('Payment not found');
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    const shopMeta = [tenant?.gstin ? `GSTIN ${tenant.gstin}` : null, tenant?.address, tenant?.phone]
      .filter(Boolean)
      .join(' · ');
    const { buildPaymentReceiptHtml } = await import('../reports/report-html.util');
    const html = buildPaymentReceiptHtml({
      shopName: tenant?.name,
      shopMeta: shopMeta || undefined,
      title: 'Supplier payment receipt',
      partyName: payment.supplier.name,
      partyMeta: payment.supplier.gstin || payment.supplier.phone || undefined,
      paymentDate: payment.paymentDate.toISOString().slice(0, 10),
      method: payment.method,
      reference: payment.referenceNo || undefined,
      status: payment.status,
      amount: Number(payment.amount),
      tdsAmount: Number(payment.tdsAmount) || undefined,
      advanceAmount: Number(payment.advanceAmount) || undefined,
      notes: payment.notes || undefined,
      allocations: payment.allocations.map((a) => ({
        docNo: a.bill?.invoiceNumber || a.billId,
        amount: Number(a.amount),
      })),
    });
    return {
      shop: tenant
        ? { name: tenant.name, gstin: tenant.gstin, address: tenant.address, phone: tenant.phone }
        : null,
      payment,
      summary: {
        amount: Number(payment.amount),
        tdsAmount: Number(payment.tdsAmount),
        advanceAmount: Number(payment.advanceAmount),
        allocated: payment.allocations.reduce((s, a) => s + Number(a.amount), 0),
        status: payment.status,
      },
      html,
      filename: `payment-receipt-${payment.id.slice(-8)}.html`,
    };
  }

  async whatsappSupplierPaymentReceipt(tenantId: string, paymentId: string) {
    const receipt = await this.getSupplierPaymentReceipt(tenantId, paymentId);
    const payment = receipt.payment!;
    const text = [
      receipt.shop?.name || 'RetailSarathi',
      `Payment receipt for ${payment.supplier.name}`,
      `Amount ₹${Number(payment.amount).toLocaleString('en-IN')} via ${payment.method}`,
      payment.referenceNo ? `Ref ${payment.referenceNo}` : null,
      'Thank you.',
    ]
      .filter(Boolean)
      .join('\n');
    const { sendWhatsAppWithOptionalMedia } = await import('../common/whatsapp.util');
    const wa = await sendWhatsAppWithOptionalMedia({
      phone: payment.supplier.phone,
      text,
      htmlDocument: receipt.html,
      filename: receipt.filename,
      meta: { type: 'supplier_payment_receipt', paymentId },
    });
    await this.prisma.partyReminderLog.create({
      data: {
        tenantId,
        partyType: 'SUPPLIER',
        partyId: payment.supplierId,
        channel: 'WHATSAPP',
        templateKey: 'PAYMENT_RECEIPT',
        body: text,
        outstandingSnapshot: Number(payment.amount),
        status: wa.sent ? 'SENT' : 'FAILED',
      },
    });
    return { ...wa, receipt };
  }
}
