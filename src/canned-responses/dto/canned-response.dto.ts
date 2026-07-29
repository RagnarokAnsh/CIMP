import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional, IsString, MaxLength, MinLength,
} from 'class-validator';

// Placeholders substituted client-side at insert time: {{reporter}}, {{reference}},
// {{assignee}}, {{platform}}. Stored verbatim — the server never interpolates.
export class CreateCannedResponseDto {
  @ApiProperty({ description: 'Short name shown in the picker.' })
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  title: string;

  @ApiProperty({ description: 'Reply body. Supports {{reporter}}, {{reference}}, {{assignee}}, {{platform}}.' })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body: string;
}

export class UpdateCannedResponseDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(80)
  title?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body?: string;
}
