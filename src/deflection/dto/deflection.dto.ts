import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class SimilarIssuesQueryDto {
  @ApiProperty({ description: 'Draft description text (min 15 chars to avoid noise).' })
  @IsString()
  @MinLength(15)
  @MaxLength(500)
  q: string;
}

export class SubscribeDto {
  @ApiProperty({ description: 'Opaque subscribe token from the similar-issues response.' })
  @IsString()
  @MaxLength(2000)
  token: string;
}
