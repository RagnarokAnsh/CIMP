import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray, IsBoolean, IsIn, IsOptional, IsUUID, IsUrl,
} from 'class-validator';
import { IssueEvents } from '../../events/issue-events';

const EVENT_NAMES = Object.values(IssueEvents);

export class CreateWebhookDto {
  @ApiProperty({ description: 'HTTPS endpoint that receives the signed JSON POSTs.' })
  @IsUrl({ protocols: ['https'], require_protocol: true })
  url: string;

  @ApiPropertyOptional({ description: 'Scope to one platform (omit for all platforms).' })
  @IsOptional()
  @IsUUID()
  platformId?: string;

  @ApiPropertyOptional({
    description: 'Event names to deliver (omit or empty for all).',
    enum: EVENT_NAMES,
    isArray: true,
  })
  @IsOptional()
  @IsArray()
  @IsIn(EVENT_NAMES, { each: true })
  events?: string[];
}

export class UpdateWebhookDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true })
  url?: string;

  @ApiPropertyOptional({ enum: EVENT_NAMES, isArray: true })
  @IsOptional()
  @IsArray()
  @IsIn(EVENT_NAMES, { each: true })
  events?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
