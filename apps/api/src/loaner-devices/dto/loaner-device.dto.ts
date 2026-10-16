import { IsString, IsOptional, IsEnum, IsDateString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

const CONDITION_VALUES = ['EXCELLENT', 'GOOD', 'FAIR', 'POOR'];
const STATUS_VALUES = ['AVAILABLE', 'ON_LOAN', 'IN_REPAIR', 'RETIRED'];

export class CreateLoanerDeviceDto {
  @ApiProperty() @IsString() model!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() brand?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() identifier?: string;
  @ApiPropertyOptional({ enum: CONDITION_VALUES }) @IsOptional() @IsEnum(CONDITION_VALUES) condition?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class UpdateLoanerDeviceDto {
  @ApiPropertyOptional() @IsOptional() @IsString() model?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() brand?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() identifier?: string;
  @ApiPropertyOptional({ enum: CONDITION_VALUES }) @IsOptional() @IsEnum(CONDITION_VALUES) condition?: string;
  @ApiPropertyOptional({ enum: STATUS_VALUES }) @IsOptional() @IsEnum(STATUS_VALUES) status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
}

export class CheckoutLoanerDeviceDto {
  @ApiProperty() @IsString() loanerDeviceId!: string;
  @ApiPropertyOptional() @IsOptional() @IsDateString() expectedReturnAt?: string;
  @ApiPropertyOptional({ enum: CONDITION_VALUES }) @IsOptional() @IsEnum(CONDITION_VALUES) conditionOut?: string;
}

export class ReturnLoanerDeviceDto {
  @ApiPropertyOptional({ enum: CONDITION_VALUES }) @IsOptional() @IsEnum(CONDITION_VALUES) conditionIn?: string;
  @ApiPropertyOptional({ enum: STATUS_VALUES, description: 'Optional manual override for the device status after return (e.g. RETIRED if badly damaged). Defaults to AVAILABLE.' })
  @IsOptional() @IsEnum(STATUS_VALUES) deviceStatusOverride?: string;
}
