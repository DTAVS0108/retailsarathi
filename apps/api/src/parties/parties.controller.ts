import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser, JwtPayload } from '../common/decorators';
import { PartiesService } from './parties.service';

@Controller('parties')
@UseGuards(JwtAuthGuard)
export class PartiesController {
  constructor(private parties: PartiesService) {}

  @Get('search')
  search(
    @CurrentUser() user: JwtPayload,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
  ) {
    return this.parties.search(user.tenantId, q || '', Number(limit) || 20);
  }
}
