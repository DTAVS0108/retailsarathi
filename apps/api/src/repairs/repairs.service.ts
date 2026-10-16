import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  forwardRef,
  Inject,
} from '@nestjs/common';

import { Prisma } from '@prisma/client';

import { PrismaService } from '../prisma/prisma.service';

import {
  CreateRepairJobDto,
  UpdateRepairStatusDto,
  AddRepairPartDto,
  RepairRecordsFilterDto,
  BulkDeleteRepairRecordsDto,
} from './dto/repair.dto';

import { NotificationsService } from '../notifications/notifications.service';

import { InvoicesService } from '../invoices/invoices.service';

import { calculateInvoice } from '@retail-sarathi/gst-engine';
import { REPAIR_STATUS_FLOW, type RepairStatus, type UserRole } from '@retail-sarathi/types';
import { buildRepairTokenText, buildRepairTokenHtml, type RepairTokenData } from './token.util';



@Injectable()

export class RepairsService {

  constructor(

    private prisma: PrismaService,

    private notifications: NotificationsService,

    @Inject(forwardRef(() => InvoicesService))

    private invoices: InvoicesService,

  ) {}



  async findAll(tenantId: string, status?: string, branchId?: string) {

    return this.prisma.repairJob.findMany({

      where: {
        tenantId,
        ...(status ? { status: status as never } : {}),
        ...(branchId ? { branchId } : {}),
      },

      include: { customer: true, technician: true, partsUsed: { include: { product: true } } },

      orderBy: { createdAt: 'desc' },

    });

  }



  async findOne(tenantId: string, id: string) {

    const job = await this.prisma.repairJob.findFirst({

      where: { id, tenantId },

      include: {

        customer: true,

        technician: true,

        partsUsed: { include: { product: true } },

        statusHistory: { orderBy: { createdAt: 'asc' } },

        linkedInvoice: true,

        device: { include: { repairJobs: { select: { id: true, jobNumber: true, status: true, receivedAt: true } } } },

        serviceType: true,

        loanerCheckouts: { include: { loanerDevice: true }, orderBy: { checkedOutAt: 'desc' }, take: 1 },

      },

    });

    if (!job) throw new NotFoundException('Repair job not found');

    return job;

  }



  async create(tenantId: string, branchId: string, dto: CreateRepairJobDto) {

    const jobNumber = await this.nextJobNumber(tenantId);

    const { job, reopenSuggestion } = await this.prisma.$transaction(async (tx) => {

      let deviceId: string | undefined;
      let reopenSuggestion: { jobId: string; jobNumber: string; warrantyEndsAt: Date | null } | null = null;

      if (dto.imei?.trim()) {
        const existingDevice = await tx.device.findFirst({
          where: { tenantId, customerId: dto.customerId, imei: dto.imei.trim() },
        });
        const device =
          existingDevice ??
          (await tx.device.create({
            data: {
              tenantId,
              customerId: dto.customerId,
              brand: dto.deviceModel.split(' ')[0],
              model: dto.deviceModel,
              imei: dto.imei.trim(),
            },
          }));
        deviceId = device.id;

        // Warranty-comeback suggestion: does this device have a prior DELIVERED job still
        // under warranty? Surfaced to the caller, not auto-linked — the front desk confirms.
        const priorDelivered = await tx.repairJob.findFirst({
          where: {
            tenantId,
            deviceId: device.id,
            status: 'DELIVERED',
            warrantyEndsAt: { gte: new Date() },
          },
          orderBy: { deliveredAt: 'desc' },
        });
        if (priorDelivered) {
          reopenSuggestion = {
            jobId: priorDelivered.id,
            jobNumber: priorDelivered.jobNumber,
            warrantyEndsAt: priorDelivered.warrantyEndsAt,
          };
        }
      }

      const job = await tx.repairJob.create({

        data: {

          tenantId,

          branchId,

          customerId: dto.customerId,

          deviceId,

          serviceTypeId: dto.serviceTypeId,

          jobNumber,

          deviceModel: dto.deviceModel,

          imei: dto.imei,

          issue: dto.issue,

          accessories: dto.accessories,

          technicianId: dto.technicianId,

          warrantyDays: dto.warrantyDays ?? 30,

          estimateAmount: dto.estimateAmount,

          advancePaid: dto.advancePaid,

          intakeChecklist: dto.intakeChecklist as Prisma.InputJsonValue,

          reopenedFromId: dto.reopenedFromId,

        },

        include: { customer: true },

      });

      await tx.repairStatusHistory.create({

        data: { repairJobId: job.id, status: 'RECEIVED', notes: 'Job received' },

      });

      return { job, reopenSuggestion };

    });

    return { ...job, reopenSuggestion };

  }



