import { Controller, Get, Post, Body, Query, Param, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { SyncService } from './sync.service';
import { PushSyncDto, ResolveConflictDto } from './dto/sync.dto';
import { CurrentUser, JwtPayload } from '../common/decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('sync')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('sync')
export class SyncController {
  constructor(private sync: SyncService) {}

  @Post('push')
  push(
    @CurrentUser() user: JwtPayload,
    @Query('deviceId') deviceId: string,
    @Body() dto: PushSyncDto,
  ) {
    return this.sync.push(user.tenantId, deviceId, dto);
  }

  @Get('pull')
  pull(
    @CurrentUser() user: JwtPayload,
    @Query('deviceId') deviceId: string,
    @Query('since') since?: string,
  ) {
    return this.sync.pull(user.tenantId, deviceId, since);
  }

  @Get('conflicts')
  conflicts(
    @CurrentUser() user: JwtPayload,
    @Query('deviceId') deviceId: string,
  ) {
    return this.sync.getConflicts(user.tenantId, deviceId);
  }

  @Post('conflicts/:id/resolve')
  resolve(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: ResolveConflictDto,
  ) {
    return this.sync.resolveConflict(user.tenantId, id, dto);
  }
}
