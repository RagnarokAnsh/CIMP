import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateStaffDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;

  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty({ minLength: 8, description: 'Initial password (bcrypt-hashed at rest).' })
  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password: string;
}
