import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Issue, Platform, StaffUser, UserPlatformRole,
} from '../entities';
import { AuthModule } from '../auth/auth.module';
import { AuthzModule } from '../authz/authz.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [
    // Issue is read-only here — deletePlatform counts them to decide whether a
    // hard delete is allowed (Issue.platform is ON DELETE RESTRICT).
    TypeOrmModule.forFeature([Platform, StaffUser, UserPlatformRole, Issue]),
    AuthModule,
    AuthzModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
