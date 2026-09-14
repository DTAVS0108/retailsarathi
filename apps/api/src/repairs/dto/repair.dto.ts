import { IsString, IsOptional, IsNumber, IsEnum, IsBoolean } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateRepairJobDto {
  @ApiProperty() @IsString() customerId!: string;
  @ApiProperty() @IsString() deviceModel!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() imei?: string;
  @ApiProperty() @IsString() issue!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() accessories?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() technicianId?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() estimateAmount?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() warrantyDays?: number;
}

export class UpdateRepairStatusDto {
  @ApiProperty({ enum: ['RECEIVED', 'DIAGNOSED', 'AWAITING_PARTS', 'IN_REPAIR', 'READY', 'DELIVERED', 'CANCELLED'] })
  @IsEnum(['RECEIVED', 'DIAGNOSED', 'AWAITING_PARTS', 'IN_REPAIR', 'READY', 'DELIVERED', 'CANCELLED'])
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
  @ApiProperty({ type: [String] }) photoUrls!: string[];
}
