import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Issue, IssueWatcher, NotificationLog, Platform, StaffUser, UserPlatformRole,
} from '../entities';
import { AuthModule } from '../auth/auth.module';
import { MailService } from './mail.service';
import { NotificationsService } from './notifications.service';
import { NotificationsListener } from './notifications.listener';
import { NotificationsController } from './notifications.controller';
import { DigestService } from './digest.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([NotificationLog, UserPlatformRole, StaffUser, Issue, IssueWatcher, Platform]),
    AuthModule,
  ],
  controllers: [NotificationsController],
  providers: [MailService, NotificationsService, NotificationsListener, DigestService],
  exports: [NotificationsService, MailService],
})
export class NotificationsModule {}
