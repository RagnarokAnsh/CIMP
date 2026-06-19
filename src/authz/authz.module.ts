import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Issue } from '../entities';
import { ScopeService } from './scope.service';
import { PlatformAccessGuard } from './platform-access.guard';
import { RolesGuard } from './roles.guard';

// Authorization backbone: scope logic + the platform-access guard, shared by
// the issue, comment, dashboard and admin modules.
@Module({
  imports: [TypeOrmModule.forFeature([Issue])],
  providers: [ScopeService, PlatformAccessGuard, RolesGuard],
  exports: [ScopeService, PlatformAccessGuard, RolesGuard],
})
export class AuthzModule {}
