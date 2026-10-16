import { Module, forwardRef } from '@nestjs/common';
import { RepairsService } from './repairs.service';
import { RepairsController } from './repairs.controller';
import { RepairServiceTypesService } from './repair-service-types.service';
import { RepairServiceTypesController } from './repair-service-types.controller';
import { NotificationsModule } from '../notifications/notifications.module';
import { InvoicesModule } from '../invoices/invoices.module';
import { LoanerDevicesModule } from '../loaner-devices/loaner-devices.module';

@Module({
  imports: [NotificationsModule, forwardRef(() => InvoicesModule), LoanerDevicesModule],
  controllers: [RepairsController, RepairServiceTypesController],
  providers: [RepairsService, RepairServiceTypesService],
  exports: [RepairsService],
})
export class RepairsModule {}
