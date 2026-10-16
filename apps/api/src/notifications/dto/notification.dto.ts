import { IsString, IsOptional, IsEnum, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateTemplateDto {
  @ApiProperty() @IsString() name!: string;
  @ApiProperty({ enum: ['WHATSAPP', 'SMS', 'EMAIL'] })
  @IsEnum(['WHATSAPP', 'SMS', 'EMAIL'])
  channel!: string;
  @ApiProperty() @IsString() body!: string;
  @ApiPropertyOptional() @IsOptional() variables?: string[];
}

export class SendNotificationDto {
  @ApiPropertyOptional() @IsOptional() @IsString() templateId?: string;
  @ApiPropertyOptional({ description: 'Looked up by name if templateId is not given; falls back to `body` if no active template exists with this name.' })
  @IsOptional() @IsString() templateName?: string;
  @ApiProperty({ enum: ['WHATSAPP', 'SMS', 'EMAIL'] })
  @IsEnum(['WHATSAPP', 'SMS', 'EMAIL'])
  channel!: string;
  @ApiProperty() @IsString() recipient!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() body?: string;
  @ApiPropertyOptional() @IsOptional() @IsObject() variables?: Record<string, string>;
}
