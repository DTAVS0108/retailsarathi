import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { HardwareService } from './hardware.service';
import { CurrentUser, JwtPayload } from '../common/decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('hardware')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('hardware')
export class HardwareController {
  constructor(private hardware: HardwareService) {}

  @Get('presets')
  presets() {
    return this.hardware.getDevicePresets();
  }

  @Get('overview')
  overview(@CurrentUser() user: JwtPayload) {
    return this.hardware.overview(user.tenantId);
  }

  @Get()
  list(@CurrentUser() user: JwtPayload, @Query('branchId') branchId?: string) {
    return this.hardware.list(user.tenantId, branchId);
  }

  @Post()
  create(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      deviceType: string;
      name: string;
      branchId?: string;
      settings?: Record<string, unknown>;
    },
  ) {
    return this.hardware.create(user.tenantId, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: { name?: string; settings?: Record<string, unknown>; isActive?: boolean },
  ) {
    return this.hardware.update(user.tenantId, id, body);
  }

  @Delete(':id')
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.hardware.remove(user.tenantId, id);
  }

  @Post('print-thermal')
  printThermal(
    @CurrentUser() user: JwtPayload,
    @Body()
    body: {
      invoiceId: string;
      hardwareConfigId?: string;
      paperWidth?: 58 | 80;
      showShopGstin?: boolean;
      showShopAddress?: boolean;
      showCustomerOnThermal?: boolean;
    },
  ) {
    return this.hardware.createThermalPrintJob(user.tenantId, body);
  }
}
