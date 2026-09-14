import {
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
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../common/decorators';
import { InventoryService } from './inventory.service';

const billUploadDir = join(process.cwd(), 'uploads', 'purchase-bills');
const paymentUploadDir = join(process.cwd(), 'uploads', 'supplier-payments');
mkdirSync(billUploadDir, { recursive: true });
mkdirSync(paymentUploadDir, { recursive: true });

function diskStorageFor(dir: string) {
  return diskStorage({
    destination: dir,
    filename: (_req, file, cb) => {
      const safe = file.originalname
        .replace(extname(file.originalname), '')
        .replace(/[^a-z0-9_-]/gi, '-')
        .slice(0, 60);
      cb(null, `${Date.now()}-${safe}${extname(file.originalname).toLowerCase()}`);
    },
  });
}

@ApiTags('inventory')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class InventoryController {
  constructor(private inventory: InventoryService) {}

  @Get('suppliers')
  listSuppliers(
    @CurrentUser() user: JwtPayload,
    @Query('includeArchived') includeArchived?: string,
    @Query('q') q?: string,
    @Query('search') search?: string,
    @Query('outstanding') outstanding?: string,
    @Query('sort') sort?: string,
  ) {
    const outstandingRaw = (outstanding || '').trim().toLowerCase();
    const sortRaw = (sort || '').trim().toLowerCase();
    return this.inventory.listSuppliers(user.tenantId, {
      includeArchived: includeArchived === 'true' || includeArchived === '1',
      search: (q || search || '').trim() || undefined,
      outstanding:
        outstandingRaw === 'due' || outstandingRaw === 'clear' || outstandingRaw === 'all'
          ? (outstandingRaw as 'due' | 'clear' | 'all')
          : undefined,
      sort:
        sortRaw === 'name' || sortRaw === 'pending' || sortRaw === 'open'
          ? (sortRaw as 'name' | 'pending' | 'open')
          : undefined,
    });
  }

  @Get('suppliers/aging/report')
  supplierAging(
    @CurrentUser() user: JwtPayload,
    @Query('supplierId') supplierId?: string,
  ) {
    return this.inventory.getSupplierAging(user.tenantId, supplierId?.trim() || undefined);
  }

  @Get('suppliers/dues-calendar')
  duesCalendar(
    @CurrentUser() user: JwtPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    const parse = (v?: string, end = false) => {
      if (!v?.trim()) return undefined;
      const d = new Date(v.trim());
      if (Number.isNaN(d.getTime())) return undefined;
      if (end) d.setHours(23, 59, 59, 999);
      else d.setHours(0, 0, 0, 0);
      return d;
    };
    return this.inventory.getDuesCalendar(user.tenantId, parse(from), parse(to, true));
  }

  @Post('suppliers/reminders/bulk-overdue')
  bulkOverdueReminders(@CurrentUser() user: JwtPayload) {
    return this.inventory.bulkOverdueReminders(user.tenantId, user.sub);
  }

  @Post('suppliers')
  createSupplier(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      name: string;
      phone?: string;
      email?: string;
      gstin?: string;
      address?: string;
      addressLine2?: string;
      city?: string;
      pincode?: string;
      country?: string;
      stateCode?: string;
      bankName?: string;
      bankAccount?: string;
      ifsc?: string;
      bankBranch?: string;
      isMsme?: boolean;
      paymentTermsDays?: number;
    },
  ) {
    return this.inventory.createSupplier(user.tenantId, body);
  }

  @Patch('suppliers/:id')
  updateSupplier(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body()
    body: {
      name?: string;
      phone?: string;
      email?: string;
      gstin?: string;
      address?: string;
      addressLine2?: string | null;
      city?: string | null;
      pincode?: string | null;
      country?: string | null;
      stateCode?: string | null;
      bankName?: string;
      bankAccount?: string;
      ifsc?: string;
      bankBranch?: string;
      isMsme?: boolean;
      paymentTermsDays?: number;
    },
  ) {
    return this.inventory.updateSupplier(user.tenantId, id, body);
  }

  @Get('suppliers/:id')
  getSupplier(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.inventory.getSupplierDetail(user.tenantId, id);
  }

  @Get('suppliers/:id/whatsapp-dues')
  supplierWhatsAppDues(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.inventory.getSupplierWhatsAppDues(user.tenantId, id);
  }

  @Post('suppliers/:id/reminders')
  logSupplierReminder(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.inventory.logSupplierReminder(user.tenantId, id, user.sub);
  }

  @Get('suppliers/:id/reminders')
  listSupplierReminders(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.inventory.listSupplierReminders(user.tenantId, id);
  }

  @Post('suppliers/:id/apply-advance')
  applyAdvance(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { amount?: number; allocations?: Array<{ billId: string; amount: number }> },
  ) {
    return this.inventory.applySupplierAdvance(user.tenantId, id, body || {});
  }

  @Post('suppliers/:id/adjustments')
  supplierAdjustment(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body()
    body: { type: 'DEBIT_NOTE' | 'CREDIT_NOTE'; amount: number; notes?: string; entryDate?: string },
  ) {
    return this.inventory.postSupplierAdjustment(user.tenantId, id, body);
  }

  @Post('suppliers/:id/archive')
  archiveSupplier(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.inventory.archiveSupplier(user.tenantId, id);
  }

  @Post('suppliers/:id/restore')
  restoreSupplier(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.inventory.restoreSupplier(user.tenantId, id);
  }

  @Get('purchase-bills')
  listBills(
    @CurrentUser() user: JwtPayload,
    @Query('supplierId') supplierId?: string,
    @Query('supplierName') supplierName?: string,
    @Query('q') q?: string,
    @Query('search') search?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('createdByUserId') createdByUserId?: string,
    @Query('includeCancelled') includeCancelled?: string,
    @Query('status') status?: string,
    @Query('unpaidOnly') unpaidOnly?: string,
    @Query('agingBucket') agingBucket?: string,
  ) {
    const parseDate = (value?: string, endOfDay = false) => {
      if (!value?.trim()) return undefined;
      const d = new Date(value.trim());
      if (Number.isNaN(d.getTime())) return undefined;
      if (endOfDay) d.setHours(23, 59, 59, 999);
      else d.setHours(0, 0, 0, 0);
      return d;
    };
    return this.inventory.listPurchaseBills(user.tenantId, {
      supplierId: supplierId?.trim() || undefined,
      supplierName: supplierName?.trim() || undefined,
      search: (q || search || '').trim() || undefined,
      dateFrom: parseDate(dateFrom),
      dateTo: parseDate(dateTo, true),
      createdByUserId: createdByUserId?.trim() || undefined,
      status: status?.trim() || undefined,
      includeCancelled: includeCancelled === 'true' || includeCancelled === '1',
      unpaidOnly: unpaidOnly === 'true' || unpaidOnly === '1',
      agingBucket: agingBucket?.trim() || undefined,
    });
  }

  /** Must be registered before purchase-bills/:id */
  @Get('purchase-bills/check-invoice')
  checkPurchaseInvoice(
    @CurrentUser() user: JwtPayload,
    @Query('invoiceNumber') invoiceNumber?: string,
  ) {
    return this.inventory.checkPurchaseInvoice(user.tenantId, invoiceNumber ?? '');
  }

  @Get('purchase-bills/:id')
  getBill(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.inventory.getPurchaseBill(user.tenantId, id);
  }

  @Post('purchase-bills/:id/void')
  voidBill(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    return this.inventory.voidPurchaseBill(user.tenantId, id, body?.reason);
  }

  @Post('purchase-bills/:id/attach')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorageFor(billUploadDir),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  attachBill(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.inventory.attachBillImage(user.tenantId, id, file);
  }

  @Get('supplier-payments')
  listPayments(@CurrentUser() user: JwtPayload, @Query('supplierId') supplierId?: string) {
    return this.inventory.listSupplierPayments(user.tenantId, supplierId);
  }

  @Post('supplier-payments')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorageFor(paymentUploadDir),
      limits: { fileSize: 10 * 1024 * 1024 },
    }),
  )
  recordPayment(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body()
    body: {
      supplierId: string;
      amount: string | number;
      tdsAmount?: string | number;
      method?: string;
      paymentDate?: string;
      referenceNo?: string;
      bankName?: string;
      notes?: string;
      allocationsJson?: string;
      allocations?: Array<{ billId: string; amount: number }>;
    },
  ) {
    let allocations: Array<{ billId: string; amount: number }> | undefined = body.allocations;
    if (!allocations && body.allocationsJson) {
      try {
        allocations = JSON.parse(body.allocationsJson);
      } catch {
        allocations = undefined;
      }
    }
    return this.inventory.recordSupplierPayment(user.tenantId, {
      supplierId: body.supplierId,
      amount: Number(body.amount),
      tdsAmount: body.tdsAmount != null ? Number(body.tdsAmount) : 0,
      method: body.method,
      paymentDate: body.paymentDate,
      referenceNo: body.referenceNo,
      bankName: body.bankName,
      notes: body.notes,
      attachmentPath: file?.path,
      attachmentName: file?.originalname,
      attachmentMime: file?.mimetype,
      allocations,
    });
  }

  @Post('supplier-payments/:id/void')
  voidPayment(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    return this.inventory.voidSupplierPayment(user.tenantId, id, body?.reason);
  }

  @Post('supplier-payments/:id/bounce')
  bouncePayment(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { reason?: string },
  ) {
    return this.inventory.bounceSupplierPayment(user.tenantId, id, body?.reason);
  }

  @Patch('supplier-payments/:id/allocations')
  reallocatePayment(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { allocations: Array<{ billId: string; amount: number }> },
  ) {
    return this.inventory.reallocateSupplierPayment(user.tenantId, id, body?.allocations || []);
  }

  @Get('supplier-payments/:id/receipt')
  paymentReceipt(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.inventory.getSupplierPaymentReceipt(user.tenantId, id);
  }

  @Post('supplier-payments/:id/whatsapp')
  whatsappPaymentReceipt(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.inventory.whatsappSupplierPaymentReceipt(user.tenantId, id);
  }

  @Get('purchase-orders')
  listPos(@CurrentUser() user: JwtPayload, @Query('status') status?: string) {
    return this.inventory.listPurchaseOrders(user.tenantId, status?.trim() || undefined);
  }

  @Post('purchase-orders')
  createPo(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      supplierId?: string;
      notes?: string;
      branchId?: string;
      lines: Array<{ productId: string; quantity: number; unitCost?: number }>;
    },
  ) {
    return this.inventory.createPurchaseOrder(
      user.tenantId,
      user.branchId ?? body.branchId!,
      body,
    );
  }

  @Post('purchase-orders/:id/cancel')
  cancelPo(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.inventory.cancelPurchaseOrder(user.tenantId, id);
  }

  @Post('purchase-orders/:id/receive')
  receivePo(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body()
    body: {
      receipts: Array<{ lineId: string; quantity: number; serialNumbers?: string[] }>;
      createPurchaseBill?: boolean;
      invoiceNumber?: string;
      billAsDraft?: boolean;
    },
  ) {
    return this.inventory.receivePurchaseOrder(user.tenantId, id, body.receipts ?? [], {
      createPurchaseBill: body.createPurchaseBill,
      invoiceNumber: body.invoiceNumber,
      billAsDraft: body.billAsDraft,
    });
  }

  @Get('stock-takes')
  listTakes(@CurrentUser() user: JwtPayload, @Query('status') status?: string) {
    return this.inventory.listStockTakes(user.tenantId, status?.trim() || undefined);
  }

  @Post('stock-takes')
  startTake(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      notes?: string;
      productIds?: string[];
      branchId?: string;
      category?: string;
      abcGrades?: string[];
    },
  ) {
    return this.inventory.startStockTake(user.tenantId, user.branchId ?? body.branchId!, body);
  }

  @Get('stock-takes/abc-cycle')
  abcCycle(@CurrentUser() user: JwtPayload) {
    return this.inventory.getAbcCyclePlan(user.tenantId);
  }

  @Patch('stock-takes/:id/counts')
  updateCounts(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body()
    body: { lines: Array<{ lineId: string; countedQty: number; varianceReason?: string }> },
  ) {
    return this.inventory.updateStockTakeCounts(user.tenantId, id, body.lines ?? []);
  }

  @Post('stock-takes/:id/scan')
  scanCount(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { code: string; increment?: number },
  ) {
    return this.inventory.scanStockTakeCount(user.tenantId, id, body.code ?? '', {
      increment: body.increment,
    });
  }

  @Post('stock-takes/:id/complete')
  completeTake(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body?: { forceComplete?: boolean },
  ) {
    return this.inventory.completeStockTake(user.tenantId, id, {
      forceComplete: body?.forceComplete,
      approvedByUserId: user.sub,
    });
  }

  @Post('stock-takes/:id/approve')
  approveTake(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.inventory.approveStockTake(user.tenantId, id, user.sub);
  }

  @Post('stock-takes/:id/cancel')
  cancelTake(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.inventory.cancelStockTake(user.tenantId, id);
  }

  @Get('purchase-register')
  purchaseRegister(
    @CurrentUser() user: JwtPayload,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
  ) {
    const parse = (v?: string, end = false) => {
      if (!v?.trim()) return undefined;
      const d = new Date(v.trim());
      if (Number.isNaN(d.getTime())) return undefined;
      if (end) d.setHours(23, 59, 59, 999);
      else d.setHours(0, 0, 0, 0);
      return d;
    };
    return this.inventory.getPurchaseRegister(user.tenantId, {
      dateFrom: parse(dateFrom),
      dateTo: parse(dateTo, true),
    });
  }

  @Post('purchase-bills/:id/post-draft')
  postDraft(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body?: { invoiceNumber?: string },
  ) {
    return this.inventory.postDraftPurchaseBill(user.tenantId, id, body?.invoiceNumber);
  }
}
