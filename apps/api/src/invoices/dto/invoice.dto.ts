import {
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  ValidateNested,
  IsEnum,
  IsBoolean,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class InvoiceLineDto {
  @ApiPropertyOptional() @IsOptional() @IsString() productId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() productName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() productSku?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() productBarcode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() hsnCode?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() unit?: string;
  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0.001) quantity!: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() unitPrice?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() discount?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() gstRate?: number;
  @ApiPropertyOptional() @IsOptional() @IsArray() serialNumbers?: string[];
}

export class PaymentDto {
  @ApiProperty({ enum: ['CASH', 'UPI', 'CARD', 'CREDIT', 'BANK_TRANSFER'] })
  @IsEnum(['CASH', 'UPI', 'CARD', 'CREDIT', 'BANK_TRANSFER'])
  method!: string;

  @ApiProperty() @Type(() => Number) @IsNumber() @Min(0) amount!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() reference?: string;
}

export class CreateInvoiceDto {
  @ApiPropertyOptional() @IsOptional() @IsString() branchId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() customerId?: string;
  @ApiPropertyOptional() @IsOptional() @IsEnum(['TAX_INVOICE', 'BILL_OF_SUPPLY', 'DELIVERY_CHALLAN', 'CREDIT_NOTE']) type?: string;
  @ApiPropertyOptional() @IsOptional() @IsEnum(['DRAFT', 'FINALIZED']) status?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isWholesale?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  /** Redeem loyalty points (1 point ≈ ₹1) as bill discount before payment check */
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() @Min(0) loyaltyPointsToRedeem?: number;
  @ApiProperty({ type: [InvoiceLineDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InvoiceLineDto)
  lines!: InvoiceLineDto[];

  @ApiPropertyOptional({ type: [PaymentDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PaymentDto)
  payments?: PaymentDto[];
}
