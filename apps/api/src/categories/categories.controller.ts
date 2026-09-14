import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CategoriesService } from './categories.service';
import { CreateCategoryDto, UpdateCategoryDto } from './dto/category.dto';
import { CurrentUser, JwtPayload } from '../common/decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('categories')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('categories')
export class CategoriesController {
  constructor(private categories: CategoriesService) {}

  @Get()
  @ApiQuery({ name: 'includeInactive', required: false })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('includeInactive') includeInactive?: string,
  ) {
    return this.categories.findAll(
      user.tenantId,
      includeInactive === 'true' || includeInactive === '1',
    );
  }

  @Post('sync-from-products')
  syncFromProducts(@CurrentUser() user: JwtPayload) {
    return this.categories.syncFromProducts(user.tenantId);
  }

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateCategoryDto) {
    return this.categories.create(user.tenantId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.categories.update(user.tenantId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.categories.remove(user.tenantId, id);
  }
}
