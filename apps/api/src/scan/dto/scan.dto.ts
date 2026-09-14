import {
  IsString,
  IsOptional,
  IsArray,
  IsNumber,
  IsBoolean,
  ValidateNested,
  IsInt,
  Min,
  IsObject,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ParseOrderSheetDto {
  @ApiProperty({ description: 'OCR or typed order sheet text with Label: Value lines' })
  @IsString()
  text!: string;

  @ApiPropertyOptional({ description: 'If true, also create/find customer in CRM' })
  @IsOptional()
  createCustomer?: boolean;
}

export class CreateScanTemplateDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() supplierName?: string;
  @ApiPropertyOptional() @IsOptional() fieldMappings?: Record<string, unknown>;
  @ApiPropertyOptional() @IsOptional() @IsString() sampleText?: string;
}

export class UpdateScanTemplateDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() supplierName?: string;
  @ApiPropertyOptional() @IsOptional() fieldMappings?: Record<string, unknown>;
  @ApiPropertyOptional() @IsOptional() @IsString() sampleText?: string;
}

export class ConfirmStockInLineDto {
  @ApiProperty() @IsString() name!: string;
  @ApiProperty() @Type(() => Number) @IsNumber() quantity!: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() unitPrice?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() salePrice?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() hsnCode?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() gstRate?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() brand?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() model?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() sku?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() barcode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() productId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() createIfMissing?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() trackSerial?: boolean;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true })
  serialNumbers?: string[];
  /** If false, update/create product but do not increment stock (soft / pending). */
  @ApiPropertyOptional() @IsOptional() @IsBoolean() commitStock?: boolean;
}

export class ConfirmStockInDto {
  @ApiPropertyOptional() @IsOptional() @IsString() uploadId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() draftId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() supplierId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() supplierName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() supplierAddress?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() supplierPhone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() invoiceNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() invoiceDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() gstin?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() taxableValue?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() taxAmount?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() totalAmount?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() cgstAmount?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() sgstAmount?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() igstAmount?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() irn?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() ackNo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() ackDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() ewayBillNo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() vehicleNo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bankName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bankAccount?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() ifsc?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() bankBranch?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() placeOfSupply?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() stateName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() customerName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() customerGstin?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  /** When true, append lines to an existing purchase bill with the same invoice #. Default rejects duplicates. */
  @ApiPropertyOptional() @IsOptional() @IsBoolean() appendToExistingBill?: boolean;
  @ApiProperty({ type: [ConfirmStockInLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConfirmStockInLineDto)
  lines!: ConfirmStockInLineDto[];
}

export class SaveDraftStockInDto {
  @ApiPropertyOptional() @IsOptional() @IsString() draftId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() uploadId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() supplierName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() invoiceNumber?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() invoiceDate?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() gstin?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiProperty() @IsObject() previewJson!: Record<string, unknown>;
}

export class CompleteEnrichmentDto {
  @ApiPropertyOptional() @IsOptional() @IsString() barcode?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() salePrice?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() model?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() brand?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() category?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() hsnCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsNumber() gstRate?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() trackSerial?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() skip?: boolean;
  @ApiPropertyOptional({ type: [String] }) @IsOptional() @IsArray() @IsString({ each: true })
  serialNumbers?: string[];
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) addStockQty?: number;
}
