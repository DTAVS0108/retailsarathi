import { Body, Controller, Get, Param, Post, Patch, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { SendNotificationDto, CreateTemplateDto } from './dto/notification.dto';
import { CurrentUser, JwtPayload, Roles, Public } from '../common/decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('OWNER', 'MANAGER')
@Controller('notifications')
export class NotificationsController {
  constructor(private notifications: NotificationsService) {}

  @Get('templates')
  getTemplates(@CurrentUser() user: JwtPayload) {
    return this.notifications.getTemplates(user.tenantId);
  }

  @Post('templates')
  createTemplate(@CurrentUser() user: JwtPayload, @Body() dto: CreateTemplateDto) {
    return this.notifications.createTemplate(user.tenantId, dto);
  }

  @Post('send')
  send(@CurrentUser() user: JwtPayload, @Body() dto: SendNotificationDto) {
    return this.notifications.send(user.tenantId, dto);
  }

  @Get('logs')
  getLogs(@CurrentUser() user: JwtPayload) {
    return this.notifications.getLogs(user.tenantId);
  }

  @Post('logs/:id/retry')
  retry(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.notifications.retry(user.tenantId, id);
  }

  @Patch('logs/:id/delivery-status')
  markDeliveryStatus(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body('delivered') delivered: boolean) {
    return this.notifications.markDeliveryStatus(user.tenantId, id, delivered);
  }

  @Post('broadcast/preview')
  previewBroadcast(
    @CurrentUser() user: JwtPayload,
    @Body('audience') audience: { type: 'customers' | 'staff'; filter?: { hasOutstandingBalance?: boolean; segment?: string } },
  ) {
    return this.notifications.previewBroadcastAudience(user.tenantId, audience);
  }

  @Post('broadcast')
  broadcast(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      templateId: string;
      audience: { type: 'customers' | 'staff'; filter?: { hasOutstandingBalance?: boolean; segment?: string } };
    },
  ) {
    return this.notifications.broadcast(user.tenantId, body);
  }

  /** External provider delivery callback — no JWT possible, trusted via a shared secret query param instead. */
  @Public()
  @Roles()
  @Post('webhooks/:provider')
  deliveryWebhook(
    @Query('secret') secret: string,
    @Body('providerMessageId') providerMessageId: string,
    @Body('status') status: 'delivered' | 'failed',
  ) {
    return this.notifications.handleDeliveryWebhook(secret, providerMessageId, status);
  }
}
