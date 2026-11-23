import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, JwtPayload, Roles } from '../common/decorators';
import { RolesGuard } from '../common/roles.guard';
import { Gstr2bService } from './gstr2b.service';

@Controller('gstr2b')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('OWNER', 'MANAGER')
export class Gstr2bController {
  constructor(private gstr2b: Gstr2bService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload) {
    return this.gstr2b.listImports(user.tenantId);
  }

  @Post('import')
  import(
    @CurrentUser() user: JwtPayload,
    @Body() body: { period?: string; csvText: string },
  ) {
    return this.gstr2b.importCsv(user.tenantId, body.period || '', body.csvText || '');
  }

  @Post('lines/:lineId/ignore')
  ignore(@CurrentUser() user: JwtPayload, @Param('lineId') lineId: string) {
    return this.gstr2b.ignoreLine(user.tenantId, lineId);
  }

  @Post(':id/auto-match')
  autoMatch(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.gstr2b.autoMatch(user.tenantId, id);
  }

  @Get(':id')
  get(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.gstr2b.getImport(user.tenantId, id);
  }
}
