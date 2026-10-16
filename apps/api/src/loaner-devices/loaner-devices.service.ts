import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateLoanerDeviceDto,
  UpdateLoanerDeviceDto,
  CheckoutLoanerDeviceDto,
  ReturnLoanerDeviceDto,
} from './dto/loaner-device.dto';

@Injectable()
export class LoanerDevicesService {
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string, status?: string) {
    return this.prisma.loanerDevice.findMany({
      where: { tenantId, ...(status ? { status: status as never } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(tenantId: string, dto: CreateLoanerDeviceDto) {
    return this.prisma.loanerDevice.create({
      data: {
        tenantId,
        model: dto.model,
        brand: dto.brand,
        identifier: dto.identifier,
        condition: (dto.condition as never) ?? undefined,
        notes: dto.notes,
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateLoanerDeviceDto) {
    const existing = await this.prisma.loanerDevice.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Loaner device not found');
    return this.prisma.loanerDevice.update({
      where: { id },
      data: {
        model: dto.model,
        brand: dto.brand,
        identifier: dto.identifier,
        condition: dto.condition as never,
        status: dto.status as never,
        notes: dto.notes,
      },
    });
  }

  /** Active/most-recent loan for a repair job — used by the repair detail page. */
  async getActiveCheckoutForJob(tenantId: string, repairJobId: string) {
    return this.prisma.loanerCheckout.findFirst({
      where: { tenantId, repairJobId },
      include: { loanerDevice: true },
      orderBy: { checkedOutAt: 'desc' },
    });
  }

  async checkout(tenantId: string, repairJobId: string, dto: CheckoutLoanerDeviceDto) {
    const job = await this.prisma.repairJob.findFirst({ where: { id: repairJobId, tenantId } });
    if (!job) throw new NotFoundException('Repair job not found');

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.loanerDevice.updateMany({
        where: { id: dto.loanerDeviceId, tenantId, status: 'AVAILABLE' },
        data: { status: 'ON_LOAN' },
      });
      if (updated.count === 0) {
        throw new BadRequestException('This loaner device is not available for checkout');
      }
      return tx.loanerCheckout.create({
        data: {
          tenantId,
          loanerDeviceId: dto.loanerDeviceId,
          repairJobId,
          customerId: job.customerId,
          expectedReturnAt: dto.expectedReturnAt ? new Date(dto.expectedReturnAt) : undefined,
          conditionOut: (dto.conditionOut as never) ?? undefined,
        },
        include: { loanerDevice: true },
      });
    });
  }

  async returnLoaner(tenantId: string, checkoutId: string, dto: ReturnLoanerDeviceDto) {
    const checkout = await this.prisma.loanerCheckout.findFirst({ where: { id: checkoutId, tenantId } });
    if (!checkout) throw new NotFoundException('Loaner checkout not found');
    if (checkout.returnedAt) throw new BadRequestException('This loaner has already been returned');

    return this.prisma.$transaction(async (tx) => {
      const updatedCheckout = await tx.loanerCheckout.update({
        where: { id: checkoutId },
        data: { returnedAt: new Date(), conditionIn: (dto.conditionIn as never) ?? undefined },
        include: { loanerDevice: true },
      });
      await tx.loanerDevice.update({
        where: { id: checkout.loanerDeviceId },
        data: { status: (dto.deviceStatusOverride as never) ?? 'AVAILABLE', condition: (dto.conditionIn as never) ?? undefined },
      });
      return updatedCheckout;
    });
  }
}
