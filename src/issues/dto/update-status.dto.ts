import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, Min } from 'class-validator';
import { IssueStatus } from '../../common/enums';

export class UpdateStatusDto {
  @ApiProperty({ enum: IssueStatus, description: 'Target status.' })
  @IsEnum(IssueStatus)
  status: IssueStatus;

  @ApiProperty({ description: 'Expected current version (optimistic lock).' })
  @IsInt()
  @Min(1)
  version: number;
}
