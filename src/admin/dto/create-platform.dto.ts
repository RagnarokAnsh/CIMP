import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean, IsEnum, IsOptional, IsString, Length, Matches,
} from 'class-validator';
import { PlatformStatus } from '../../common/enums';

export class CreatePlatformDto {
  @ApiProperty({ description: 'Unique platform key (lowercase, used in tokens).' })
  @IsString()
  @Matches(/^[a-z0-9-]{2,40}$/, {
    message: 'key must be 2-40 chars of lowercase letters, digits, or hyphens.',
  })
  key: string;

  @ApiProperty()
  @IsString()
  @Length(2, 120)
  name: string;

  @ApiPropertyOptional({ enum: PlatformStatus })
  @IsOptional()
  @IsEnum(PlatformStatus)
  status?: PlatformStatus;

  @ApiPropertyOptional({ description: 'Mapped Jira project key, e.g. SUP.' })
  @IsOptional()
  @IsString()
  jiraProjectKey?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  jiraEnabled?: boolean;

  @ApiPropertyOptional({
    description:
      'Hand-off signing secret (HS256 key). If omitted, a strong random one is '
      + 'generated server-side. Must be at least 32 chars if supplied.',
  })
  @IsOptional()
  @IsString()
  @Length(32, 200)
  handoffSecret?: string;
}
