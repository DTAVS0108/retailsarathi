import { IsString, IsNumber, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class CreateJournalEntryDto {
  @ApiProperty() @IsString() date!: string;
  @ApiProperty() @IsString() description!: string;
  @ApiProperty() @IsString() debitAccountId!: string;
  @ApiProperty() @IsString() creditAccountId!: string;
  @ApiProperty() @Type(() => Number) @IsNumber() amount!: number;
  @ApiPropertyOptional() @IsOptional() @IsString() referenceType?: string;
  @ApiPropertyOptional() @IsOptional() @IsString() referenceId?: string;
}

export class CreateAccountDto {
  @ApiProperty() @IsString() code!: string;
  @ApiProperty() @IsString() name!: string;
  @ApiProperty({ enum: ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'] })
  @IsString() type!: string;
}
