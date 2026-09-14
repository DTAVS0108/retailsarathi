import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AiService } from './ai.service';
import { CurrentUser, JwtPayload } from '../common/decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ai')
export class AiController {
  constructor(private ai: AiService) {}

  @Get('reorder')
  reorderList(@CurrentUser() user: JwtPayload) {
    return this.ai.getSmartReorderList(user.tenantId);
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
  ocrHints(@Body('text') text: string) {
    return this.ai.improveOcrHints(text ?? '');
  }

  @Get('alerts')
  alerts(@CurrentUser() user: JwtPayload) {
    return this.ai.getRealtimeAlerts(user.tenantId);
  }

  @Get('agent-actions')
  agentActions(@CurrentUser() user: JwtPayload, @Query('status') status?: string) {
    return this.ai.listAgentActions(user.tenantId, status);
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
