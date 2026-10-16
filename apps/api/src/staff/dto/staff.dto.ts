import { IsString, IsOptional, IsEmail, IsEnum, IsNumber, IsBoolean, MinLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

const ROLE_VALUES = ['OWNER', 'MANAGER', 'CASHIER', 'TECHNICIAN'];

export class CreateStaffDto {
  @ApiProperty() @IsString() name!: string;
  @ApiProperty() @IsEmail() email!: string;
  @ApiProperty() @IsString() @MinLength(6) password!: string;
  @ApiProperty({ enum: ROLE_VALUES }) @IsEnum(ROLE_VALUES) role!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() branchId?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() dateOfJoining?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() monthlySalary?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() commissionPct?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() photoUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() emergencyContactName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() emergencyContactPhone?: string;
}

export class UpdateStaffDto {
  @ApiPropertyOptional() @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional({ enum: ROLE_VALUES }) @IsOptional() @IsEnum(ROLE_VALUES) role?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() branchId?: string;
  @ApiPropertyOptional() @IsOptional() @IsBoolean() isActive?: boolean;
  @ApiPropertyOptional() @IsOptional() @IsString() phone?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() dateOfJoining?: string;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() monthlySalary?: number;
  @ApiPropertyOptional() @IsOptional() @Type(() => Number) @IsNumber() commissionPct?: number;
  @ApiPropertyOptional() @IsOptional() @IsString() photoUrl?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() emergencyContactName?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() emergencyContactPhone?: string;
}

export class CheckInDto {
  @ApiProperty() @IsString() userId!: string;
  @ApiProperty() @IsString() branchId!: string;
}
