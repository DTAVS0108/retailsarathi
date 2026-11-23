import { Module } from '@nestjs/common';
import { BankReconcileController } from './bank-reconcile.controller';
import { BankReconcileService } from './bank-reconcile.service';

@Module({
  controllers: [BankReconcileController],
  providers: [BankReconcileService],
  exports: [BankReconcileService],
})
export class BankReconcileModule {}
