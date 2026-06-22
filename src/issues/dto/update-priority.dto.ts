import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, Min } from 'class-validator';
import { Priority } from '../../common/enums';

export class UpdatePriorityDto {
  @ApiProperty({ enum: Priority })
  @IsEnum(Priority)
  priority: Priority;

  // Required so the optimistic-lock check (issues.service assertVersion) always
  // runs — otherwise concurrent edits silently overwrite each other.
  @ApiProperty({ description: 'Expected current version (optimistic lock).' })
  @IsInt()
  @Min(1)
  version: number;
}
