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
import { CurrentUser, JwtPayload, Roles } from '../common/decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';

@ApiTags('ecommerce')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('OWNER', 'MANAGER')
@Controller('ecommerce')
export class EcommerceController {
  constructor(private ecommerce: EcommerceService) {}

  @Get('overview')
  overview(@CurrentUser() user: JwtPayload) {
    return this.ecommerce.overview(user.tenantId);
  }

  @Get('platforms')
  @Roles('OWNER', 'MANAGER', 'CASHIER', 'TECHNICIAN')
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
  @Roles('OWNER', 'MANAGER', 'CASHIER')
  orders(
    @CurrentUser() user: JwtPayload,
    @Query('channelId') channelId?: string,
    @Query('status') status?: string,
  ) {
    return this.ecommerce.listOrders(user.tenantId, channelId, status);
  }

  @Patch('orders/:id')
  @Roles('OWNER', 'MANAGER', 'CASHIER')
  updateOrder(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { status: string },
  ) {
    return this.ecommerce.updateOrderStatus(user.tenantId, id, body.status);
  }
}
