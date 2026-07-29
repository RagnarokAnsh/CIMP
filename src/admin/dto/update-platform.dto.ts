import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsObject, IsOptional, IsString, Length } from 'class-validator';
import { PlatformStatus } from '../../common/enums';

// Platform key is immutable once issued (tokens reference it), so it is not
// editable here.
export class UpdatePlatformDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @Length(2, 120)
  name?: string;

  @ApiPropertyOptional({ enum: PlatformStatus })
  @IsOptional()
  @IsEnum(PlatformStatus)
  status?: PlatformStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  jiraProjectKey?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  jiraEnabled?: boolean;

  @ApiPropertyOptional({
    description:
      'Per-priority SLA hours overriding the env defaults, e.g. { "CRITICAL": 2, "HIGH": 12 }. '
      + 'Pass null to clear. Keys/values validated in the service.',
  })
  @IsOptional()
  @IsObject()
  slaPolicy?: Record<string, number> | null;
}
