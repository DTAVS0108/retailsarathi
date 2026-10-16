import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { BranchesService } from './branches.service';
import { CurrentUser, JwtPayload, Roles } from '../common/decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';

@ApiTags('branches')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('OWNER', 'MANAGER')
@Controller('branches')
export class BranchesController {
  constructor(private branches: BranchesService) {}

  @Get('transfers/list')
  @Roles('OWNER', 'MANAGER', 'CASHIER')
  transfers(@CurrentUser() user: JwtPayload) {
    return this.branches.listTransfers(user.tenantId);
  }

  @Post('transfers')
  @Roles('OWNER', 'MANAGER', 'CASHIER')
  createTransfer(
    @CurrentUser() user: JwtPayload,
    @Body() body: { fromBranchId: string; toBranchId: string; items: Array<{ productId: string; quantity: number }>; notes?: string },
  ) {
    return this.branches.createTransfer(user.tenantId, body.fromBranchId, body.toBranchId, body.items, body.notes);
  }

  @Post('transfers/:id/dispatch')
  dispatchTransfer(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.branches.dispatchTransfer(user.tenantId, id);
  }

  @Post('transfers/:id/receive')
  receiveTransfer(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.branches.receiveTransfer(user.tenantId, id);
  }

  @Post('transfers/:id/cancel')
  cancelTransfer(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.branches.cancelTransfer(user.tenantId, id);
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
  create(@CurrentUser() user: JwtPayload, @Body() body: { name: string; address: string; stateCode: string; managerId?: string }) {
    return this.branches.create(user.tenantId, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { name?: string; address?: string; stateCode?: string; managerId?: string | null },
  ) {
    return this.branches.update(user.tenantId, id, body);
  }

  @Get(':id/stock')
  @Roles('OWNER', 'MANAGER', 'CASHIER')
  stock(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.branches.getBranchStock(user.tenantId, id);
  }

  @Post(':id/stock/init')
  initStock(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.branches.initBranchStock(user.tenantId, id);
  }

  @Patch(':id/stock/:productId/reorder-level')
  updateReorderLevel(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('productId') productId: string,
    @Body('reorderLevel') reorderLevel: number | null,
  ) {
    return this.branches.updateStockReorderLevel(user.tenantId, id, productId, reorderLevel);
  }
}