  async updateStatus(tenantId: string, id: string, dto: UpdateRepairStatusDto, userRole?: UserRole) {

    const job = await this.findOne(tenantId, id);

    if (dto.status === 'CANCELLED' && userRole === 'TECHNICIAN') {
      throw new ForbiddenException('Only an owner or manager can cancel a repair job');
    }

    const allowed = REPAIR_STATUS_FLOW[job.status as RepairStatus] ?? [];

    if (!allowed.includes(dto.status as RepairStatus)) {

      throw new BadRequestException(`Cannot transition from ${job.status} to ${dto.status}`);

    }



    const deliveredAt = dto.status === 'DELIVERED' ? new Date() : job.deliveredAt;

    const warrantyEndsAt =

      dto.status === 'DELIVERED'

        ? new Date(Date.now() + (job.warrantyDays ?? 30) * 86400000)

        : job.warrantyEndsAt;



    const updated = await this.prisma.$transaction(async (tx) => {

      const result = await tx.repairJob.update({

        where: { id },

        data: {

          status: dto.status as never,

          customerApproved: dto.customerApproved ?? job.customerApproved,

          finalAmount: dto.finalAmount ?? job.finalAmount,

          deliveredAt,

          warrantyEndsAt,

        },

      });

      await tx.repairStatusHistory.create({

        data: { repairJobId: id, status: dto.status as never, notes: dto.notes },

      });

      return result;

    });



    if (dto.status === 'DELIVERED' && !job.linkedInvoiceId) {

      await this.createInvoiceFromRepair(tenantId, job.branchId, id);

    }



    return updated;

  }



  async assignTechnician(tenantId: string, jobId: string, technicianId: string) {

    await this.findOne(tenantId, jobId);

    const technician = await this.prisma.user.findFirst({
      where: { id: technicianId, tenantId, role: 'TECHNICIAN' },
    });
    if (!technician) {
      throw new BadRequestException('Technician not found for this shop');
    }

    return this.prisma.repairJob.update({

      where: { id: jobId },

      data: { technicianId },

      include: { technician: true },

    });

  }



  /** Public counter-screen data — job numbers + status only, never customer/financial details. */
  async getPublicQueue(slug: string, branchId?: string) {
    const tenant = await this.prisma.tenant.findUnique({ where: { slug }, select: { id: true, name: true } });
    if (!tenant) throw new NotFoundException('Shop not found');
    const jobs = await this.prisma.repairJob.findMany({
      where: { tenantId: tenant.id, status: 'READY', ...(branchId ? { branchId } : {}) },
      select: { jobNumber: true, receivedAt: true },
      orderBy: { receivedAt: 'asc' },
      take: 50,
    });
    return { shopName: tenant.name, queue: jobs.map((j) => j.jobNumber) };
  }

  async getTechnicianWorkload(tenantId: string) {
    const [technicians, openJobs] = await Promise.all([
      this.prisma.user.findMany({
        where: { tenantId, role: 'TECHNICIAN' },
        select: { id: true, name: true },
      }),
      this.prisma.repairJob.findMany({
        where: { tenantId, status: { notIn: ['DELIVERED', 'CANCELLED'] } },
        select: { technicianId: true, receivedAt: true },
      }),
    ]);

    const workload = technicians
      .map((tech) => {
        const jobs = openJobs.filter((j) => j.technicianId === tech.id);
        const oldestOpenJobAt = jobs.reduce<Date | null>(
          (oldest, j) => (!oldest || j.receivedAt < oldest ? j.receivedAt : oldest),
          null,
        );
        return { technicianId: tech.id, name: tech.name, openJobCount: jobs.length, oldestOpenJobAt };
      })
      .sort((a, b) => a.openJobCount - b.openJobCount);

    const unassignedOpenJobs = openJobs.filter((j) => !j.technicianId).length;
    const suggestedTechnicianId = workload[0]?.technicianId ?? null;

    return { technicians: workload, unassignedOpenJobs, suggestedTechnicianId };
  }

