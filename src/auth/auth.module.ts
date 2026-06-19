import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StaffUser, UserPlatformRole } from '../entities';
import { AuthService } from './auth.service';
import { OidcStrategy } from './oidc.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { StaffController } from './staff.controller';
import { DevAuthService } from './dev-auth.service';
import { DevAuthController } from './dev-auth.controller';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'oidc' }),
    TypeOrmModule.forFeature([StaffUser, UserPlatformRole]),
  ],
  controllers: [StaffController, DevAuthController],
  providers: [AuthService, OidcStrategy, JwtAuthGuard, DevAuthService],
  // DevAuthService is exported because JwtAuthGuard (used in other modules via
  // @UseGuards) depends on it and is instantiated in those modules' contexts.
  exports: [AuthService, JwtAuthGuard, DevAuthService, PassportModule],
})
export class AuthModule {}
