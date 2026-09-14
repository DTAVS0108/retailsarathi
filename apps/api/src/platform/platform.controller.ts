import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { PlatformService } from './platform.service';
import { PlatformAdminGuard } from './platform-admin.guard';
import { Public } from '../common/decorators';

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
  tenants() {
    return this.platform.listTenants();
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
  updateTicket(@Param('id') id: string, @Body('status') status: string) {
    return this.platform.updateTicket(id, status);
  }
}
