import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, JwtPayload, Roles } from '../common/decorators';
import { RolesGuard } from '../common/roles.guard';
import { BankReconcileService } from './bank-reconcile.service';

@ApiTags('bank-reconcile')
@ApiBearerAuth()
@Controller('bank-statements')
export class BankReconcileController {
  constructor(private bank: BankReconcileService) {}

  @Get()
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'MANAGER')
  list(@CurrentUser() user: JwtPayload, @Query('status') status?: string) {
    return this.bank.list(user.tenantId, status);
  }

  @Post('import')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'MANAGER')
  @UseInterceptors(FileInterceptor('file'))
  async importFile(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: { csvText?: string },
  ) {
    const text = file?.buffer ? file.buffer.toString('utf8') : body.csvText || '';
    return this.bank.importCsv(user.tenantId, text);
  }

  @Post('sync')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'MANAGER')
  syncFeed(@CurrentUser() user: JwtPayload, @Body() body: { feedUrl?: string }) {
    return this.bank.syncFromFeed(user.tenantId, body?.feedUrl);
  }

  @Post('auto-match')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'MANAGER')
  autoMatch(@CurrentUser() user: JwtPayload) {
    return this.bank.autoMatchUnmatched(user.tenantId);
  }

  @Post('aa/connect')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'MANAGER')
  aaConnect(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      provider?: string;
      consentId?: string;
      feedUrl?: string;
      accountMask?: string;
    },
  ) {
    return this.bank.connectAccountAggregator(user.tenantId, body || {});
  }

  @Post('aa/connect/start')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'MANAGER')
  aaStart(
    @CurrentUser() user: JwtPayload,
    @Body() body: { provider?: string; redirectUri?: string; accountMask?: string },
  ) {
    return this.bank.startAaConsent(user.tenantId, body || {});
  }

  @Get('aa/authorize')
  async aaAuthorize(
    @Query('tenantId') tenantId: string,
    @Query('consentId') consentId: string,
    @Res() res: Response,
  ) {
    const html = await this.bank.authorizePageHtml(tenantId || '', consentId || '');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }

  @Get('aa/callback')
  async aaCallback(
    @Query('tenantId') tenantId: string,
    @Query('consentId') consentId: string,
    @Query('status') status: string | undefined,
    @Query('accessToken') accessToken: string | undefined,
    @Query('feedUrl') feedUrl: string | undefined,
    @Res() res: Response,
  ) {
    const result = await this.bank.handleAaCallback({
      tenantId: tenantId || '',
      consentId: consentId || '',
      status,
      accessToken,
      feedUrl,
    });
    res.redirect(result.redirectUri);
  }

  @Get('aa/status')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'MANAGER')
  aaStatus(@CurrentUser() user: JwtPayload) {
    return this.bank.getAaStatus(user.tenantId);
  }

  @Post('aa/sync')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'MANAGER')
  aaSync(@CurrentUser() user: JwtPayload) {
    return this.bank.syncFromAa(user.tenantId);
  }

  @Get(':id/suggest')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'MANAGER')
  suggest(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.bank.suggest(user.tenantId, id);
  }

  @Post(':id/match')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'MANAGER')
  match(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { supplierPaymentId?: string; customerPaymentId?: string },
  ) {
    return this.bank.match(user.tenantId, id, body);
  }

  @Post(':id/ignore')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('OWNER', 'MANAGER')
  ignore(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.bank.ignore(user.tenantId, id);
  }
}
