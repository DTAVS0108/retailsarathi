import { Module } from '@nestjs/common';
import { Gstr2bController } from './gstr2b.controller';
import { Gstr2bService } from './gstr2b.service';

@Module({
  controllers: [Gstr2bController],
  providers: [Gstr2bService],
  exports: [Gstr2bService],
})
export class Gstr2bModule {}
