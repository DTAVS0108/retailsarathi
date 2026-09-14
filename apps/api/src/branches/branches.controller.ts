import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { BranchesService } from './branches.service';
import { CurrentUser, JwtPayload } from '../common/decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('branches')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('branches')
export class BranchesController {
  constructor(private branches: BranchesService) {}

  @Get('transfers/list')
  transfers(@CurrentUser() user: JwtPayload) {
    return this.branches.listTransfers(user.tenantId);
  }

  @Post('transfers')
  createTransfer(
    @CurrentUser() user: JwtPayload,
    @Body() body: { fromBranchId: string; toBranchId: string; items: Array<{ productId: string; quantity: number }>; notes?: string },
  ) {
    return this.branches.createTransfer(user.tenantId, body.fromBranchId, body.toBranchId, body.items, body.notes);
  }

  @Post('transfers/:id/complete')
  completeTransfer(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.branches.completeTransfer(user.tenantId, id);
  }

  @Get('reports/consolidated-pnl')
  consolidatedPnl(
    @CurrentUser() user: JwtPayload,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.branches.getConsolidatedPnl(user.tenantId, from, to);
  }

  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.branches.list(user.tenantId);
  }

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() body: { name: string; address: string; stateCode: string }) {
    return this.branches.create(user.tenantId, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { name?: string; address?: string; stateCode?: string },
  ) {
    return this.branches.update(user.tenantId, id, body);
  }

  @Get(':id/stock')
  stock(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.branches.getBranchStock(user.tenantId, id);
  }

  @Post(':id/stock/init')
  initStock(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.branches.initBranchStock(user.tenantId, id);
  }
}
