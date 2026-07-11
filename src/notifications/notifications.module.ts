import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Issue, IssueWatcher, NotificationLog, StaffUser, UserPlatformRole,
} from '../entities';
import { AuthModule } from '../auth/auth.module';
import { MailService } from './mail.service';
import { NotificationsService } from './notifications.service';
import { NotificationsListener } from './notifications.listener';
import { NotificationsController } from './notifications.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([NotificationLog, UserPlatformRole, StaffUser, Issue, IssueWatcher]),
    AuthModule,
  ],
  controllers: [NotificationsController],
  providers: [MailService, NotificationsService, NotificationsListener],
  exports: [NotificationsService, MailService],
})
export class NotificationsModule {}
