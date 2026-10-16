import { Module } from '@nestjs/common';
import { EcommerceService } from './ecommerce.service';
import { EcommerceController } from './ecommerce.controller';
import { EcommerceWebhookController } from './ecommerce-webhook.controller';

@Module({
  controllers: [EcommerceController, EcommerceWebhookController],
  providers: [EcommerceService],
  exports: [EcommerceService],
})
export class EcommerceModule {}
