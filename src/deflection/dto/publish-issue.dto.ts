import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional, IsString, Length } from 'class-validator';

export class PublishIssueDto {
  @ApiProperty({ description: 'Show this issue in the public known-issues feed.' })
  @IsBoolean()
  publiclyVisible: boolean;

  @ApiPropertyOptional({ description: 'Curated public title (required to publish).', maxLength: 140 })
  @IsOptional()
  @IsString()
  @Length(1, 140)
  publicTitle?: string;
}
