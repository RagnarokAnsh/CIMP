import { ApiProperty } from '@nestjs/swagger';
import { IsObject, IsString, MaxLength, MinLength } from 'class-validator';

export class SaveViewDto {
  @ApiProperty({ description: 'View name (unique per staff member).' })
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  name: string;

  // Size is capped in SavedViewsService.save, not here: class-validator has no
  // serialized-byte constraint (@MaxLength measures string length only), and the
  // payload is deliberately opaque so its keys can't be enumerated on a DTO.
  @ApiProperty({ description: 'Opaque filter payload owned by the frontend.' })
  @IsObject()
  filters: Record<string, unknown>;
}