  private async buildTokenData(tenantId: string, jobId: string): Promise<RepairTokenData> {
    const job = await this.findOne(tenantId, jobId);
    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });
    return {
      shopName: tenant?.name ?? 'RetailSarathi',
      jobNumber: job.jobNumber,
      receivedAt: job.receivedAt.toISOString(),
      customerName: job.customer?.name,
      customerPhone: job.customer?.phone,
      deviceModel: job.deviceModel,
      imei: job.imei,
      accessories: job.accessories,
      issue: job.issue,
      status: job.status,
      estimateAmount: job.estimateAmount != null ? Number(job.estimateAmount) : null,
      warrantyDays: job.warrantyDays,
    };
  }

  async getTokenPrintHtml(tenantId: string, jobId: string) {
    const data = await this.buildTokenData(tenantId, jobId);
    return { html: buildRepairTokenHtml(data) };
  }

  async getTokenThermal(tenantId: string, jobId: string) {
    const data = await this.buildTokenData(tenantId, jobId);
    return buildRepairTokenText(data);
  }

  async recordAdvance(tenantId: string, jobId: string, amount: number) {
    const job = await this.findOne(tenantId, jobId);
    if (job.linkedInvoiceId) {
      throw new BadRequestException('Cannot record a deposit — this job has already been invoiced');
    }
    return this.prisma.repairJob.update({
      where: { id: jobId },
      data: { advancePaid: amount },
    });
  }

  async updatePhotos(tenantId: string, jobId: string, photoUrls: string[]) {

    await this.findOne(tenantId, jobId);

    return this.prisma.repairJob.update({

      where: { id: jobId },

      data: { photoUrls },

    });

  }



  async uploadPhoto(

    tenantId: string,

    jobId: string,

    file: { path: string; filename?: string; originalname?: string },

  ) {

    const job = await this.findOne(tenantId, jobId);

    const normalized = file.path.replace(/\\/g, '/');

    const idx = normalized.toLowerCase().lastIndexOf('/uploads/');

    const url =

      idx >= 0

        ? normalized.substring(idx)

        : `/uploads/repairs/${file.filename ?? file.originalname ?? 'photo'}`;

    const photoUrls = [...(job.photoUrls ?? []), url];

    return this.prisma.repairJob.update({

      where: { id: jobId },

      data: { photoUrls },

    });

  }



  async addPart(tenantId: string, jobId: string, dto: AddRepairPartDto) {

    await this.findOne(tenantId, jobId);

    return this.prisma.$transaction(async (tx) => {

      const updated = await tx.product.updateMany({
        where: { id: dto.productId, tenantId, stockQty: { gte: dto.quantity } },
        data: { stockQty: { decrement: dto.quantity } },
      });
      if (updated.count === 0) {
        throw new BadRequestException('Insufficient stock for this part');
      }

      const part = await tx.repairPartUsed.create({

        data: {

          repairJobId: jobId,

          productId: dto.productId,

          quantity: dto.quantity,

          unitPrice: dto.unitPrice,

        },

        include: { product: true },

      });

      await tx.stockLedger.create({

        data: {

          tenantId,

          productId: dto.productId,

          type: 'REPAIR_USE',

          quantity: -dto.quantity,

          referenceId: jobId,

        },

      });

      return part;

    });

  }



  async sendEstimate(tenantId: string, jobId: string) {

    const job = await this.findOne(tenantId, jobId);

    const amount = Number(job.estimateAmount ?? 0);

    const body = `Repair estimate for ${job.deviceModel} (${job.jobNumber}): ₹${amount}. Reply YES to approve.`;



    const channel = job.customer.whatsappOptIn ? 'WHATSAPP' : 'SMS';

    await this.notifications.send(tenantId, {

      channel,

      recipient: job.customer.phone,

      templateName: 'repair_estimate_ready',

      body,

      variables: {

        deviceModel: job.deviceModel,

        jobNumber: job.jobNumber,

        amount: String(amount),

      },

    });



    return { message: body, jobId: job.id, customerPhone: job.customer.phone, channel };

  }



  async createInvoiceFromRepair(tenantId: string, branchId: string, jobId: string) {

    const job = await this.findOne(tenantId, jobId);

    if (job.linkedInvoiceId) {

      return this.prisma.invoice.findUnique({ where: { id: job.linkedInvoiceId } });

    }



    const partsTotal = job.partsUsed.reduce(

      (s, p) => s + Number(p.unitPrice) * Number(p.quantity),

      0,

    );

    // Treat 0 finalAmount as unset — fall back to estimate
    const quoted =
      Number(job.finalAmount) > 0
        ? Number(job.finalAmount)
        : Number(job.estimateAmount ?? 0);

    const laborAmount = Math.max(quoted - partsTotal, 0);



    const lines = [
      ...job.partsUsed.map((p) => ({
        productName: p.product.name,
        hsnCode: p.product.hsnCode || '8517',
        quantity: Number(p.quantity),
        unitPrice: Number(p.unitPrice),
        discount: 0,
        gstRate: Number(p.product.gstRate ?? 18),
      })),
    ];



    if (laborAmount > 0) {

      lines.push({
        productName: `Repair labor — ${job.deviceModel}`,
        hsnCode: '998719',
        quantity: 1,
        unitPrice: laborAmount,
        discount: 0,
        gstRate: 18,
      });

    }



    if (!lines.length) {

      throw new BadRequestException('No billable items for repair invoice');

    }



    const tenant = await this.prisma.tenant.findUnique({ where: { id: tenantId } });

    if (!tenant?.stateCode) {

      throw new BadRequestException('Set shop GST state code in settings before creating invoices');

    }



    // Estimate/final amounts are taxable (ex-GST). Payment must match GST-inclusive bill total.
    const totals = calculateInvoice(
      lines,
      tenant.stateCode,
      job.customer?.stateCode ?? undefined,
    );



    // A deposit collected at intake was already paid — bill only the remainder as a fresh
    // payment, alongside a reference-tagged line recording the advance so the invoice's
    // payment total still reconciles to the GST-inclusive grand total.
    const advance = Math.min(Math.max(Number(job.advancePaid ?? 0), 0), totals.grandTotal);
    const remainder = totals.grandTotal - advance;
    const payments =
      advance > 0.009
        ? [
            { method: 'CASH' as const, amount: advance, reference: 'Repair intake deposit' },
            ...(remainder > 0.009 ? [{ method: 'CASH' as const, amount: remainder }] : []),
          ]
        : [{ method: 'CASH' as const, amount: totals.grandTotal }];

    const invoice = await this.invoices.create(tenantId, branchId, {

      customerId: job.customerId,

      type: 'TAX_INVOICE',

      notes: `Repair job ${job.jobNumber}`,

      lines: lines.map(({ productName, quantity, unitPrice, gstRate, hsnCode }) => ({
        productName,
        quantity,
        unitPrice,
        gstRate,
        hsnCode,
      })),

      payments,

    });



    await this.prisma.repairJob.update({

      where: { id: jobId },

      data: {
        linkedInvoiceId: invoice.id,
        finalAmount: quoted > 0 ? quoted : undefined,
      },

    });



    return invoice;

  }



  private async nextJobNumber(tenantId: string): Promise<string> {

    const year = new Date().getFullYear();

    const prefix = `REP-${year}-`;

    const last = await this.prisma.repairJob.findFirst({

      where: { tenantId, jobNumber: { startsWith: prefix } },

      orderBy: { jobNumber: 'desc' },

    });

    const seq = last ? parseInt(last.jobNumber.replace(prefix, ''), 10) + 1 : 1;

    return `${prefix}${String(seq).padStart(5, '0')}`;

  }

  private buildRecordsWhere(tenantId: string, filters: RepairRecordsFilterDto): Prisma.RepairJobWhereInput {
    const validStatuses = new Set(Object.keys(REPAIR_STATUS_FLOW));
    const where: Prisma.RepairJobWhereInput = { tenantId };
    if (filters.status && validStatuses.has(filters.status)) {
      where.status = filters.status as RepairStatus;
    }
    if (filters.technicianId) where.technicianId = filters.technicianId;
    if (filters.serviceTypeId) where.serviceTypeId = filters.serviceTypeId;
    if (filters.dateFrom || filters.dateTo) {
      where.receivedAt = {
        ...(filters.dateFrom ? { gte: new Date(`${filters.dateFrom}T00:00:00.000`) } : {}),
        ...(filters.dateTo ? { lte: new Date(`${filters.dateTo}T23:59:59.999`) } : {}),
      };
    }
    if (filters.search?.trim()) {
      const q = filters.search.trim();
      where.OR = [
        { jobNumber: { contains: q, mode: 'insensitive' } },
        { deviceModel: { contains: q, mode: 'insensitive' } },
        { imei: { contains: q, mode: 'insensitive' } },
        { issue: { contains: q, mode: 'insensitive' } },
        { customer: { name: { contains: q, mode: 'insensitive' } } },
        { customer: { phone: { contains: q, mode: 'insensitive' } } },
        { technician: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }
    return where;
  }

  /** All-time, filterable, sortable, paginated view of every repair job — for the Records page. */
  async findRecords(
    tenantId: string,
    opts: RepairRecordsFilterDto & {
      page?: number;
      pageSize?: number;
      sortBy?: string;
      sortDir?: string;
    },
  ) {
    const page = Math.max(1, opts.page ?? 1);
    const take = Math.min(Math.max(opts.pageSize ?? 25, 1), 200);
    const where = this.buildRecordsWhere(tenantId, opts);
    const sortDir = opts.sortDir === 'asc' ? 'asc' : 'desc';

    const orderByMap: Record<string, Prisma.RepairJobOrderByWithRelationInput> = {
      receivedAt: { receivedAt: sortDir },
      deliveredAt: { deliveredAt: sortDir },
      jobNumber: { jobNumber: sortDir },
      status: { status: sortDir },
      estimateAmount: { estimateAmount: sortDir },
      finalAmount: { finalAmount: sortDir },
      customer: { customer: { name: sortDir } },
      createdAt: { createdAt: sortDir },
    };
    const orderBy = orderByMap[opts.sortBy ?? ''] ?? { receivedAt: 'desc' };

    const [items, total] = await Promise.all([
      this.prisma.repairJob.findMany({
        where,
        orderBy,
        skip: (page - 1) * take,
        take,
        include: {
          customer: { select: { id: true, name: true, phone: true } },
          technician: { select: { id: true, name: true } },
          serviceType: { select: { id: true, name: true } },
          linkedInvoice: { select: { id: true, invoiceNumber: true, grandTotal: true } },
        },
      }),
      this.prisma.repairJob.count({ where }),
    ]);

    return { items, total, page, pageSize: take };
  }

  /**
   * Permanently deletes repair job records, either an explicit id list (row checkboxes) or
   * every job matching a filter (e.g. "everything before this date"). Unlike the test-cleanup
   * scripts used during development, this never restocks parts or touches linked invoices —
   * it is a historical-record purge, not an undo of the repair itself. An invoice already
   * created from a deleted job is left exactly as-is; only the repair job's own row (and its
   * cascading status history / parts-used rows) is removed.
   */
  async deleteRecords(tenantId: string, dto: BulkDeleteRepairRecordsDto) {
    let where: Prisma.RepairJobWhereInput;
    const hasFilters =
      dto.filters &&
      Object.values(dto.filters).some((v) => v !== undefined && v !== null && v !== '');

    if (dto.ids?.length) {
      where = { tenantId, id: { in: dto.ids } };
    } else if (hasFilters) {
      where = this.buildRecordsWhere(tenantId, dto.filters!);
    } else {
      throw new BadRequestException('Provide ids or at least one filter to delete');
    }

    const matches = await this.prisma.repairJob.findMany({ where, select: { id: true } });
    const ids = matches.map((j) => j.id);
    if (!ids.length) return { deletedCount: 0 };

    await this.prisma.$transaction(async (tx) => {
      const loanerCheckouts = await tx.loanerCheckout.findMany({
        where: { repairJobId: { in: ids } },
        select: { id: true, loanerDeviceId: true, returnedAt: true },
      });
      for (const lc of loanerCheckouts) {
        if (!lc.returnedAt) {
          await tx.loanerDevice
            .update({ where: { id: lc.loanerDeviceId }, data: { status: 'AVAILABLE' } })
            .catch(() => {});
        }
      }
      await tx.loanerCheckout.deleteMany({ where: { repairJobId: { in: ids } } });
      await tx.repairJob.deleteMany({ where: { id: { in: ids } } });
    });

    return { deletedCount: ids.length };
  }

}


