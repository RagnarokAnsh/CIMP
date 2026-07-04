import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsUUID } from 'class-validator';
import { IssueLinkType } from '../../common/enums';

export class CreateIssueLinkDto {
  @ApiProperty({ format: 'uuid', description: 'The issue to link to (same platform).' })
  @IsUUID()
  targetIssueId: string;

  @ApiProperty({ enum: IssueLinkType })
  @IsEnum(IssueLinkType)
  type: IssueLinkType;
}
