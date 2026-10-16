import {
  IsString,
  IsNumber,
  IsOptional,
  IsBoolean,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateProductDto {
  @ApiProperty() @IsString() sku!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() barcode?: string;
  @ApiProperty() @IsString() name!: string;
  @ApiProperty() @IsString() hsnCode!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() brand?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() model?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() unit?: string;
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0) salePrice!: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() purchasePrice?: number;
  @ApiProperty() @Type(() => Number) @IsNumber() gstRate!: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() stockQty?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() lowStockThreshold?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() trackSerial?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() trackBatch?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() parentProductId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() variantLabel?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() imageUrl?: string;
  @ApiPropertyOptional() @IsOptional() attachments?: Array<{
    url: string;
    name: string;
    mimeType?: string;
    size?: number;
  }>;
}

export class UpdateProductDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() barcode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() hsnCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() brand?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() model?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() unit?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() salePrice?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() purchasePrice?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() gstRate?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() lowStockThreshold?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() trackSerial?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() trackBatch?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() parentProductId?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsString() variantLabel?: string | null;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() imageUrl?: string | null;
  @ApiPropertyOptional() @IsOptional() attachments?: Array<{
    url: string;
    name: string;
    mimeType?: string;
    size?: number;
  }> | null;
}

export class ParseProductLabelDto {
  @ApiProperty({ description: 'OCR or pasted product label / datasheet text' })
  @IsString()
  text!: string;
}

export class StockAdjustDto {
  @ApiProperty() @Type(() => Number) @IsNumber() quantity!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class UpsertBatchDto {
  @ApiProperty() @IsString() batchNumber!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() expiryDate?: string;
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0) quantity!: number;
}
