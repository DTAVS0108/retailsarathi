import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { InvoicesService } from './invoices.service';
import { CreateInvoiceDto, UpdateTransportDto } from './dto/invoice.dto';
import { CurrentUser, JwtPayload, Roles, Public } from '../common/decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';

@ApiTags('invoices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('invoices')
export class InvoicesController {
  constructor(private invoices: InvoicesService) {}

  @Get()
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('dateFrom') dateFrom?: string,
    @Query('dateTo') dateTo?: string,
    @Query('type') type?: string,
    @Query('paymentMethod') paymentMethod?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
  ) {
    return this.invoices.findAll(
      user.tenantId,
      page ? parseInt(page, 10) : 1,
      pageSize ? parseInt(pageSize, 10) : 50,
      { status, search, dateFrom, dateTo, type, paymentMethod, sortBy, sortDir },
    );
  }

  /** The page a customer's QR scan lands on — no login, keyed by the invoice's own id. */
  @Public()
  @Get('public/:id/view')
  publicView(@Param('id') id: string) {
    return this.invoices.getPublicInvoiceHtml(id);
  }

  /** Save cart as held/draft bill (no stock movement). */
  @Post('hold')
  @Roles('OWNER', 'MANAGER', 'CASHIER')
  hold(@CurrentUser() user: JwtPayload, @Body() dto: CreateInvoiceDto) {
    return this.invoices.hold(user.tenantId, user.branchId ?? dto.branchId!, dto);
  }

  @Post('returns')
  @Roles('OWNER', 'MANAGER', 'CASHIER')
  createReturn(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      originalInvoiceId: string;
      notes?: string;
      processingFee?: number;
      branchId?: string;
      lines: Array<{ invoiceLineId: string; quantity: number }>;
    },
  ) {
    return this.invoices.createCreditNote(
      user.tenantId,
      user.branchId ?? body.branchId!,
      body,
    );
  }

  @Post()
  @Roles('OWNER', 'MANAGER', 'CASHIER')
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateInvoiceDto) {
    return this.invoices.create(user.tenantId, user.branchId ?? dto.branchId!, dto);
  }

  @Get(':id/return-summary')
  returnSummary(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.invoices.getReturnSummary(user.tenantId, id);
  }

  @Get(':id')
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.invoices.findOne(user.tenantId, id);
  }

  @Get(':id/print-html')
  printHtml(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Query('channel') channel?: string,
    @Query('copy') copy?: string,
  ) {
    const ch = channel === 'mobile' ? 'mobile' : 'web';
    const copyKind =
      copy === 'duplicate' || copy === 'triplicate' ? copy : 'original';
    return this.invoices.getPrintHtml(user.tenantId, id, ch, copyKind);
  }

  @Get(':id/download')
  downloadPdf(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.invoices.getDownloadPdf(user.tenantId, id);
  }

  @Get(':id/print')
  printData(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Query('channel') channel?: string,
    @Query('copy') copy?: string,
  ) {
    const ch = channel === 'mobile' ? 'mobile' : 'web';
    const copyKind =
      copy === 'duplicate' || copy === 'triplicate' ? copy : 'original';
    return this.invoices.getPrintData(user.tenantId, id, ch, copyKind);
  }

  @Patch(':id/transport')
  updateTransport(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: UpdateTransportDto,
  ) {
    return this.invoices.updateTransport(user.tenantId, id, body);
  }

  @Get(':id/thermal')
  thermal(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.invoices.getThermalData(user.tenantId, id);
  }

  @Post(':id/warranty-cards')
  warrantyCards(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.invoices.generateWarrantyCards(user.tenantId, id);
  }

  @Post(':id/whatsapp')
  whatsapp(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.invoices.notifyWhatsAppBill(user.tenantId, id);
  }

  @Patch(':id/finalize')
  @Roles('OWNER', 'MANAGER', 'CASHIER')
  finalize(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.invoices.finalize(user.tenantId, id);
  }

  /** Cancel a just-finalized invoice within the POS edit grace window (default 5 minutes). */
  @Patch(':id/undo')
  @Roles('OWNER', 'MANAGER', 'CASHIER')
  undo(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Query('graceMinutes') graceMinutes?: string,
  ) {
    const mins = graceMinutes ? parseInt(graceMinutes, 10) : 5;
    return this.invoices.undoWithinGrace(
      user.tenantId,
      id,
      Number.isFinite(mins) && mins > 0 ? mins : 5,
    );
  }

  /** Cancelling a finalized invoice reverses stock/credit outside the grace window — restrict to management. */
  @Patch(':id/cancel')
  @Roles('OWNER', 'MANAGER')
  cancel(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.invoices.cancel(user.tenantId, id);
  }
}
