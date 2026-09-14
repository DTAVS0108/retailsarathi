import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { StaffService } from './staff.service';
import { CurrentUser, JwtPayload } from '../common/decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('staff')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('staff')
export class StaffController {
  constructor(private staff: StaffService) {}

  @Get('attendance')
  attendance(@CurrentUser() user: JwtPayload, @Query('from') from?: string, @Query('to') to?: string) {
    return this.staff.getAttendance(user.tenantId, from, to);
  }

  @Post('attendance/check-in')
  checkIn(
    @CurrentUser() user: JwtPayload,
    @Body() body: { userId: string; branchId: string },
  ) {
    return this.staff.checkIn(user.tenantId, body.userId, body.branchId);
  }

  @Post('attendance/:id/check-out')
  checkOut(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.staff.checkOut(user.tenantId, id);
  }

  @Post('commissions/calculate')
  commissions(
    @CurrentUser() user: JwtPayload,
    @Body() body: { periodStart: string; periodEnd: string; commissionPct?: number },
  ) {
    return this.staff.calculateCommissions(
      user.tenantId,
      body.periodStart,
      body.periodEnd,
      body.commissionPct ?? 2,
    );
  }

  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.staff.listStaff(user.tenantId);
  }

  @Post()
  create(
    @CurrentUser() user: JwtPayload,
    @Body() body: { name: string; email: string; password: string; role: string; branchId?: string },
  ) {
    return this.staff.createStaff(user.tenantId, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { name?: string; role?: string; branchId?: string; isActive?: boolean },
  ) {
    return this.staff.updateStaff(user.tenantId, id, body);
  }
}
