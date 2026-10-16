import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { ComplianceService } from './compliance.service';
import { CurrentUser, JwtPayload, Roles } from '../common/decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';

@ApiTags('compliance')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('OWNER', 'MANAGER')
@Controller('compliance')
export class ComplianceController {
  constructor(private compliance: ComplianceService) {}

  @Get('audit-log')
  auditLog(@CurrentUser() user: JwtPayload, @Query('limit') limit?: string) {
    return this.compliance.getAuditLogs(user.tenantId, parseInt(limit ?? '100', 10));
  }

  @Get('einvoice/status')
  @Roles('OWNER', 'MANAGER', 'CASHIER')
  einvoiceStatus() {
    return this.compliance.getEinvoiceStatus();
  }

  @Get('invoices/:id/qr')
  @Roles('OWNER', 'MANAGER', 'CASHIER')
  invoiceQr(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.compliance.generateInvoiceQr(user.tenantId, id);
  }

  @Post('invoices/:id/einvoice')
  @Roles('OWNER', 'MANAGER', 'CASHIER')
  einvoice(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.compliance.requestEinvoice(user.tenantId, id, user.sub);
  }

  @Post('invoices/:id/eway-bill')
  @Roles('OWNER', 'MANAGER', 'CASHIER')
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
