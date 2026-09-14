import { IsString, IsOptional, IsNumber, IsEnum, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export const TRADE_IN_STATUSES = [
  'QUOTED',
  'ACCEPTED',
  'RECEIVED',
  'REFURBISHED',
  'SOLD',
  'REJECTED',
] as const;

export const PRODUCT_CONDITIONS = ['NEW', 'REFURB', 'OPEN_BOX'] as const;

export class CreateTradeInDto {
  @ApiPropertyOptional() @IsOptional() @IsString() customerId?: string;
  @ApiProperty() @IsString() deviceModel!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() imei?: string;
  @ApiPropertyOptional({ enum: PRODUCT_CONDITIONS })
  @IsOptional()
  @IsEnum(PRODUCT_CONDITIONS)
  condition?: (typeof PRODUCT_CONDITIONS)[number];
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0.01) quotedValue!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class UpdateTradeInDto {
  @ApiPropertyOptional() @IsOptional() @IsString() customerId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() deviceModel?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() imei?: string;
  @ApiPropertyOptional({ enum: PRODUCT_CONDITIONS })
  @IsOptional()
  @IsEnum(PRODUCT_CONDITIONS)
  condition?: (typeof PRODUCT_CONDITIONS)[number];
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) quotedValue?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) finalValue?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class UpdateTradeInStatusDto {
  @ApiProperty({ enum: TRADE_IN_STATUSES })
  @IsEnum(TRADE_IN_STATUSES)
  status!: (typeof TRADE_IN_STATUSES)[number];
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) finalValue?: number;
}

export class ConvertTradeInDto {
  @ApiPropertyOptional() @IsOptional() @IsString() sku?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) salePrice?: number;
}
