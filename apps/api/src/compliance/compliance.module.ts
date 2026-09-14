import { Module } from '@nestjs/common';
import { ComplianceService } from './compliance.service';
import { ComplianceController } from './compliance.controller';
import { AuditService } from '../common/audit.service';
import { EinvoiceGspClient } from './einvoice-gsp.client';

@Module({
  controllers: [ComplianceController],
  providers: [ComplianceService, AuditService, EinvoiceGspClient],
  exports: [ComplianceService, AuditService, EinvoiceGspClient],
})
export class ComplianceModule {}
