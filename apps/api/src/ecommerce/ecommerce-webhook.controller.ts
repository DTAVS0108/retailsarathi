import { Body, Controller, Headers, Param, Post, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { EcommerceService } from './ecommerce.service';
import { Public } from '../common/decorators';

/**
 * External systems have no RetailSarathi login. JwtAuthGuard is registered globally
 * (APP_GUARD in auth.module.ts), so @Public() is required to bypass it — trusted instead via a
 * per-channel bearer token (header or query param), checked inside the service.
 */
@ApiTags('ecommerce')
@Controller('ecommerce/webhook')
export class EcommerceWebhookController {
  constructor(private ecommerce: EcommerceService) {}

  @Public()
  @Post(':channelId')
  receive(
    @Param('channelId') channelId: string,
    @Headers('x-webhook-token') headerToken: string | undefined,
    @Query('token') queryToken: string | undefined,
    @Body()
    body: {
      externalId?: string;
      customerName?: string;
      totalAmount?: number;
      items?: Array<{ sku?: string; name?: string; qty?: number; rate?: number }>;
    },
  ) {
    return this.ecommerce.receiveWebhookOrder(channelId, headerToken ?? queryToken, body);
  }
}
