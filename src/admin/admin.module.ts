import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Platform, StaffUser, UserPlatformRole } from '../entities';
import { AuthModule } from '../auth/auth.module';
import { AuthzModule } from '../authz/authz.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Platform, StaffUser, UserPlatformRole]),
    AuthModule,
    AuthzModule,
  ],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
