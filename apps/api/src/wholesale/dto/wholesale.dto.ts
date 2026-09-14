import { IsString, IsOptional, IsArray, ValidateNested, IsEnum, IsNumber, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class PriceListItemDto {
  @ApiProperty() @IsString() productId!: string;
  @ApiProperty() @Type(() => Number) @IsNumber() price!: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() minQty?: number;
}

export class CreatePriceListDto {
  @ApiProperty() @IsString() name!: string;
  @ApiProperty({ enum: ['RETAIL', 'DEALER', 'DISTRIBUTOR', 'WHOLESALE'] })
  @IsEnum(['RETAIL', 'DEALER', 'DISTRIBUTOR', 'WHOLESALE'])
  type!: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isDefault?: boolean;
  @ApiPropertyOptional({ type: [PriceListItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PriceListItemDto)
  items?: PriceListItemDto[];
}

export class UpdatePriceListDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isDefault?: boolean;
  @ApiPropertyOptional({ enum: ['RETAIL', 'DEALER', 'DISTRIBUTOR', 'WHOLESALE'] })
  @IsOptional()
  @IsEnum(['RETAIL', 'DEALER', 'DISTRIBUTOR', 'WHOLESALE'])
  type?: string;
}

export class AddPriceListItemDto {
  @ApiProperty() @IsString() productId!: string;
  @ApiProperty() @Type(() => Number) @IsNumber() price!: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() minQty?: number;
}
