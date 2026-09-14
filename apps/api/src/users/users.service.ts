import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  async listTechnicians(tenantId: string) {
    return this.prisma.user.findMany({
      where: { tenantId, role: 'TECHNICIAN', isActive: true },
      select: { id: true, name: true, email: true, branchId: true },
      orderBy: { name: 'asc' },
    });
  }

  listActiveUsers(tenantId: string) {
    return this.prisma.user.findMany({
      where: { tenantId, isActive: true },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: 'asc' },
    });
  }
}
