import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PartiesService {
  constructor(private prisma: PrismaService) {}

  /** Unified customer ∪ supplier search by name / phone / GSTIN / city / address. */
  async search(tenantId: string, q: string, limit = 20) {
    const query = q?.trim();
    if (!query || query.length < 2) {
      throw new BadRequestException('Search needs at least 2 characters');
    }
    const take = Math.min(Math.max(limit, 1), 50);

    const [customers, suppliers] = await Promise.all([
      this.prisma.customer.findMany({
        where: {
          tenantId,
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { phone: { contains: query, mode: 'insensitive' } },
            { gstin: { contains: query, mode: 'insensitive' } },
            { email: { contains: query, mode: 'insensitive' } },
            { city: { contains: query, mode: 'insensitive' } },
            { address: { contains: query, mode: 'insensitive' } },
            { pincode: { contains: query, mode: 'insensitive' } },
          ],
        },
        take,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          phone: true,
          gstin: true,
          email: true,
          address: true,
          addressLine2: true,
          city: true,
          pincode: true,
          stateCode: true,
          segment: true,
          outstandingBalance: true,
          creditLimit: true,
        },
      }),
      this.prisma.supplier.findMany({
        where: {
          tenantId,
          isActive: true,
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { phone: { contains: query, mode: 'insensitive' } },
            { gstin: { contains: query, mode: 'insensitive' } },
            { email: { contains: query, mode: 'insensitive' } },
            { city: { contains: query, mode: 'insensitive' } },
            { address: { contains: query, mode: 'insensitive' } },
            { pincode: { contains: query, mode: 'insensitive' } },
          ],
        },
        take,
        orderBy: { name: 'asc' },
        select: {
          id: true,
          name: true,
          phone: true,
          gstin: true,
          email: true,
          address: true,
          addressLine2: true,
          city: true,
          pincode: true,
          stateCode: true,
          outstandingBalance: true,
          isMsme: true,
          paymentTermsDays: true,
        },
      }),
    ]);

    return {
      query,
      parties: [
        ...customers.map((c) => ({
          type: 'CUSTOMER' as const,
          id: c.id,
          name: c.name,
          phone: c.phone,
          gstin: c.gstin,
          email: c.email,
          address: c.address,
          addressLine2: c.addressLine2,
          city: c.city,
          pincode: c.pincode,
          stateCode: c.stateCode,
          segment: c.segment,
          creditLimit: Number(c.creditLimit),
          balance: Number(c.outstandingBalance),
          href: `/dashboard/customers/${c.id}`,
        })),
        ...suppliers.map((s) => ({
          type: 'SUPPLIER' as const,
          id: s.id,
          name: s.name,
          phone: s.phone,
          gstin: s.gstin,
          email: s.email,
          address: s.address,
          addressLine2: s.addressLine2,
          city: s.city,
          pincode: s.pincode,
          stateCode: s.stateCode,
          balance: Number(s.outstandingBalance),
          isMsme: s.isMsme,
          paymentTermsDays: s.paymentTermsDays,
          href: `/dashboard/suppliers/${s.id}`,
        })),
      ].sort((a, b) => a.name.localeCompare(b.name)),
    };
  }
}
