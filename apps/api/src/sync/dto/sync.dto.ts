import { IsString, IsArray, ValidateNested, IsEnum, IsObject } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class SyncEntryDto {
  @ApiProperty() @IsString() entityType!: string;
  @ApiProperty() @IsString() entityId!: string;
  @ApiProperty({ enum: ['CREATE', 'UPDATE', 'DELETE'] })
  @IsEnum(['CREATE', 'UPDATE', 'DELETE'])
  operation!: string;
  /** Was missing any validator decorator — under the app's global `forbidNonWhitelisted: true`
      pipe, that made this field (and therefore every real /sync/push call) rejected with a 400. */
  @ApiProperty() @IsObject() payload!: Record<string, unknown>;
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
