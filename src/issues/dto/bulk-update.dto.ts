import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize, ArrayNotEmpty, IsArray, IsEnum, IsOptional, IsString, IsUUID,
} from 'class-validator';

export enum BulkOp {
  STATUS = 'status',
  PRIORITY = 'priority',
  ASSIGNEE = 'assignee',
}

export class BulkUpdateDto {
  @ApiProperty({ type: [String], description: 'Issue ids to update (max 200).' })
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  ids: string[];

  @ApiProperty({ enum: BulkOp, description: 'Which field to change.' })
  @IsEnum(BulkOp)
  op: BulkOp;

  @ApiPropertyOptional({
    description: 'Target value: a status or priority enum, or an assignee uuid ("" to unassign).',
  })
  @IsOptional()
  @IsString()
  value?: string;
}
