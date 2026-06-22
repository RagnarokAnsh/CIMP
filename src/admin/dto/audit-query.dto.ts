import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min,
} from 'class-validator';
import { ActorType } from '../../common/enums';

export class AuditQueryDto {
  @ApiPropertyOptional({ enum: ActorType })
  @IsOptional()
  @IsEnum(ActorType)
  actorType?: ActorType;

  @ApiPropertyOptional({ description: 'Exact action name, e.g. STATUS_CHANGED.' })
  @IsOptional()
  @IsString()
  action?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID()
  issueId?: string;

  @ApiPropertyOptional({ description: 'ISO timestamp (inclusive lower bound).' })
  @IsOptional()
  @IsString()
  from?: string;

  @ApiPropertyOptional({ description: 'ISO timestamp (inclusive upper bound).' })
  @IsOptional()
  @IsString()
  to?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @ApiPropertyOptional({ default: 50, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  pageSize?: number;
}
