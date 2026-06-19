import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsOptional, IsUUID, ValidateIf } from 'class-validator';
import { Role } from '../../common/enums';

export class AssignRoleDto {
  @ApiProperty({ description: 'Staff user id.' })
  @IsUUID()
  staffUserId: string;

  @ApiProperty({ enum: Role })
  @IsEnum(Role)
  role: Role;

  @ApiProperty({
    description: 'Platform id, or null for global scope (developers/admins).',
    nullable: true,
  })
  @ValidateIf((o) => o.platformId !== null && o.platformId !== undefined)
  @IsUUID()
  platformId: string | null;
}
