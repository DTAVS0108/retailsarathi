import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  constructor(private prisma: PrismaService) {}

  async log(
    tenantId: string,
    action: string,
    entityType: string,
    opts?: { userId?: string; entityId?: string; metadata?: Record<string, unknown>; ipAddress?: string },
  ) {
    return this.prisma.auditLog.create({
      data: {
        tenantId,
        userId: opts?.userId,
        action,
        entityType,
        entityId: opts?.entityId,
        metadata: opts?.metadata ? (opts.metadata as Prisma.InputJsonValue) : undefined,
        ipAddress: opts?.ipAddress,
      },
    });
  }

  async getLogs(tenantId: string, limit = 100) {
    return this.prisma.auditLog.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
