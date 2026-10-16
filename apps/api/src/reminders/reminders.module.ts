import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { RemindersCronService } from './reminders-cron.service';
import { InventoryModule } from '../inventory/inventory.module';
import { CustomersModule } from '../customers/customers.module';
import { ProductsModule } from '../products/products.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    InventoryModule,
    CustomersModule,
    ProductsModule,
    NotificationsModule,
  ],
  providers: [RemindersCronService],
})
export class RemindersModule {}
