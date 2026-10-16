import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AiService } from './ai.service';
import { CurrentUser, JwtPayload, Roles } from '../common/decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('OWNER', 'MANAGER')
@Controller('ai')
export class AiController {
  constructor(private ai: AiService) {}

  @Get('reorder')
  reorderList(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: 'stockCoverDays' | 'suggestedReorderQty' | 'dailyAverage' | 'productName',
    @Query('sortDir') sortDir?: 'asc' | 'desc',
    @Query('urgency') urgency?: 'REORDER_NOW' | 'REORDER_SOON' | 'all',
  ) {
    return this.ai.getSmartReorderList(user.tenantId, {
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      search,
      sortBy,
      sortDir,
      urgency,
    });
  }

  @Get('forecast/:productId')
  forecast(@CurrentUser() user: JwtPayload, @Param('productId') productId: string) {
    return this.ai.getDemandForecast(user.tenantId, productId);
  }

  @Get('duplicate-imei')
  duplicateImei(@CurrentUser() user: JwtPayload) {
    return this.ai.detectDuplicateImei(user.tenantId);
  }

  @Post('ocr-hints')
  @Roles('OWNER', 'MANAGER', 'CASHIER', 'TECHNICIAN')
  ocrHints(@Body('text') text: string) {
    return this.ai.improveOcrHints(text ?? '');
  }

  @Get('alerts')
  @Roles('OWNER', 'MANAGER', 'CASHIER', 'TECHNICIAN')
  alerts(@CurrentUser() user: JwtPayload) {
    return this.ai.getRealtimeAlerts(user.tenantId);
  }

  @Get('agent-actions')
  agentActions(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return this.ai.listAgentActions(user.tenantId, {
      page: page ? Number(page) : undefined,
      pageSize: pageSize ? Number(pageSize) : undefined,
      search,
      status,
    });
  }

  @Post('agent-actions/propose-reorder')
  proposeReorder(@CurrentUser() user: JwtPayload) {
    return this.ai.proposeReorderActions(user.tenantId);
  }

  @Post('agent-actions/:id/decide')
  decide(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body('decision') decision: 'APPROVED' | 'REJECTED',
  ) {
    return this.ai.decideAgentAction(user.tenantId, id, decision);
  }
}
