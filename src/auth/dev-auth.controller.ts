import {
  Body, Controller, Get, NotFoundException, Post,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';
import { DevAuthService } from './dev-auth.service';

class DevLoginDto {
  @IsString()
  @MinLength(1)
  idpSubject: string;
}

// DEV ONLY login. All routes 404 unless devAuth is enabled, so this is inert in
// any environment that doesn't explicitly opt in.
@ApiTags('dev-auth')
@Controller('auth/dev')
export class DevAuthController {
  constructor(private readonly dev: DevAuthService) {}

  @Get('users')
  @ApiOperation({ summary: 'DEV: list seeded staff for the login picker.' })
  async users() {
    if (!this.dev.enabled) throw new NotFoundException();
    return this.dev.listStaff();
  }

  @Post('login')
  @ApiOperation({ summary: 'DEV: sign in as a staff member (no OIDC).' })
  async login(@Body() dto: DevLoginDto) {
    if (!this.dev.enabled) throw new NotFoundException();
    return this.dev.mintToken(dto.idpSubject);
  }
}
