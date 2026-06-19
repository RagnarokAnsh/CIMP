import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEnum, IsOptional, IsString, Length } from 'class-validator';
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
}
