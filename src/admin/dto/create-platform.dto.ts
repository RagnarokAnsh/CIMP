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
    description: 'Hand-off signing secret. If omitted, a random one is generated.',
  })
  @IsOptional()
  @IsString()
  @Length(16, 200)
  handoffSecret?: string;
}
