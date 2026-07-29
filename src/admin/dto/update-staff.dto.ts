import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEmail, IsEnum, IsOptional, IsString, MaxLength, MinLength,
} from 'class-validator';
import { AccountStatus } from '../../common/enums';

// Editable identity fields on a staff row. Changing `email` also re-keys the
// user's idpSubject (`local:<email>`) and revokes their sessions — see
// AdminService.updateStaff. Setting `status` to DISABLED is the offboarding
// path: it blocks login and invalidates live tokens on the next request.
export class UpdateStaffDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ description: 'Re-keys the login subject and signs the user out.' })
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiPropertyOptional({ enum: AccountStatus })
  @IsOptional()
  @IsEnum(AccountStatus)
  status?: AccountStatus;
}
