import { IsString, IsOptional, IsNumber, IsEnum, IsBoolean, IsArray, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

const REPAIR_STATUS_VALUES = [
  'RECEIVED',
  'DIAGNOSED',
  'AWAITING_CUSTOMER_APPROVAL',
  'AWAITING_PARTS',
  'IN_REPAIR',
  'ON_HOLD',
  'READY',
  'DELIVERED',
  'CANCELLED',
];

export class CreateRepairJobDto {
  @ApiProperty() @IsString() customerId!: string;
  @ApiProperty() @IsString() deviceModel!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() imei?: string;
  @ApiProperty() @IsString() issue!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() accessories?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() technicianId?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() estimateAmount?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() warrantyDays?: number;
  @ApiPropertyOptional({ description: 'Deposit collected at intake — deducted from the final invoice payment total.' })
  @IsOptional() @Type(() => Number) @IsNumber() advancePaid?: number;
  @ApiPropertyOptional() @IsOptional() @IsObject() intakeChecklist?: Record<string, unknown>;
  @ApiPropertyOptional({ description: 'Set when the front desk confirms this job is a warranty comeback for a prior delivered job on the same device.' })
  @IsOptional() @IsString() reopenedFromId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() serviceTypeId?: string;
}

export class UpdateRepairStatusDto {
  @ApiProperty({ enum: REPAIR_STATUS_VALUES })
  @IsEnum(REPAIR_STATUS_VALUES)
  status!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() notes?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() customerApproved?: boolean;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() finalAmount?: number;
}

export class AddRepairPartDto {
  @ApiProperty() @IsString() productId!: string;
  @ApiProperty() @Type(() => Number) @IsNumber() quantity!: number;
  @ApiProperty() @Type(() => Number) @IsNumber() unitPrice!: number;
}

export class AssignTechnicianDto {
  @ApiProperty() @IsString() technicianId!: string;
}

export class UpdateRepairPhotosDto {
  @ApiProperty({ type: [String] }) @IsArray() @IsString({ each: true }) photoUrls!: string[];
}

export class CreateRepairServiceTypeDto {
  @ApiProperty() @IsString() name!: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() defaultPrice?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() typicalTurnaroundDays?: number;
}

export class UpdateRepairServiceTypeDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() defaultPrice?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() typicalTurnaroundDays?: number;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
}

export class RepairRecordsFilterDto {
  @ApiPropertyOptional() @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() technicianId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() serviceTypeId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() dateFrom?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() dateTo?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() search?: string;
}

export class BulkDeleteRepairRecordsDto {
  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ids?: string[];

  @ApiPropertyOptional({ type: RepairRecordsFilterDto })
  @IsOptional()
  @IsObject()
  filters?: RepairRecordsFilterDto;
}
