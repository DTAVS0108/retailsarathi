import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ComplianceService } from './compliance.service';
import { CurrentUser, JwtPayload } from '../common/decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('compliance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('compliance')
export class ComplianceController {
  constructor(private compliance: ComplianceService) {}

  @Get('audit-log')
  auditLog(@CurrentUser() user: JwtPayload, @Query('limit') limit?: string) {
    return this.compliance.getAuditLogs(user.tenantId, parseInt(limit ?? '100', 10));
  }

  @Get('einvoice/status')
  einvoiceStatus() {
    return this.compliance.getEinvoiceStatus();
  }

  @Get('invoices/:id/qr')
  invoiceQr(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.compliance.generateInvoiceQr(user.tenantId, id);
  }

  @Post('invoices/:id/einvoice')
  einvoice(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.compliance.requestEinvoice(user.tenantId, id, user.sub);
  }

  @Post('invoices/:id/eway-bill')
  ewayBill(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body('distanceKm') distanceKm: number,
    @Body('vehicleNo') vehicleNo?: string,
  ) {
    return this.compliance.ewayBillHelper(
      user.tenantId,
      id,
      Number(distanceKm ?? 0),
      user.sub,
      vehicleNo,
    );
  }
}
