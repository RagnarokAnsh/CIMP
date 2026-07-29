import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsUUID, Min } from 'class-validator';

export class MergeIssueDto {
  @ApiProperty({ description: 'The canonical issue this one duplicates.' })
  @IsUUID()
  canonicalIssueId: string;

  @ApiProperty({ description: 'Current version of the duplicate (optimistic lock).' })
  @IsInt()
  @Min(1)
  version: number;
}
