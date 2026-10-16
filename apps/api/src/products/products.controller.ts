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
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiBearerAuth, ApiQuery, ApiConsumes, ApiBody } from '@nestjs/swagger';
import { diskStorage } from 'multer';
import { mkdirSync, readFileSync, unlinkSync } from 'fs';
import { extname, join } from 'path';
import { ProductsService } from './products.service';
import { CreateProductDto, UpdateProductDto, StockAdjustDto, ParseProductLabelDto, UpsertBatchDto } from './dto/product.dto';
import { CurrentUser, JwtPayload } from '../common/decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

const productImportDir = join(process.cwd(), 'uploads', 'product-imports');
mkdirSync(productImportDir, { recursive: true });
const productFilesDir = join(process.cwd(), 'uploads', 'products');
mkdirSync(productFilesDir, { recursive: true });

function productFileStorage() {
  return diskStorage({
    destination: productFilesDir,
    filename: (_req, file, cb) => {
      const safe = file.originalname
        .replace(extname(file.originalname), '')
        .replace(/[^a-z0-9_-]/gi, '-')
        .slice(0, 60);
      cb(null, `${Date.now()}-${safe}${extname(file.originalname).toLowerCase()}`);
    },
  });
}

@ApiTags('products')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('products')
export class ProductsController {
  constructor(private products: ProductsService) {}

  @Get()
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'brand', required: false })
  @ApiQuery({ name: 'supplierId', required: false })
  @ApiQuery({ name: 'gstRate', required: false })
  @ApiQuery({ name: 'lowStock', required: false })
  @ApiQuery({ name: 'outOfStock', required: false })
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('category') category?: string,
    @Query('brand') brand?: string,
    @Query('supplierId') supplierId?: string,
    @Query('gstRate') gstRate?: string,
    @Query('lowStock') lowStock?: string,
    @Query('outOfStock') outOfStock?: string,
  ) {
    const rate =
      gstRate != null && gstRate !== '' && gstRate !== 'all'
        ? Number(gstRate)
        : undefined;
    return this.products.findAll(user.tenantId, {
      search,
      page: page ? parseInt(page) : 1,
      pageSize: pageSize ? parseInt(pageSize) : 50,
      category: category?.trim() || undefined,
      brand: brand?.trim() || undefined,
      supplierId: supplierId?.trim() || undefined,
      gstRate: rate != null && Number.isFinite(rate) ? rate : undefined,
      lowStock: lowStock === 'true' || lowStock === '1',
      outOfStock: outOfStock === 'true' || outOfStock === '1',
    });
  }

  @Get('stock-summary')
  stockSummary(@CurrentUser() user: JwtPayload) {
    return this.products.stockSummary(user.tenantId);
  }

  @Get('facets')
  facets(@CurrentUser() user: JwtPayload) {
    return this.products.facets(user.tenantId);
  }

  @Get('low-stock')
  lowStock(@CurrentUser() user: JwtPayload) {
    return this.products.lowStock(user.tenantId);
  }

  @Get('export')
  exportCsv(@CurrentUser() user: JwtPayload) {
    return this.products.exportCsv(user.tenantId);
  }

  @Get('import/template')
  importTemplate() {
    return this.products.templateCsv();
  }

  @Post('parse-label')
  parseLabel(@Body() dto: ParseProductLabelDto) {
    if (!dto?.text?.trim()) throw new BadRequestException('text is required');
    return this.products.parseLabel(dto.text);
  }

  @Post('attachments')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        asImage: { type: 'string', example: 'true' },
        productId: { type: 'string' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: productFileStorage(),
      limits: { fileSize: 12 * 1024 * 1024 },
    }),
  )
  uploadAttachment(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File,
    @Body('asImage') asImage?: string,
    @Body('productId') productId?: string,
  ) {
    if (!file) throw new BadRequestException('file is required');
    return this.products.storeAttachment(user.tenantId, file, {
      productId: productId?.trim() || undefined,
      asImage: asImage === 'true' || asImage === '1',
    });
  }

  @Post('import')
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        updateStock: { type: 'string', example: 'true' },
        dryRun: { type: 'string', example: 'false' },
      },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: productImportDir,
        filename: (_req, file, cb) => {
          const safeBase = file.originalname
            .replace(extname(file.originalname), '')
            .replace(/[^a-z0-9_-]/gi, '-')
            .slice(0, 80);
          cb(null, `${Date.now()}-${safeBase}${extname(file.originalname).toLowerCase()}`);
        },
      }),
      limits: { fileSize: 8 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const name = (file.originalname || '').toLowerCase();
        const ok =
          name.endsWith('.csv') ||
          name.endsWith('.txt') ||
          name.endsWith('.xlsx') ||
          name.endsWith('.xls') ||
          file.mimetype.includes('csv') ||
          file.mimetype.includes('sheet') ||
          file.mimetype.includes('excel');
        cb(ok ? null : new BadRequestException('Upload a .csv, .xlsx, or .xls file'), ok);
      },
    }),
  )
  async importFile(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: any,
    @Body('updateStock') updateStock?: string,
    @Body('dryRun') dryRun?: string,
  ) {
    if (!file?.path) throw new BadRequestException('file is required');
    try {
      const buffer = readFileSync(file.path);
      return await this.products.importFile(
        user.tenantId,
        { buffer, originalname: file.originalname },
        {
          updateStock: updateStock !== 'false',
          dryRun: dryRun === 'true',
        },
      );
    } finally {
      try {
        unlinkSync(file.path);
      } catch {
        /* ignore cleanup errors */
      }
    }
  }

  @Get('serials/search')
  @ApiQuery({ name: 'q', required: false })
  searchSerials(@CurrentUser() user: JwtPayload, @Query('q') q?: string) {
    return this.products.searchSerials(user.tenantId, q);
  }

  @Get('barcode/:barcode')
  findByBarcode(@CurrentUser() user: JwtPayload, @Param('barcode') barcode: string) {
    return this.products.findByBarcode(user.tenantId, barcode);
  }

  @Get('batches/expiring')
  expiring(
    @CurrentUser() user: JwtPayload,
    @Query('withinDays') withinDays?: string,
  ) {
    return this.products.listExpiringBatches(user.tenantId, Number(withinDays) || 30);
  }

  @Get(':id/batches')
  listBatches(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.products.listBatches(user.tenantId, id);
  }

  @Get(':id/batches/fefo')
  fefoBatches(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.products.fefoBatches(user.tenantId, id);
  }

  @Post(':id/batches')
  upsertBatch(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: UpsertBatchDto,
  ) {
    return this.products.upsertBatch(user.tenantId, id, body);
  }

  @Get(':id/variants')
  variants(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.products.listVariants(user.tenantId, id);
  }

  @Get('inactive')
  listInactive(@CurrentUser() user: JwtPayload) {
    return this.products.listInactive(user.tenantId);
  }

  @Post(':id/restore')
  restore(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.products.restore(user.tenantId, id);
  }

  @Get(':id')
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.products.findOne(user.tenantId, id);
  }

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateProductDto) {
    return this.products.create(user.tenantId, dto);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateProductDto,
  ) {
    return this.products.update(user.tenantId, id, dto);
  }

  @Delete(':id')
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.products.remove(user.tenantId, id);
  }

  @Post(':id/stock')
  adjustStock(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: StockAdjustDto,
  ) {
    return this.products.adjustStock(user.tenantId, id, dto.quantity, 'ADJUSTMENT', dto.notes);
  }
}
