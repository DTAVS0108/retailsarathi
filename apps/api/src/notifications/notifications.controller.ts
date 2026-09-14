import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { NotificationsService } from './notifications.service';
import { SendNotificationDto, CreateTemplateDto } from './dto/notification.dto';
import { CurrentUser, JwtPayload } from '../common/decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
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
}
