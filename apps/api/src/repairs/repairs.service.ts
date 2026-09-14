import { Injectable, NotFoundException, BadRequestException, forwardRef, Inject } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import { CreateRepairJobDto, UpdateRepairStatusDto, AddRepairPartDto } from './dto/repair.dto';

import { NotificationsService } from '../notifications/notifications.service';

import { InvoicesService } from '../invoices/invoices.service';

import { calculateInvoice } from '@retail-sarathi/gst-engine';



const STATUS_FLOW: Record<string, string[]> = {

  RECEIVED: ['DIAGNOSED', 'CANCELLED'],

  DIAGNOSED: ['AWAITING_PARTS', 'IN_REPAIR', 'CANCELLED'],

  AWAITING_PARTS: ['IN_REPAIR', 'CANCELLED'],

  IN_REPAIR: ['READY', 'CANCELLED'],

  READY: ['DELIVERED'],

  DELIVERED: [],

  CANCELLED: [],

};



@Injectable()

export class RepairsService {

  constructor(

    private prisma: PrismaService,

    private notifications: NotificationsService,

    @Inject(forwardRef(() => InvoicesService))

    private invoices: InvoicesService,

  ) {}



  async findAll(tenantId: string, status?: string) {

    return this.prisma.repairJob.findMany({

      where: { tenantId, ...(status ? { status: status as never } : {}) },

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

      },

    });

    if (!job) throw new NotFoundException('Repair job not found');

    return job;

  }



  async create(tenantId: string, branchId: string, dto: CreateRepairJobDto) {

    const jobNumber = await this.nextJobNumber(tenantId);

    return this.prisma.$transaction(async (tx) => {

      const job = await tx.repairJob.create({

        data: {

          tenantId,

          branchId,

          customerId: dto.customerId,

          jobNumber,

          deviceModel: dto.deviceModel,

          imei: dto.imei,

          issue: dto.issue,

          accessories: dto.accessories,

          technicianId: dto.technicianId,

          warrantyDays: dto.warrantyDays ?? 30,

          estimateAmount: dto.estimateAmount,

        },

        include: { customer: true },

      });

      await tx.repairStatusHistory.create({

        data: { repairJobId: job.id, status: 'RECEIVED', notes: 'Job received' },

      });

      return job;

    });

  }



  async updateStatus(tenantId: string, id: string, dto: UpdateRepairStatusDto) {

    const job = await this.findOne(tenantId, id);

    const allowed = STATUS_FLOW[job.status] ?? [];

    if (!allowed.includes(dto.status)) {

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

    return this.prisma.repairJob.update({

      where: { id: jobId },

      data: { technicianId },

      include: { technician: true },

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

      const part = await tx.repairPartUsed.create({

        data: {

          repairJobId: jobId,

          productId: dto.productId,

          quantity: dto.quantity,

          unitPrice: dto.unitPrice,

        },

        include: { product: true },

      });

      await tx.product.update({

        where: { id: dto.productId },

        data: { stockQty: { decrement: dto.quantity } },

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

      payments: [{ method: 'CASH', amount: totals.grandTotal }],

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

}


