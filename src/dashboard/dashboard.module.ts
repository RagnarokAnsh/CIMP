import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Issue, Platform } from '../entities';
import { AuthModule } from '../auth/auth.module';
import { AuthzModule } from '../authz/authz.module';
import { DashboardController, PlatformReportController } from './dashboard.controller';
import { DashboardService } from './dashboard.service';

@Module({
  imports: [TypeOrmModule.forFeature([Issue, Platform]), AuthModule, AuthzModule],
  controllers: [DashboardController, PlatformReportController],
  providers: [DashboardService],
})
export class DashboardModule {}
