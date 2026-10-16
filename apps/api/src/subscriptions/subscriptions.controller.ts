import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SubscriptionsService } from './subscriptions.service';
import { CurrentUser, JwtPayload, Roles } from '../common/decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';

@ApiTags('subscriptions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('OWNER', 'MANAGER')
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private subscriptions: SubscriptionsService) {}

  @Get('plans')
  @Roles('OWNER', 'MANAGER', 'CASHIER', 'TECHNICIAN')
  plans() {
    return this.subscriptions.getPlans();
  }

  @Get('current')
  current(@CurrentUser() user: JwtPayload) {
    return this.subscriptions.getTenantSubscription(user.tenantId);
  }

  @Get('invoices')
  invoices(@CurrentUser() user: JwtPayload) {
    return this.subscriptions.listInvoices(user.tenantId);
  }

  /** Billing-affecting and can disable tenant-wide features — stricter than the section default,
      only OWNER (not MANAGER). */
  @Post('change-plan')
  @Roles('OWNER')
  changePlan(
    @CurrentUser() user: JwtPayload,
    @Body() body: { planCode?: string },
  ) {
    return this.subscriptions.changePlan(user.tenantId, body.planCode ?? '');
  }

  @Post('enterprise-contact')
  enterpriseContact(
    @CurrentUser() user: JwtPayload,
    @Body() body: { name?: string; phone?: string; email?: string; message?: string },
  ) {
    return this.subscriptions.requestEnterpriseContact(user.tenantId, {
      name: body.name ?? '',
      phone: body.phone,
      email: body.email,
      message: body.message,
    });
  }

  @Post('cancel')
  @Roles('OWNER')
  cancel(@CurrentUser() user: JwtPayload) {
    return this.subscriptions.cancelSubscription(user.tenantId);
  }
}
