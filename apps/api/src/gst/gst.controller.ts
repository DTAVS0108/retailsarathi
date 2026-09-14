import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { GstService } from './gst.service';
import { CurrentUser, JwtPayload } from '../common/decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('gst')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('gst')
export class GstController {
  constructor(private gst: GstService) {}

  @Get('gstr1')
  gstr1(
    @CurrentUser() user: JwtPayload,
    @Query('year') year: string,
    @Query('month') month: string,
  ) {
    return this.gst.exportGstr1(user.tenantId, parseInt(year), parseInt(month));
  }

  @Get('gstr3b')
  gstr3b(
    @CurrentUser() user: JwtPayload,
    @Query('year') year: string,
    @Query('month') month: string,
  ) {
    return this.gst.exportGstr3b(user.tenantId, parseInt(year), parseInt(month));
  }
}
