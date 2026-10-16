import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, ForbiddenException } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { StaffService } from './staff.service';
import { CreateStaffDto, UpdateStaffDto, CheckInDto } from './dto/staff.dto';
import { CurrentUser, JwtPayload, Roles } from '../common/decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';

@ApiTags('staff')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('OWNER', 'MANAGER')
@Controller('staff')
export class StaffController {
  constructor(private staff: StaffService) {}

  @Get('attendance')
  attendance(@CurrentUser() user: JwtPayload, @Query('from') from?: string, @Query('to') to?: string) {
    return this.staff.getAttendance(user.tenantId, from, to);
  }

  @Get('attendance/me')
  @Roles('OWNER', 'MANAGER', 'CASHIER', 'TECHNICIAN')
  myAttendance(@CurrentUser() user: JwtPayload) {
    return this.staff.getMyOpenAttendance(user.tenantId, user.sub);
  }

  @Post('attendance/check-in')
  @Roles('OWNER', 'MANAGER', 'CASHIER', 'TECHNICIAN')
  checkIn(@CurrentUser() user: JwtPayload, @Body() body: CheckInDto) {
    return this.staff.checkIn(user.tenantId, user.sub, user.role, body.userId, body.branchId);
  }

  @Post('attendance/:id/check-out')
  @Roles('OWNER', 'MANAGER', 'CASHIER', 'TECHNICIAN')
  checkOut(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.staff.checkOut(user.tenantId, user.sub, user.role, id);
  }

  @Post('attendance/manual')
  recordManualAttendance(
    @CurrentUser() user: JwtPayload,
    @Body() body: { userId: string; branchId: string; checkIn: string; checkOut?: string; notes?: string },
  ) {
    return this.staff.recordManualAttendance(user.tenantId, body);
  }

  @Patch('attendance/:id')
  updateAttendance(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { checkIn?: string; checkOut?: string; notes?: string },
  ) {
    return this.staff.updateAttendance(user.tenantId, id, body);
  }

  @Get(':id/attendance/summary')
  attendanceSummary(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Query('month') month: string) {
    return this.staff.getAttendanceSummary(user.tenantId, id, month);
  }

  @Post('leave')
  @Roles('OWNER', 'MANAGER', 'CASHIER', 'TECHNICIAN')
  requestLeave(
    @CurrentUser() user: JwtPayload,
    @Body() body: { leaveType: string; fromDate: string; toDate: string; reason?: string },
  ) {
    return this.staff.requestLeave(user.tenantId, user.sub, body);
  }

  @Get('leave')
  @Roles('OWNER', 'MANAGER', 'CASHIER', 'TECHNICIAN')
  listLeave(@CurrentUser() user: JwtPayload, @Query('userId') userId?: string, @Query('status') status?: string) {
    return this.staff.listLeave(user.tenantId, user.sub, user.role, { userId, status });
  }

  @Patch('leave/:id/decide')
  decideLeave(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body('decision') decision: 'APPROVED' | 'REJECTED') {
    return this.staff.decideLeave(user.tenantId, user.sub, id, decision);
  }

  @Post('leave/:id/cancel')
  @Roles('OWNER', 'MANAGER', 'CASHIER', 'TECHNICIAN')
  cancelLeave(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.staff.cancelLeave(user.tenantId, user.sub, user.role, id);
  }

  @Get(':id/leave/balance')
  @Roles('OWNER', 'MANAGER', 'CASHIER', 'TECHNICIAN')
  leaveBalance(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Query('year') year?: string) {
    if (user.role !== 'OWNER' && user.role !== 'MANAGER' && user.sub !== id) {
      throw new ForbiddenException('You can only view your own leave balance');
    }
    return this.staff.getLeaveBalance(user.tenantId, id, year ? parseInt(year, 10) : new Date().getFullYear());
  }

  @Get('shifts')
  @Roles('OWNER', 'MANAGER', 'CASHIER', 'TECHNICIAN')
  listShifts(@CurrentUser() user: JwtPayload) {
    return this.staff.listShifts(user.tenantId);
  }

  @Post('shifts')
  createShift(
    @CurrentUser() user: JwtPayload,
    @Body() body: { name: string; startTime: string; endTime: string; branchId?: string },
  ) {
    return this.staff.createShift(user.tenantId, body);
  }

  @Get('roster')
  @Roles('OWNER', 'MANAGER', 'CASHIER', 'TECHNICIAN')
  roster(@CurrentUser() user: JwtPayload, @Query('week') week: string) {
    return this.staff.getRoster(user.tenantId, week);
  }

  @Post('shift-assignments')
  assignShift(@CurrentUser() user: JwtPayload, @Body() body: { userId: string; shiftId: string; date: string }) {
    return this.staff.assignShift(user.tenantId, body);
  }

  @Post('shift-assignments/:id/remove')
  unassignShift(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.staff.unassignShift(user.tenantId, id);
  }

  @Get('payroll')
  listPayroll(@CurrentUser() user: JwtPayload) {
    return this.staff.listPayrollRuns(user.tenantId);
  }

  @Post('payroll/generate')
  generatePayroll(@CurrentUser() user: JwtPayload, @Body() body: { periodStart: string; periodEnd: string }) {
    return this.staff.generatePayroll(user.tenantId, body.periodStart, body.periodEnd);
  }

  @Patch('payroll/:id/finalize')
  finalizePayroll(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.staff.finalizePayroll(user.tenantId, id);
  }

  @Patch('payroll/:runId/payslips/:id/mark-paid')
  markPayslipPaid(@CurrentUser() user: JwtPayload, @Param('runId') runId: string, @Param('id') id: string) {
    return this.staff.markPayslipPaid(user.tenantId, runId, id);
  }

  @Get('payroll/me')
  @Roles('OWNER', 'MANAGER', 'CASHIER', 'TECHNICIAN')
  myPayslips(@CurrentUser() user: JwtPayload) {
    return this.staff.getMyPayslips(user.tenantId, user.sub);
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
      body.commissionPct,
    );
  }

  @Get()
  @Roles('OWNER', 'MANAGER', 'CASHIER', 'TECHNICIAN')
  list(@CurrentUser() user: JwtPayload) {
    return this.staff.listStaff(user.tenantId);
  }

  @Get(':id')
  getOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.staff.getStaffById(user.tenantId, id);
  }

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() body: CreateStaffDto) {
    return this.staff.createStaff(user.tenantId, user.role, body);
  }

  @Patch(':id')
  update(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() body: UpdateStaffDto) {
    return this.staff.updateStaff(user.tenantId, user.role, id, body);
  }
}
