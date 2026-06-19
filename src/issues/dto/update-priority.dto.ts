import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { Priority } from '../../common/enums';

export class UpdatePriorityDto {
  @ApiProperty({ enum: Priority })
  @IsEnum(Priority)
  priority: Priority;

  @ApiProperty({ description: 'Expected current version (optimistic lock).' })
  @IsOptional()
  @IsInt()
  @Min(1)
  version: number;
}
