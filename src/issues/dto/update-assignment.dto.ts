import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsUUID, Min, ValidateIf } from 'class-validator';

export class UpdateAssignmentDto {
  @ApiProperty({
    description: 'Staff id of a developer on this platform, or null to unassign.',
    nullable: true,
  })
  @ValidateIf((o) => o.assigneeId !== null)
  @IsUUID()
  assigneeId: string | null;

  // Required so the optimistic-lock check (issues.service assertVersion) always
  // runs — otherwise concurrent edits silently overwrite each other.
  @ApiProperty({ description: 'Expected current version (optimistic lock).' })
  @IsInt()
  @Min(1)
  version: number;
}
