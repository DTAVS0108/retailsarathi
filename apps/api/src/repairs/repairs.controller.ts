import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { mkdirSync } from 'fs';
import { extname, join } from 'path';
import { RepairsService } from './repairs.service';
import {
  CreateRepairJobDto,
  UpdateRepairStatusDto,
  AddRepairPartDto,
  AssignTechnicianDto,
  UpdateRepairPhotosDto,
  BulkDeleteRepairRecordsDto,
} from './dto/repair.dto';
import { LoanerDevicesService } from '../loaner-devices/loaner-devices.service';
import { CheckoutLoanerDeviceDto, ReturnLoanerDeviceDto } from '../loaner-devices/dto/loaner-device.dto';
import { CurrentUser, JwtPayload, Roles, Public } from '../common/decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';

const repairUploadDir = join(process.cwd(), 'uploads', 'repairs');
mkdirSync(repairUploadDir, { recursive: true });

@ApiTags('repairs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('repairs')
export class RepairsController {
  constructor(
    private repairs: RepairsService,
    private loanerDevices: LoanerDevicesService,
  ) {}

  @Get()
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: string,
    @Query('branchId') branchId?: string,
  ) {
    return this.repairs.findAll(user.tenantId, status, branchId);
  }

  @Get('technicians/workload')
  technicianWorkload(@CurrentUser() user: JwtPayload) {
    return this.repairs.getTechnicianWorkload(user.tenantId);
  }

  /** All-time, filterable, sortable, paginated view of every repair job — for the Records page. */
  @Get('records')
  records(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('technicianId') technicianId?: string,
    @Query('serviceTypeId') serviceTypeId?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
  ) {
    return this.repairs.findRecords(user.tenantId, {
      page: page ? parseInt(page, 10) : 1,
      pageSize: pageSize ? parseInt(pageSize, 10) : 25,
      status,
      search,
      dateFrom,
      dateTo,
      technicianId,
      serviceTypeId,
      sortBy,
      sortDir,
    });
  }

  /** Permanently deletes matching repair job records — by explicit ids or by filter criteria. */
  @Post('records/bulk-delete')
  @Roles('OWNER', 'MANAGER')
  bulkDeleteRecords(@CurrentUser() user: JwtPayload, @Body() dto: BulkDeleteRepairRecordsDto) {
    return this.repairs.deleteRecords(user.tenantId, dto);
  }

  /**
   * Public "now serving" board for a counter screen — no login (the device sitting at the
   * counter shouldn't need a staff session), and deliberately returns only job numbers/status,
   * never customer names, phone numbers, or amounts. Keyed by the shop's readable slug (e.g.
   * "tyagi-electric-works"), not the internal tenant id, so the URL looks like a real product URL.
   */
  @Public()
  @Get('public-queue/:slug')
  publicQueue(@Param('slug') slug: string, @Query('branchId') branchId?: string) {
    return this.repairs.getPublicQueue(slug, branchId);
  }

  @Get(':id')
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.repairs.findOne(user.tenantId, id);
  }

  @Get(':id/token-print-html')
  tokenPrintHtml(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.repairs.getTokenPrintHtml(user.tenantId, id);
  }

  @Get(':id/token-thermal')
  tokenThermal(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.repairs.getTokenThermal(user.tenantId, id);
  }

  @Post()
  @Roles('OWNER', 'MANAGER', 'CASHIER')
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateRepairJobDto) {
    return this.repairs.create(user.tenantId, user.branchId!, dto);
  }

  @Patch(':id/status')
  @Roles('OWNER', 'MANAGER', 'CASHIER', 'TECHNICIAN')
  updateStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateRepairStatusDto,
  ) {
    return this.repairs.updateStatus(user.tenantId, id, dto, user.role);
  }

  @Patch(':id/technician')
  @Roles('OWNER', 'MANAGER')
  assignTechnician(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: AssignTechnicianDto,
  ) {
    return this.repairs.assignTechnician(user.tenantId, id, dto.technicianId);
  }

  @Patch(':id/advance')
  @Roles('OWNER', 'MANAGER', 'CASHIER')
  recordAdvance(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body('amount') amount: number,
  ) {
    return this.repairs.recordAdvance(user.tenantId, id, Number(amount));
  }

  @Patch(':id/photos')
  @Roles('OWNER', 'MANAGER', 'CASHIER', 'TECHNICIAN')
  updatePhotos(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateRepairPhotosDto,
  ) {
    return this.repairs.updatePhotos(user.tenantId, id, dto.photoUrls);
  }

  /** Upload device/condition photo or PDF; appends to photoUrls. */
  @Post(':id/photos')
  @Roles('OWNER', 'MANAGER', 'CASHIER', 'TECHNICIAN')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: repairUploadDir,
        filename: (_req, file, cb) => {
          const safe = file.originalname
            .replace(extname(file.originalname), '')
            .replace(/[^a-z0-9_-]/gi, '-')
            .slice(0, 60);
          cb(null, `${Date.now()}-${safe}${extname(file.originalname).toLowerCase()}`);
        },
      }),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  uploadPhoto(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) throw new BadRequestException('file is required');
    return this.repairs.uploadPhoto(user.tenantId, id, file);
  }

  @Post(':id/parts')
  @Roles('OWNER', 'MANAGER', 'TECHNICIAN')
  addPart(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: AddRepairPartDto,
  ) {
    return this.repairs.addPart(user.tenantId, id, dto);
  }

  @Post(':id/send-estimate')
  @Roles('OWNER', 'MANAGER', 'CASHIER')
  sendEstimate(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.repairs.sendEstimate(user.tenantId, id);
  }

  @Post(':id/create-invoice')
  @Roles('OWNER', 'MANAGER', 'CASHIER')
  createInvoice(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.repairs.createInvoiceFromRepair(user.tenantId, user.branchId!, id);
  }

  @Post(':id/loaner/checkout')
  @Roles('OWNER', 'MANAGER', 'CASHIER', 'TECHNICIAN')
  checkoutLoaner(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CheckoutLoanerDeviceDto,
  ) {
    return this.loanerDevices.checkout(user.tenantId, id, dto);
  }

  @Post(':id/loaner/return')
  @Roles('OWNER', 'MANAGER', 'CASHIER', 'TECHNICIAN')
  async returnLoaner(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ReturnLoanerDeviceDto,
  ) {
    const active = await this.loanerDevices.getActiveCheckoutForJob(user.tenantId, id);
    if (!active || active.returnedAt) {
      throw new BadRequestException('No active loaner checkout for this job');
    }
    return this.loanerDevices.returnLoaner(user.tenantId, active.id, dto);
  }
}
