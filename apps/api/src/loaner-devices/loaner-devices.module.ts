import { Module } from '@nestjs/common';
import { LoanerDevicesService } from './loaner-devices.service';
import { LoanerDevicesController } from './loaner-devices.controller';

@Module({
  controllers: [LoanerDevicesController],
  providers: [LoanerDevicesService],
  exports: [LoanerDevicesService],
})
export class LoanerDevicesModule {}
