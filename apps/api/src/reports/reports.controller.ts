import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ReportsService } from './reports.service';
import { CurrentUser, JwtPayload, Roles } from '../common/decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';

@ApiTags('reports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('OWNER', 'MANAGER')
@Controller('reports')
export class ReportsController {
  constructor(private reports: ReportsService) {}

  @Get('sell')
  sell(
    @CurrentUser() user: JwtPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('fy') fy?: string,
    @Query('days') days?: string,
    @Query('quarter') quarter?: string,
    @Query('branchId') branchId?: string,
    @Query('gstRate') gstRate?: string,
    @Query('format') format?: string,
  ) {
    return this.reports.sellReport(user.tenantId, {
      from,
      to,
      fy,
      days,
      quarter,
      branchId,
      gstRate,
      format,
    });
  }

  @Get('buy')
  buy(
    @CurrentUser() user: JwtPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('fy') fy?: string,
    @Query('days') days?: string,
    @Query('quarter') quarter?: string,
    @Query('supplierId') supplierId?: string,
    @Query('gstRate') gstRate?: string,
    @Query('format') format?: string,
  ) {
    return this.reports.buyReport(user.tenantId, {
      from,
      to,
      fy,
      days,
      quarter,
      supplierId,
      gstRate,
      format,
    });
  }

  @Get('supplier-ledger/:supplierId')
  @Roles('OWNER', 'MANAGER', 'CASHIER')
  supplierLedger(
    @CurrentUser() user: JwtPayload,
    @Param('supplierId') supplierId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('fy') fy?: string,
    @Query('days') days?: string,
    @Query('quarter') quarter?: string,
    @Query('format') format?: string,
  ) {
    return this.reports.supplierLedger(user.tenantId, supplierId, {
      from,
      to,
      fy,
      days,
      quarter,
      format,
    });
  }

  @Get('customer-ledger/:customerId')
  @Roles('OWNER', 'MANAGER', 'CASHIER')
  customerLedger(
    @CurrentUser() user: JwtPayload,
    @Param('customerId') customerId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('fy') fy?: string,
    @Query('days') days?: string,
    @Query('quarter') quarter?: string,
    @Query('format') format?: string,
  ) {
    return this.reports.customerLedger(user.tenantId, customerId, {
      from,
      to,
      fy,
      days,
      quarter,
      format,
    });
  }

  @Get('day-end')
  @Roles('OWNER', 'MANAGER', 'CASHIER')
  dayEnd(@CurrentUser() user: JwtPayload, @Query('date') date?: string) {
    return this.reports.dayEnd(user.tenantId, date);
  }

  @Get('rollups')
  rollups(
    @CurrentUser() user: JwtPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('fy') fy?: string,
    @Query('days') days?: string,
    @Query('quarter') quarter?: string,
  ) {
    return this.reports.rollups(user.tenantId, { from, to, fy, days, quarter });
  }

  /** ITR pack: FY summary + sell/buy + quarterly (CSV/Excel/PDF). */
  @Get('itr-pack')
  itrPack(
    @CurrentUser() user: JwtPayload,
    @Query('fy') fy?: string,
    @Query('format') format?: string,
  ) {
    return this.reports.itrPack(user.tenantId, { fy, format });
  }

  @Get('stock-valuation')
  stockValuation(
    @CurrentUser() user: JwtPayload,
    @Query('category') category?: string,
    @Query('gstRate') gstRate?: string,
    @Query('format') format?: string,
  ) {
    return this.reports.stockValuation(user.tenantId, { category, gstRate, format });
  }

  /** Customer udhaar / receivables list (Khata + Ledgers customer). */
  @Get('receivables')
  @Roles('OWNER', 'MANAGER', 'CASHIER')
  receivables(@CurrentUser() user: JwtPayload, @Query('format') format?: string) {
    return this.reports.receivablesReport(user.tenantId, { format });
  }

  /** Supplier payables list (Khata + Ledgers buy board). */
  @Get('payables')
  @Roles('OWNER', 'MANAGER', 'CASHIER')
  payables(@CurrentUser() user: JwtPayload, @Query('format') format?: string) {
    return this.reports.payablesReport(user.tenantId, { format });
  }

  @Get('stock-movements')
  stockMovements(
    @CurrentUser() user: JwtPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('fy') fy?: string,
    @Query('days') days?: string,
    @Query('quarter') quarter?: string,
    @Query('productId') productId?: string,
    @Query('type') type?: string,
    @Query('format') format?: string,
  ) {
    return this.reports.stockMovements(user.tenantId, {
      from,
      to,
      fy,
      days,
      quarter,
      productId,
      type,
      format,
    });
  }
}
