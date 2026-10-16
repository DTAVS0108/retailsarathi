import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { TenantsService } from './tenants.service';
import { InvoiceNumberingService } from '../invoices/invoice-numbering.service';
import { CurrentUser, JwtPayload, Roles } from '../common/decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';
import { TENANT_LOGOS_TMP, isAllowedLogoMime } from './tenant-logo.util';

@ApiTags('tenants')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('OWNER', 'MANAGER')
@Controller('tenants')
export class TenantsController {
  constructor(
    private tenants: TenantsService,
    private numbering: InvoiceNumberingService,
  ) {}

  /** Broadly readable — POS/Scan/Repairs/branding need shop name+GSTIN for every role; bank/UPI
      fields are redacted for non-OWNER/MANAGER callers inside the service. */
  @Get('profile')
  @Roles('OWNER', 'MANAGER', 'CASHIER', 'TECHNICIAN')
  getProfile(@CurrentUser() user: JwtPayload) {
    return this.tenants.getProfile(user.tenantId, user.role);
  }

  @Get('billing-templates')
  billingTemplates() {
    return this.tenants.listBillingTemplates();
  }

  /** Route-level: OWNER/MANAGER (class default). Value-level inside the service: the GSTIN/bank/
      UPI subset of this shared settings form is further restricted to OWNER only. */
  @Patch('profile')
  updateProfile(@CurrentUser() user: JwtPayload, @Body() body: Record<string, unknown>) {
    return this.tenants.updateProfile(user.tenantId, body, user.role);
  }

  @Post('logo')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: TENANT_LOGOS_TMP,
        filename: (_req, file, cb) => {
          const safe = file.originalname
            .replace(extname(file.originalname), '')
            .replace(/[^a-z0-9_-]/gi, '-')
            .slice(0, 40);
          cb(null, `${Date.now()}-${safe}${extname(file.originalname).toLowerCase()}`);
        },
      }),
      limits: { fileSize: 2 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        cb(null, isAllowedLogoMime(file.mimetype));
      },
    }),
  )
  uploadLogo(@CurrentUser() user: JwtPayload, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('file is required');
    return this.tenants.uploadLogo(user.tenantId, file);
  }

  @Delete('logo')
  deleteLogo(@CurrentUser() user: JwtPayload) {
    return this.tenants.deleteLogo(user.tenantId);
  }

  @Get('numbering-status')
  numberingStatus(@CurrentUser() user: JwtPayload) {
    return this.numbering.getStatus(user.tenantId);
  }

  /** Every role's landing page after login — must stay readable by all 4 roles. */
  @Get('dashboard')
  @Roles('OWNER', 'MANAGER', 'CASHIER', 'TECHNICIAN')
  dashboard(@CurrentUser() user: JwtPayload) {
    return this.tenants.getDashboardStats(user.tenantId);
  }
}
