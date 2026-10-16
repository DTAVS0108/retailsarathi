import { Controller, Get, Post, Query, UseGuards, BadRequestException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AnalyticsService } from './analytics.service';
import { CurrentUser, JwtPayload, Roles } from '../common/decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { resolveReportPeriod } from '../reports/period.util';

@ApiTags('analytics')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('OWNER', 'MANAGER')
@Controller('analytics')
export class AnalyticsController {
  constructor(private analytics: AnalyticsService) {}

  private days(raw: string | undefined, fallback: number) {
    const n = parseInt(raw ?? String(fallback), 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  }

  /** Shared date-range resolver for every Analytics endpoint — from/to/fy/quarter override the `days` fallback. */
  private period(
    q: { days?: string; from?: string; to?: string; fy?: string; quarter?: string },
    fallbackDays: number,
  ) {
    try {
      const hasExplicit = Boolean(q.from || q.to || q.fy || q.quarter) || (q.days != null && q.days !== '');
      return resolveReportPeriod({
        from: q.from,
        to: q.to,
        fy: q.fy,
        quarter: q.quarter != null && q.quarter !== '' ? Number(q.quarter) : undefined,
        days: hasExplicit && q.days ? this.days(q.days, fallbackDays) : hasExplicit ? undefined : fallbackDays,
      });
    } catch (e) {
      throw new BadRequestException(e instanceof Error ? e.message : 'Invalid period');
    }
  }

  @Get('overview')
  overview(
    @CurrentUser() user: JwtPayload,
    @Query('days') days?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('fy') fy?: string,
    @Query('quarter') quarter?: string,
  ) {
    return this.analytics.getOverview(user.tenantId, this.period({ days, from, to, fy, quarter }, 30));
  }

  @Get('kpi-trend')
  kpiTrend(@CurrentUser() user: JwtPayload, @Query('weeks') weeks?: string) {
    return this.analytics.getKpiTrend(user.tenantId, this.days(weeks, 8));
  }

  @Get('recent-activity')
  recentActivity(@CurrentUser() user: JwtPayload, @Query('limit') limit?: string) {
    return this.analytics.getRecentActivity(user.tenantId, this.days(limit, 8));
  }

  @Get('daily-summary')
  dailySummary(@CurrentUser() user: JwtPayload) {
    return this.analytics.getDailySummary(user.tenantId);
  }

  @Get('executive-summary')
  executiveSummary(
    @CurrentUser() user: JwtPayload,
    @Query('days') days?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('fy') fy?: string,
    @Query('quarter') quarter?: string,
  ) {
    return this.analytics.getExecutiveSummary(user.tenantId, this.period({ days, from, to, fy, quarter }, 30));
  }

  @Get('top-performers')
  topPerformers(
    @CurrentUser() user: JwtPayload,
    @Query('days') days?: string,
    @Query('limit') limit?: string,
  ) {
    return this.analytics.getTopPerformers(user.tenantId, this.period({ days }, 30), this.days(limit, 5));
  }

  @Get('abc')
  abc(
    @CurrentUser() user: JwtPayload,
    @Query('days') days?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('fy') fy?: string,
    @Query('quarter') quarter?: string,
    @Query('format') format?: string,
  ) {
    return this.analytics.getAbcAnalysis(user.tenantId, this.period({ days, from, to, fy, quarter }, 90), format);
  }

  @Post('abc/refresh')
  refreshAbc(@CurrentUser() user: JwtPayload, @Query('days') days?: string) {
    return this.analytics.refreshAbcGrades(user.tenantId, this.days(days, 90));
  }

  @Get('dead-stock')
  deadStock(
    @CurrentUser() user: JwtPayload,
    @Query('days') days?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('fy') fy?: string,
    @Query('quarter') quarter?: string,
    @Query('format') format?: string,
  ) {
    return this.analytics.getDeadStock(user.tenantId, this.period({ days, from, to, fy, quarter }, 60), format);
  }

  @Get('margin-by-sku')
  margin(
    @CurrentUser() user: JwtPayload,
    @Query('days') days?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('fy') fy?: string,
    @Query('quarter') quarter?: string,
    @Query('format') format?: string,
  ) {
    return this.analytics.getMarginBySku(user.tenantId, this.period({ days, from, to, fy, quarter }, 30), format);
  }

  @Get('salesperson')
  salesperson(
    @CurrentUser() user: JwtPayload,
    @Query('days') days?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('fy') fy?: string,
    @Query('quarter') quarter?: string,
  ) {
    return this.analytics.getSalespersonPerformance(user.tenantId, this.period({ days, from, to, fy, quarter }, 30));
  }

  @Get('repairs')
  repairs(
    @CurrentUser() user: JwtPayload,
    @Query('days') days?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('fy') fy?: string,
    @Query('quarter') quarter?: string,
  ) {
    return this.analytics.getRepairAnalytics(user.tenantId, this.period({ days, from, to, fy, quarter }, 90));
  }

  @Get('monthly')
  monthly(@CurrentUser() user: JwtPayload, @Query('months') months?: string, @Query('format') format?: string) {
    return this.analytics.getMonthlyReport(user.tenantId, this.days(months, 6), format);
  }

  @Get('revenue-trend')
  revenueTrend(
    @CurrentUser() user: JwtPayload,
    @Query('granularity') granularity?: string,
    @Query('count') count?: string,
    @Query('forecast') forecast?: string,
    @Query('compare') compare?: string,
  ) {
    const g = granularity === 'week' || granularity === 'year' ? granularity : 'month';
    const fallback = g === 'week' ? 8 : g === 'year' ? 5 : 6;
    const forecastCount = forecast != null ? Math.min(2, Math.max(0, parseInt(forecast, 10) || 0)) : 0;
    return this.analytics.getRevenueTrend(user.tenantId, g, this.days(count, fallback), {
      forecast: forecastCount,
      compare: compare === 'true',
    });
  }

  @Get('forecast')
  forecast(
    @CurrentUser() user: JwtPayload,
    @Query('granularity') granularity?: string,
    @Query('count') count?: string,
    @Query('steps') steps?: string,
  ) {
    const g = granularity === 'week' || granularity === 'year' ? granularity : 'month';
    const fallback = g === 'week' ? 8 : g === 'year' ? 5 : 6;
    const n = this.days(count, fallback);
    const clampedCount = Math.min(12, Math.max(3, n));
    const stepsCount = Math.min(6, Math.max(1, parseInt(steps ?? '3', 10) || 3));
    return this.analytics.getServiceForecast(user.tenantId, g, clampedCount, stepsCount);
  }

  @Get('peak-hours')
  peakHours(@CurrentUser() user: JwtPayload, @Query('days') days?: string) {
    return this.analytics.getPeakHours(user.tenantId, this.days(days, 90));
  }

  @Get('stock-flow')
  stockFlow(
    @CurrentUser() user: JwtPayload,
    @Query('days') days?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('fy') fy?: string,
    @Query('quarter') quarter?: string,
    @Query('format') format?: string,
  ) {
    return this.analytics.getStockFlow(user.tenantId, this.period({ days, from, to, fy, quarter }, 30), format);
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
    const period = this.period({ days, from, to, fy, quarter }, 30);
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
    const period = this.period({ days, from, to, fy, quarter }, 30);
    return this.analytics.getBuyLedger(user.tenantId, period, gstRate);
  }
}
