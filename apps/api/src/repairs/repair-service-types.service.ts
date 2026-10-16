import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateRepairServiceTypeDto, UpdateRepairServiceTypeDto } from './dto/repair.dto';

@Injectable()
export class RepairServiceTypesService {
  constructor(private prisma: PrismaService) {}

  async findAll(tenantId: string) {
    return this.prisma.repairServiceType.findMany({
      where: { tenantId, isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async create(tenantId: string, dto: CreateRepairServiceTypeDto) {
    return this.prisma.repairServiceType.create({
      data: {
        tenantId,
        name: dto.name,
        defaultPrice: dto.defaultPrice,
        typicalTurnaroundDays: dto.typicalTurnaroundDays,
      },
    });
  }

  async update(tenantId: string, id: string, dto: UpdateRepairServiceTypeDto) {
    const existing = await this.prisma.repairServiceType.findFirst({ where: { id, tenantId } });
    if (!existing) throw new NotFoundException('Service type not found');
    return this.prisma.repairServiceType.update({
      where: { id },
      data: {
        name: dto.name,
        defaultPrice: dto.defaultPrice,
        typicalTurnaroundDays: dto.typicalTurnaroundDays,
        isActive: dto.isActive,
      },
    });
  }
}
