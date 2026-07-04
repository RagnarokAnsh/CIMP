import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class SetPasswordDto {
  @ApiProperty({ minLength: 12 })
  @IsString()
  @MinLength(12)
  @MaxLength(200)
  password: string;
}
