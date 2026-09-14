import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { mkdirSync } from 'fs';
import { extname, join } from 'path';
import { ScanService } from './scan.service';
import {
  ParseOrderSheetDto,
  CreateScanTemplateDto,
  UpdateScanTemplateDto,
  ConfirmStockInDto,
  SaveDraftStockInDto,
  CompleteEnrichmentDto,
} from './dto/scan.dto';
import { CurrentUser, JwtPayload } from '../common/decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

const invoiceUploadDir = join(process.cwd(), 'uploads', 'invoices');
mkdirSync(invoiceUploadDir, { recursive: true });

const ALLOWED_UPLOAD_EXT = new Set([
  '.pdf',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.bmp',
  '.heic',
  '.heif',
  '.txt',
  '.csv',
  '.xlsx',
  '.xls',
]);

const ALLOWED_UPLOAD_MIME = [
  /^application\/pdf$/i,
  /^image\//i,
  /^text\/(plain|csv).*/i,
  /spreadsheetml|ms-excel|csv/i,
];

@ApiTags('scan')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('scan')
export class ScanController {
  constructor(private scan: ScanService) {}

  @Post('parse-order-sheet')
  parseOrderSheet(@CurrentUser() user: JwtPayload, @Body() dto: ParseOrderSheetDto) {
    return this.scan.parseOrderSheet(user.tenantId, dto.text, dto.createCustomer ?? false);
  }

  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: invoiceUploadDir,
        filename: (_req, file, cb) => {
          const safeBase = file.originalname
            .replace(extname(file.originalname), '')
            .replace(/[^a-z0-9_-]/gi, '-')
            .slice(0, 80);
          cb(null, `${Date.now()}-${safeBase}${extname(file.originalname).toLowerCase()}`);
        },
      }),
      limits: { fileSize: 12 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const ext = extname(file.originalname || '').toLowerCase();
        const mimeOk = ALLOWED_UPLOAD_MIME.some((re) => re.test(file.mimetype || ''));
        const extOk = ALLOWED_UPLOAD_EXT.has(ext);
        if (mimeOk || extOk) {
          cb(null, true);
          return;
        }
        cb(
          new Error(
            'Unsupported file type. Use PDF, PNG, JPG, WebP, GIF, TXT, CSV, or Excel (.xlsx/.xls).',
          ) as any,
          false,
        );
      },
    }),
  )
  uploadInvoiceOrOrderSheet(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: any,
    @Body('createCustomer') createCustomer?: string,
    @Body('extractedText') extractedText?: string,
  ) {
    return this.scan.extractUpload(
      user.tenantId,
      file,
      createCustomer === 'true',
      extractedText,
    );
  }

  @Post('parse-purchase')
  parsePurchase(@CurrentUser() user: JwtPayload, @Body() body: { text: string }) {
    return this.scan.parsePurchaseInvoice(user.tenantId, body.text ?? '');
  }

  @Get('uploads/:id')
  getUpload(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.scan.getUpload(user.tenantId, id);
  }

  @Post('confirm-stock-in')
  confirmStockIn(@CurrentUser() user: JwtPayload, @Body() body: ConfirmStockInDto) {
    return this.scan.confirmStockIn(user.tenantId, user.sub, body);
  }

  @Post('drafts')
  saveDraft(@CurrentUser() user: JwtPayload, @Body() body: SaveDraftStockInDto) {
    return this.scan.saveDraft(user.tenantId, body);
  }

  @Get('drafts')
  listDrafts(@CurrentUser() user: JwtPayload) {
    return this.scan.listDrafts(user.tenantId);
  }

  @Get('drafts/:id')
  getDraft(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.scan.getDraft(user.tenantId, id);
  }

  @Delete('drafts/:id')
  discardDraft(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.scan.discardDraft(user.tenantId, id);
  }

  @Get('enrichments')
  listEnrichments(
    @CurrentUser() user: JwtPayload,
    @Query('status') status?: 'PENDING' | 'DONE' | 'SKIPPED' | 'ALL',
  ) {
    return this.scan.listEnrichments(user.tenantId, status ?? 'PENDING');
  }

  @Post('enrichments/:id/complete')
  completeEnrichment(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: CompleteEnrichmentDto,
  ) {
    return this.scan.completeEnrichment(user.tenantId, id, body);
  }

  @Get('products/search')
  searchProducts(@CurrentUser() user: JwtPayload, @Query('q') q?: string) {
    return this.scan.searchProducts(user.tenantId, q ?? '');
  }

  @Get('templates')
  getTemplates(@CurrentUser() user: JwtPayload) {
    return this.scan.getTemplates(user.tenantId);
  }

  @Post('templates')
  createTemplate(@CurrentUser() user: JwtPayload, @Body() dto: CreateScanTemplateDto) {
    return this.scan.createTemplate(user.tenantId, dto);
  }

  @Patch('templates/:id')
  updateTemplate(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateScanTemplateDto,
  ) {
    return this.scan.updateTemplate(user.tenantId, id, dto);
  }

  @Delete('templates/:id')
  deleteTemplate(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.scan.deleteTemplate(user.tenantId, id);
  }
}
