import { Body, Controller, Post } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { LocalAuthService } from './local-auth.service';
import { LoginDto } from './dto/login.dto';

// Self-issued JWT login. Public + rate-limited (credential stuffing defense).
@ApiTags('auth')
@Controller('auth')
export class LocalAuthController {
  constructor(private readonly local: LocalAuthService) {}

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Staff password login → { accessToken }.' })
  login(@Body() dto: LoginDto) {
    return this.local.login(dto.email, dto.password);
  }
}
