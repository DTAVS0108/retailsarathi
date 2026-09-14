import { IsString, IsArray, ValidateNested, IsEnum } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class SyncEntryDto {
  @ApiProperty() @IsString() entityType!: string;
  @ApiProperty() @IsString() entityId!: string;
  @ApiProperty({ enum: ['CREATE', 'UPDATE', 'DELETE'] })
  @IsEnum(['CREATE', 'UPDATE', 'DELETE'])
  operation!: string;
  @ApiProperty() payload!: Record<string, unknown>;
}

export class PushSyncDto {
  @ApiProperty({ type: [SyncEntryDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SyncEntryDto)
  entries!: SyncEntryDto[];
}

export class ResolveConflictDto {
  @ApiProperty({ enum: ['ACCEPT_LOCAL', 'ACCEPT_SERVER'] })
  @IsEnum(['ACCEPT_LOCAL', 'ACCEPT_SERVER'])
  resolution!: string;
}
