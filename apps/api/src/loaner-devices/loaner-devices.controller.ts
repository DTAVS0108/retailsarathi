import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { LoanerDevicesService } from './loaner-devices.service';
import { CreateLoanerDeviceDto, UpdateLoanerDeviceDto } from './dto/loaner-device.dto';
import { CurrentUser, JwtPayload, Roles } from '../common/decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';

/** Pool CRUD (add/retire loaner devices). Checkout/return live on RepairsController, nested under
 *  the repair job they belong to (POST /repairs/:id/loaner/checkout|return) — the pool itself is
 *  conceptually independent of any one job. */
@ApiTags('loaner-devices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('loaner-devices')
export class LoanerDevicesController {
  constructor(private loanerDevices: LoanerDevicesService) {}

  @Get()
  findAll(@CurrentUser() user: JwtPayload, @Query('status') status?: string) {
    return this.loanerDevices.findAll(user.tenantId, status);
  }

  @Post()
  @Roles('OWNER', 'MANAGER')
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateLoanerDeviceDto) {
    return this.loanerDevices.create(user.tenantId, dto);
  }

  @Patch(':id')
  @Roles('OWNER', 'MANAGER')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateLoanerDeviceDto,
  ) {
    return this.loanerDevices.update(user.tenantId, id, dto);
  }
}
