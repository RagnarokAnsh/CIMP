import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsOptional, IsUUID, Min, ValidateIf } from 'class-validator';

export class UpdateAssignmentDto {
  @ApiProperty({
    description: 'Staff id of a developer on this platform, or null to unassign.',
    nullable: true,
  })
  @ValidateIf((o) => o.assigneeId !== null)
  @IsUUID()
  assigneeId: string | null;

  @ApiProperty({ description: 'Expected current version (optimistic lock).' })
  @IsOptional()
  @IsInt()
  @Min(1)
  version: number;
}
