import { Module } from '@nestjs/common';
import { TradeInService } from './tradein.service';
import { TradeInController } from './tradein.controller';

@Module({
  controllers: [TradeInController],
  providers: [TradeInService],
  exports: [TradeInService],
})
export class TradeInModule {}
