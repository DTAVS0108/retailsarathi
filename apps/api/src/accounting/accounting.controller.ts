import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AccountingService } from './accounting.service';
import { CreateJournalEntryDto, CreateAccountDto } from './dto/accounting.dto';
import { CurrentUser, JwtPayload } from '../common/decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('accounting')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('accounting')
export class AccountingController {
  constructor(private accounting: AccountingService) {}

  @Get('accounts')
  getAccounts(@CurrentUser() user: JwtPayload) {
    return this.accounting.getAccounts(user.tenantId);
  }

  @Post('accounts')
  createAccount(@CurrentUser() user: JwtPayload, @Body() dto: CreateAccountDto) {
    return this.accounting.createAccount(user.tenantId, dto);
  }

  @Post('accounts/seed')
  seedAccounts(@CurrentUser() user: JwtPayload) {
    return this.accounting.seedDefaultAccounts(user.tenantId);
  }

  @Get('journal')
  getJournal(
    @CurrentUser() user: JwtPayload,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.accounting.getJournalEntries(user.tenantId, from, to);
  }

  @Post('journal')
  createEntry(@CurrentUser() user: JwtPayload, @Body() dto: CreateJournalEntryDto) {
    return this.accounting.createJournalEntry(user.tenantId, dto);
  }

  @Get('reports/pnl')
  pnl(
    @CurrentUser() user: JwtPayload,
    @Query('from') from: string,
    @Query('to') to: string,
  ) {
    return this.accounting.getProfitAndLoss(user.tenantId, from, to);
  }

  @Get('reports/balance-sheet')
  balanceSheet(@CurrentUser() user: JwtPayload, @Query('asOf') asOf: string) {
    return this.accounting.getBalanceSheet(user.tenantId, asOf);
  }

  @Get('itr-prep')
  itrPrep(@CurrentUser() user: JwtPayload, @Query('fy') fy: string) {
    return this.accounting.getItrPrepSummary(user.tenantId, fy);
  }

  @Get('itr-prep/export')
  itrExport(@CurrentUser() user: JwtPayload, @Query('fy') fy: string) {
    return this.accounting.exportItrCsv(user.tenantId, fy);
  }

  @Get('itr-prep/export/tally')
  tallyExport(@CurrentUser() user: JwtPayload, @Query('fy') fy: string) {
    return this.accounting.exportTallyXml(user.tenantId, fy);
  }
}
