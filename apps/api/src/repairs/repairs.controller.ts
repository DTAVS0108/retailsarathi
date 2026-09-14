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
} from './dto/repair.dto';
import { CurrentUser, JwtPayload } from '../common/decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

const repairUploadDir = join(process.cwd(), 'uploads', 'repairs');
mkdirSync(repairUploadDir, { recursive: true });

@ApiTags('repairs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('repairs')
export class RepairsController {
  constructor(private repairs: RepairsService) {}

  @Get()
  findAll(@CurrentUser() user: JwtPayload, @Query('status') status?: string) {
    return this.repairs.findAll(user.tenantId, status);
  }

  @Get(':id')
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.repairs.findOne(user.tenantId, id);
  }

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateRepairJobDto) {
    return this.repairs.create(user.tenantId, user.branchId!, dto);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateRepairStatusDto,
  ) {
    return this.repairs.updateStatus(user.tenantId, id, dto);
  }

  @Patch(':id/technician')
  assignTechnician(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: AssignTechnicianDto,
  ) {
    return this.repairs.assignTechnician(user.tenantId, id, dto.technicianId);
  }

  @Patch(':id/photos')
  updatePhotos(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateRepairPhotosDto,
  ) {
    return this.repairs.updatePhotos(user.tenantId, id, dto.photoUrls);
  }

  /** Upload device/condition photo or PDF; appends to photoUrls. */
  @Post(':id/photos')
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
  addPart(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: AddRepairPartDto,
  ) {
    return this.repairs.addPart(user.tenantId, id, dto);
  }

  @Post(':id/send-estimate')
  sendEstimate(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.repairs.sendEstimate(user.tenantId, id);
  }

  @Post(':id/create-invoice')
  createInvoice(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.repairs.createInvoiceFromRepair(user.tenantId, user.branchId!, id);
  }
}
