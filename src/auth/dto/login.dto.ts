import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'priya@example.org' })
  @IsEmail()
  email: string;

  // No length rule on the submitted password, on purpose. Validating the length
  // of a login attempt decides nothing — the value either matches the stored
  // bcrypt hash or it doesn't — and a 400 "too short" sitting next to a 401
  // "wrong password" leaks the policy length to anyone probing the endpoint. The
  // 12-char floor belongs where passwords are SET (CreateStaffDto /
  // SetPasswordDto); the old @MinLength(8) here both understated that policy in
  // the public docs and would, if raised to 12, lock out every account whose
  // password predates it. @IsString must stay — the global whitelist pipe strips
  // properties that carry no validation decorator.
  @ApiProperty({
    description: 'Staff password. Length policy is enforced where passwords are set, not here.',
  })
  @IsString()
  password: string;
}
