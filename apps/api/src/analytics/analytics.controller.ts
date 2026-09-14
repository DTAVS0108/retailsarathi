import { Controller, Get, Post, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { CurrentUser, JwtPayload } from '../common/decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { resolveReportPeriod } from '../reports/period.util';

@ApiTags('analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('analytics')
export class AnalyticsController {
  constructor(private analytics: AnalyticsService) {}

  private days(raw: string | undefined, fallback: number) {
    const n = parseInt(raw ?? String(fallback), 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  private ledgerPeriod(q: {
    days?: string;
    from?: string;
    to?: string;
    fy?: string;
    quarter?: string;
  }) {
    try {
      const hasExplicit =
        Boolean(q.from || q.to || q.fy || q.quarter) ||
        (q.days != null && q.days !== '');
      return resolveReportPeriod({
        from: q.from,
        to: q.to,
        fy: q.fy,
        quarter: q.quarter != null && q.quarter !== '' ? Number(q.quarter) : undefined,
        days: hasExplicit && q.days ? this.days(q.days, 30) : hasExplicit ? undefined : 30,
      });
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : 'Invalid period');
    }
  }

  @Get('overview')
  overview(@CurrentUser() user: JwtPayload, @Query('from') from?: string, @Query('to') to?: string) {
    return this.analytics.getOverview(user.tenantId, from, to);
  }

  @Get('abc')
  abc(@CurrentUser() user: JwtPayload, @Query('days') days?: string) {
    return this.analytics.getAbcAnalysis(user.tenantId, this.days(days, 90));
  }

  @Post('abc/refresh')
  refreshAbc(@CurrentUser() user: JwtPayload, @Query('days') days?: string) {
    return this.analytics.refreshAbcGrades(user.tenantId, this.days(days, 90));
  }

  @Get('dead-stock')
  deadStock(@CurrentUser() user: JwtPayload, @Query('days') days?: string) {
    return this.analytics.getDeadStock(user.tenantId, this.days(days, 60));
  }

  @Get('margin-by-sku')
  margin(@CurrentUser() user: JwtPayload, @Query('days') days?: string) {
    return this.analytics.getMarginBySku(user.tenantId, this.days(days, 30));
  }

  @Get('salesperson')
  salesperson(@CurrentUser() user: JwtPayload, @Query('days') days?: string) {
    return this.analytics.getSalespersonPerformance(user.tenantId, this.days(days, 30));
  }

  @Get('monthly')
  monthly(@CurrentUser() user: JwtPayload, @Query('months') months?: string) {
    return this.analytics.getMonthlyReport(user.tenantId, this.days(months, 6));
  }

  @Get('stock-flow')
  stockFlow(@CurrentUser() user: JwtPayload, @Query('days') days?: string) {
    return this.analytics.getStockFlow(user.tenantId, this.days(days, 30));
  }

  @Get('sale-ledger')
  saleLedger(
    @CurrentUser() user: JwtPayload,
    @Query('days') days?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('fy') fy?: string,
    @Query('quarter') quarter?: string,
    @Query('gstRate') gstRate?: string,
  ) {
    const period = this.ledgerPeriod({ days, from, to, fy, quarter });
    return this.analytics.getSaleLedger(user.tenantId, period, gstRate);
  }

  @Get('buy-ledger')
  buyLedger(
    @CurrentUser() user: JwtPayload,
    @Query('days') days?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('fy') fy?: string,
    @Query('quarter') quarter?: string,
    @Query('gstRate') gstRate?: string,
  ) {
    const period = this.ledgerPeriod({ days, from, to, fy, quarter });
    return this.analytics.getBuyLedger(user.tenantId, period, gstRate);
  }
}
