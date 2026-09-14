import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { TradeInService } from './tradein.service';
import { CurrentUser, JwtPayload } from '../common/decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import {
  ConvertTradeInDto,
  CreateTradeInDto,
  UpdateTradeInDto,
  UpdateTradeInStatusDto,
} from './dto/tradein.dto';

@ApiTags('trade-in')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('trade-in')
export class TradeInController {
  constructor(private tradeIn: TradeInService) {}

  @Get()
  list(@CurrentUser() user: JwtPayload, @Query('status') status?: string) {
    return this.tradeIn.list(user.tenantId, status);
  }

  @Get(':id')
  getOne(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.tradeIn.getOne(user.tenantId, id);
  }

  @Post()
  create(@CurrentUser() user: JwtPayload, @Body() body: CreateTradeInDto) {
    return this.tradeIn.create(user.tenantId, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: UpdateTradeInDto,
  ) {
    return this.tradeIn.update(user.tenantId, id, body);
  }

  @Patch(':id/status')
  updateStatus(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: UpdateTradeInStatusDto,
  ) {
    return this.tradeIn.updateStatus(user.tenantId, id, body.status, body.finalValue);
  }

  @Post(':id/convert-to-inventory')
  convert(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: ConvertTradeInDto,
  ) {
    return this.tradeIn.convertToInventory(user.tenantId, id, body);
  }
}
