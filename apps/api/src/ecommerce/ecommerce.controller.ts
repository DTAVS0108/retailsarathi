import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { EcommerceService } from './ecommerce.service';
import { CurrentUser, JwtPayload } from '../common/decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('ecommerce')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('ecommerce')
export class EcommerceController {
  constructor(private ecommerce: EcommerceService) {}

  @Get('overview')
  overview(@CurrentUser() user: JwtPayload) {
    return this.ecommerce.overview(user.tenantId);
  }

  @Get('platforms')
  platforms() {
    return this.ecommerce.getPlatformCatalog();
  }

  @Get('channels')
  channels(@CurrentUser() user: JwtPayload) {
    return this.ecommerce.listChannels(user.tenantId);
  }

  @Post('channels')
  createChannel(
    @CurrentUser() user: JwtPayload,
    @Body() body: { platform: string; name: string; credentials?: Record<string, unknown> },
  ) {
    return this.ecommerce.createChannel(user.tenantId, body);
  }

  @Patch('channels/:id')
  updateChannel(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body()
    body: { name?: string; credentials?: Record<string, unknown>; isActive?: boolean },
  ) {
    return this.ecommerce.updateChannel(user.tenantId, id, body);
  }

  @Delete('channels/:id')
  deleteChannel(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.ecommerce.deleteChannel(user.tenantId, id);
  }

  @Post('channels/:id/sync')
  sync(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.ecommerce.syncOrders(user.tenantId, id);
  }

  @Get('orders')
  orders(
    @CurrentUser() user: JwtPayload,
    @Query('channelId') channelId?: string,
    @Query('status') status?: string,
  ) {
    return this.ecommerce.listOrders(user.tenantId, channelId, status);
  }

  @Patch('orders/:id')
  updateOrder(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { status: string },
  ) {
    return this.ecommerce.updateOrderStatus(user.tenantId, id, body.status);
  }
}
