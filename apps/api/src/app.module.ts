import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ProductsModule } from './products/products.module';
import { CustomersModule } from './customers/customers.module';
import { InvoicesModule } from './invoices/invoices.module';
import { GstModule } from './gst/gst.module';
import { SyncModule } from './sync/sync.module';
import { WholesaleModule } from './wholesale/wholesale.module';
import { NotificationsModule } from './notifications/notifications.module';
import { RepairsModule } from './repairs/repairs.module';
import { AccountingModule } from './accounting/accounting.module';
import { TenantsModule } from './tenants/tenants.module';
import { ScanModule } from './scan/scan.module';
import { UsersModule } from './users/users.module';
import { AnalyticsModule } from './analytics/analytics.module';
import { AiModule } from './ai/ai.module';
import { BranchesModule } from './branches/branches.module';
import { EcommerceModule } from './ecommerce/ecommerce.module';
import { HardwareModule } from './hardware/hardware.module';
import { ComplianceModule } from './compliance/compliance.module';
import { StaffModule } from './staff/staff.module';
import { TradeInModule } from './tradein/tradein.module';
import { SubscriptionsModule } from './subscriptions/subscriptions.module';
import { PlatformModule } from './platform/platform.module';
import { InventoryModule } from './inventory/inventory.module';
import { ReportsModule } from './reports/reports.module';
import { CategoriesModule } from './categories/categories.module';
import { BankReconcileModule } from './bank-reconcile/bank-reconcile.module';
import { Gstr2bModule } from './gstr2b/gstr2b.module';
import { PartiesModule } from './parties/parties.module';
import { RemindersModule } from './reminders/reminders.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    TenantsModule,
    ProductsModule,
    CategoriesModule,
    CustomersModule,
    InvoicesModule,
    GstModule,
    SyncModule,
    WholesaleModule,
    NotificationsModule,
    RepairsModule,
    AccountingModule,
    ScanModule,
    UsersModule,
    AnalyticsModule,
    AiModule,
    BranchesModule,
    EcommerceModule,
    HardwareModule,
    ComplianceModule,
    StaffModule,
    TradeInModule,
    SubscriptionsModule,
    PlatformModule,
    InventoryModule,
    ReportsModule,
    BankReconcileModule,
    Gstr2bModule,
    PartiesModule,
    RemindersModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
