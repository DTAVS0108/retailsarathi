import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { RepairServiceTypesService } from './repair-service-types.service';
import { CreateRepairServiceTypeDto, UpdateRepairServiceTypeDto } from './dto/repair.dto';
import { CurrentUser, JwtPayload, Roles } from '../common/decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/roles.guard';

@ApiTags('repair-service-types')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('repair-service-types')
export class RepairServiceTypesController {
  constructor(private serviceTypes: RepairServiceTypesService) {}

  @Get()
  findAll(@CurrentUser() user: JwtPayload) {
    return this.serviceTypes.findAll(user.tenantId);
  }

  @Post()
  @Roles('OWNER', 'MANAGER')
  create(@CurrentUser() user: JwtPayload, @Body() dto: CreateRepairServiceTypeDto) {
    return this.serviceTypes.create(user.tenantId, dto);
  }

  @Patch(':id')
  @Roles('OWNER', 'MANAGER')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateRepairServiceTypeDto,
  ) {
    return this.serviceTypes.update(user.tenantId, id, dto);
  }
}
