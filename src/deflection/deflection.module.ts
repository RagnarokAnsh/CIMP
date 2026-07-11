import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Issue, Platform, Reporter, ReporterSubscription } from '../entities';
import { AuthModule } from '../auth/auth.module';
import { AuthzModule } from '../authz/authz.module';
import { HandoffModule } from '../handoff/handoff.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { DeflectionService } from './deflection.service';
import { DeflectionListener } from './deflection.listener';
import {
  DeflectionReporterController, PublicKnownIssuesController, PublishController,
} from './deflection.controllers';

@Module({
  imports: [
    TypeOrmModule.forFeature([Issue, Reporter, ReporterSubscription, Platform]),
    AuthModule,
    AuthzModule,
    HandoffModule,
    NotificationsModule,
  ],
  controllers: [DeflectionReporterController, PublishController, PublicKnownIssuesController],
  providers: [DeflectionService, DeflectionListener],
})
export class DeflectionModule {}
