import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { StaffUser, UserPlatformRole } from '../entities';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './jwt-auth.guard';
import { StaffController } from './staff.controller';
import { LocalAuthService } from './local-auth.service';
import { LocalAuthController } from './local-auth.controller';

@Module({
  imports: [TypeOrmModule.forFeature([StaffUser, UserPlatformRole])],
  controllers: [StaffController, LocalAuthController],
  providers: [AuthService, JwtAuthGuard, LocalAuthService],
  // LocalAuthService is exported because JwtAuthGuard (used in other modules via
  // @UseGuards) depends on it and is instantiated in those modules' contexts.
  exports: [AuthService, JwtAuthGuard, LocalAuthService],
})
export class AuthModule {}
