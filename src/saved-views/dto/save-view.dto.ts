import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsString, MaxLength, MinLength } from 'class-validator';

export class SaveViewDto {
  @ApiProperty({ description: 'View name (unique per staff member).' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name: string;

  @ApiProperty({ description: 'Opaque filter payload owned by the frontend.' })
  @IsObject()
  filters: Record<string, unknown>;
}
