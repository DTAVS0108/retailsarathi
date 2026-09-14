import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { RemindersCronService } from './reminders-cron.service';
import { InventoryModule } from '../inventory/inventory.module';
import { CustomersModule } from '../customers/customers.module';
import { ProductsModule } from '../products/products.module';

@Module({
  imports: [ScheduleModule.forRoot(), InventoryModule, CustomersModule, ProductsModule],
  providers: [RemindersCronService],
})
export class RemindersModule {}
