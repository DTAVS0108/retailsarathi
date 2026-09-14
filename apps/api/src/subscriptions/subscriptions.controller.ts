import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SubscriptionsService } from './subscriptions.service';
import { CurrentUser, JwtPayload } from '../common/decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('subscriptions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('subscriptions')
export class SubscriptionsController {
  constructor(private subscriptions: SubscriptionsService) {}

  @Get('plans')
  plans() {
    return this.subscriptions.getPlans();
  }

  @Get('current')
  current(@CurrentUser() user: JwtPayload) {
    return this.subscriptions.getTenantSubscription(user.tenantId);
  }

  @Post('change-plan')
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
  cancel(@CurrentUser() user: JwtPayload) {
    return this.subscriptions.cancelSubscription(user.tenantId);
  }
}
