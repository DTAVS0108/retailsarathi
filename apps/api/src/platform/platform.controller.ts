import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PlatformService } from './platform.service';
import { PlatformAdminGuard } from './platform-admin.guard';
import { Public, CurrentPlatformAdmin, PlatformAdminPayload } from '../common/decorators';

@ApiTags('platform')
@Controller('platform')
export class PlatformController {
  constructor(private platform: PlatformService) {}

  @Public()
  @Post('auth/login')
  login(@Body() body: { email: string; password: string }) {
    return this.platform.login(body.email, body.password);
  }

  @Public()
  @Post('auth/seed')
  seed(@Body() body: { email: string; password: string; name: string }) {
    return this.platform.seedAdmin(body.email, body.password, body.name);
  }

  @UseGuards(PlatformAdminGuard)
  @Get('tenants')
  tenants(
    @Query('search') search?: string,
    @Query('plan') plan?: string,
    @Query('status') status?: string,
  ) {
    return this.platform.listTenants({ search, plan, status });
  }

  @UseGuards(PlatformAdminGuard)
  @Get('tenants/:id')
  tenantDetail(@Param('id') id: string) {
    return this.platform.getTenantDetail(id);
  }

  @UseGuards(PlatformAdminGuard)
  @Post('tenants/:id/suspend')
  suspendTenant(
    @CurrentPlatformAdmin() admin: PlatformAdminPayload,
    @Param('id') id: string,
    @Body('reason') reason?: string,
  ) {
    return this.platform.suspendTenant(id, admin.sub, reason);
  }

  @UseGuards(PlatformAdminGuard)
  @Post('tenants/:id/reactivate')
  reactivateTenant(@CurrentPlatformAdmin() admin: PlatformAdminPayload, @Param('id') id: string) {
    return this.platform.reactivateTenant(id, admin.sub);
  }

  @UseGuards(PlatformAdminGuard)
  @Get('stats')
  stats() {
    return this.platform.getPlatformStats();
  }

  @UseGuards(PlatformAdminGuard)
  @Get('tickets')
  tickets(@Query('status') status?: string) {
    return this.platform.listTickets(status);
  }

  @UseGuards(PlatformAdminGuard)
  @Patch('tickets/:id')
  updateTicket(
    @CurrentPlatformAdmin() admin: PlatformAdminPayload,
    @Param('id') id: string,
    @Body('status') status: string,
  ) {
    return this.platform.updateTicket(id, status, admin.sub);
  }

  @UseGuards(PlatformAdminGuard)
  @Get('audit-log')
  auditLog() {
    return this.platform.getAuditLog();
  }
}
