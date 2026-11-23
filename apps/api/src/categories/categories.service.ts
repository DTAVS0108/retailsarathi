import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';

@Injectable()
export class CategoriesService {
  constructor(private prisma: PrismaService) {}

  private normalize(name: string) {
    return name.trim().replace(/\s+/g, ' ');
  }

  async findAll(tenantId: string, includeInactive = false) {
    return this.prisma.productCategory.findMany({
      where: {
        tenantId,
        ...(includeInactive ? {} : { isActive: true }),
      },
      orderBy: { name: 'asc' },
    });
  }

  /** Ensure free-text product categories exist in the master list. */
  async syncFromProducts(tenantId: string) {
    const products = await this.prisma.product.findMany({
      where: { tenantId, isActive: true, category: { not: null } },
      select: { category: true },
      distinct: ['category'],
    });
    let created = 0;
    for (const row of products) {
      const name = this.normalize(row.category || '');
      if (!name || name.toLowerCase() === 'uncategorized') continue;
      try {
        await this.prisma.productCategory.create({
          data: { tenantId, name },
        });
        created += 1;
      } catch {
        /* unique — already exists */
      }
    }
    return { created, total: (await this.findAll(tenantId, true)).length };
  }

  async create(tenantId: string, dto: CreateCategoryDto) {
    const name = this.normalize(dto.name);
    if (!name) throw new BadRequestException('Category name is required');
    try {
      return await this.prisma.productCategory.create({
        data: { tenantId, name },
      });
    } catch {
      throw new BadRequestException(`Category "${name}" already exists`);
    }
  }

  async update(tenantId: string, id: string, dto: UpdateCategoryDto) {
    const existing = await this.prisma.productCategory.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException('Category not found');

    const data: { name?: string; isActive?: boolean } = {};
    if (dto.name != null) {
      const name = this.normalize(dto.name);
      if (!name) throw new BadRequestException('Category name is required');
      data.name = name;
    }
    if (dto.isActive != null) data.isActive = dto.isActive;

    try {
      const updated = await this.prisma.productCategory.update({
        where: { id },
        data,
      });
      // Rename free-text on products when category name changes
      if (data.name && data.name !== existing.name) {
        await this.prisma.product.updateMany({
          where: { tenantId, category: existing.name },
          data: { category: data.name },
        });
      }
      return updated;
    } catch {
      throw new BadRequestException('Could not update category (duplicate name?)');
    }
  }

  async remove(tenantId: string, id: string) {
    const existing = await this.prisma.productCategory.findFirst({
      where: { id, tenantId },
    });
    if (!existing) throw new NotFoundException('Category not found');
    await this.prisma.productCategory.update({
      where: { id },
      data: { isActive: false },
    });
    return { id, deactivated: true };
  }
}
