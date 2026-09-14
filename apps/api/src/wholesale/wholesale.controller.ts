import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { WholesaleService } from './wholesale.service';
import { CreatePriceListDto, AddPriceListItemDto, UpdatePriceListDto } from './dto/wholesale.dto';
import { CurrentUser, JwtPayload } from '../common/decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@ApiTags('wholesale')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('wholesale')
export class WholesaleController {
  constructor(private wholesale: WholesaleService) {}

  @Get('guide')
  guide() {
    return this.wholesale.segmentGuide();
  }

  @Get('price-lists')
  getPriceLists(@CurrentUser() user: JwtPayload) {
    return this.wholesale.getPriceLists(user.tenantId);
  }

  @Get('price-lists/:id')
  getPriceList(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.wholesale.getPriceList(user.tenantId, id);
  }

  @Post('price-lists')
  createPriceList(@CurrentUser() user: JwtPayload, @Body() dto: CreatePriceListDto) {
    return this.wholesale.createPriceList(user.tenantId, dto);
  }

  @Patch('price-lists/:id')
  updatePriceList(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdatePriceListDto,
  ) {
    return this.wholesale.updatePriceList(user.tenantId, id, dto);
  }

  @Delete('price-lists/:id')
  deletePriceList(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.wholesale.deletePriceList(user.tenantId, id);
  }

  @Post('price-lists/:id/items')
  addItem(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: AddPriceListItemDto,
  ) {
    return this.wholesale.addPriceListItem(
      user.tenantId,
      id,
      dto.productId,
      dto.price,
      dto.minQty ?? 1,
    );
  }

  @Delete('price-lists/:id/items/:itemId')
  removeItem(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('itemId') itemId: string,
  ) {
    return this.wholesale.removePriceListItem(user.tenantId, id, itemId);
  }

  @Get('price')
  getPrice(
    @CurrentUser() user: JwtPayload,
    @Query('productId') productId: string,
    @Query('type') type: string,
    @Query('qty') qty: string,
  ) {
    return this.wholesale.getPriceForProduct(
      user.tenantId,
      productId,
      type,
      parseFloat(qty ?? '1'),
    );
  }
}
