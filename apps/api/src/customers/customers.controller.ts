import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { CustomersService } from './customers.service';
import { CreateCustomerDto, UpdateCustomerDto } from './dto/customer.dto';
import { CurrentUser, JwtPayload } from '../common/decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('customers')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('customers')
export class CustomersController {
  constructor(private customers: CustomersService) {}

  @Get()
  findAll(
    @CurrentUser() user: JwtPayload,
    @Query('search') search?: string,
    @Query('segment') segment?: string,
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('stateCode') stateCode?: string,
    @Query('outstanding') outstanding?: string,
    @Query('hasGstin') hasGstin?: string,
    @Query('hasLoyalty') hasLoyalty?: string,
    @Query('sortBy') sortBy?: string,
    @Query('sortDir') sortDir?: string,
  ) {
    return this.customers.findAll(user.tenantId, {
      search,
      segment,
      stateCode,
      outstanding,
      hasGstin,
      hasLoyalty,
      sortBy,
      sortDir,
      page: page ? parseInt(page, 10) : undefined,
      pageSize: pageSize ? parseInt(pageSize, 10) : undefined,
    });
  }

  @Get('aging/report')
  aging(@CurrentUser() user: JwtPayload, @Query('customerId') customerId?: string) {
    return this.customers.getAging(user.tenantId, customerId);
  }

  @Post('payments/:paymentId/void')
  voidPayment(
    @CurrentUser() user: JwtPayload,
    @Param('paymentId') paymentId: string,
    @Body() body: { reason?: string },
  ) {
    return this.customers.voidCustomerPayment(user.tenantId, paymentId, body?.reason);
  }

  @Get(':id')
  findOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.customers.findOne(user.tenantId, id);
  }

  @Get(':id/statement')
  statement(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.customers.getStatement(user.tenantId, id);
  }

  @Get(':id/open-invoices')
  openInvoices(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.customers.getOpenCreditInvoices(user.tenantId, id);
  }

  @Post(':id/reminders')
  remind(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.customers.logCustomerReminder(user.tenantId, id, user.sub);
  }

  @Post(':id/whatsapp-statement')
  whatsappStatement(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.customers.whatsappStatement(user.tenantId, id);
  }

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateCustomerDto) {
    return this.customers.create(user.tenantId, dto, user.sub);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateCustomerDto,
  ) {
    return this.customers.update(user.tenantId, id, dto, user.sub);
  }

  @Post(':id/loyalty/redeem')
  redeemLoyalty(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body('points') points: number,
  ) {
    return this.customers.redeemLoyalty(user.tenantId, id, Number(points));
  }

  @Post(':id/collect')
  collect(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body()
    body: {
      amount: number | string;
      method?: string;
      reference?: string;
      notes?: string;
      paymentDate?: string;
      bankName?: string;
      allocationsJson?: string;
      allocations?: Array<{ invoiceId: string; amount: number }>;
    },
  ) {
    let allocations = body.allocations;
    if (!allocations && body.allocationsJson) {
      try {
        allocations = JSON.parse(body.allocationsJson);
      } catch {
        allocations = undefined;
      }
    }
    return this.customers.collectPayment(user.tenantId, id, {
      amount: Number(body.amount),
      method: body.method,
      reference: body.reference,
      notes: body.notes,
      paymentDate: body.paymentDate,
      bankName: body.bankName,
      allocations,
    });
  }
}
