import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Platform, StatusComponent, StatusIncident, StatusIncidentUpdate,
} from '../entities';
import { AuthModule } from '../auth/auth.module';
import { AuthzModule } from '../authz/authz.module';
import { PublicStatusController, StaffStatusController } from './status.controller';
import { StatusService } from './status.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([StatusComponent, StatusIncident, StatusIncidentUpdate, Platform]),
    AuthModule,
    AuthzModule,
  ],
  controllers: [StaffStatusController, PublicStatusController],
  providers: [StatusService],
})
export class StatusModule {}
