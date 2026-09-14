import { Module } from '@nestjs/common';
import { InvoicesService } from './invoices.service';
import { InvoicesController } from './invoices.controller';
import { InvoiceNumberingService } from './invoice-numbering.service';
import { WholesaleModule } from '../wholesale/wholesale.module';
import { AccountingModule } from '../accounting/accounting.module';
import { CustomersModule } from '../customers/customers.module';

@Module({
  imports: [WholesaleModule, AccountingModule, CustomersModule],
  controllers: [InvoicesController],
  providers: [InvoicesService, InvoiceNumberingService],
  exports: [InvoicesService, InvoiceNumberingService],
})
export class InvoicesModule {}
