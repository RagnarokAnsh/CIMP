import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  Attachment, Comment, Issue, IssueLink, Platform, StaffUser, UserPlatformRole,
} from '../entities';
import { AuthModule } from '../auth/auth.module';
import { AuthzModule } from '../authz/authz.module';
import { IssuesController } from './issues.controller';
import { IssuesService } from './issues.service';
import { MergeService } from './merge.service';
import { AttachmentsController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { StaffPlatformsController } from './platforms.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Issue, StaffUser, Attachment, UserPlatformRole, Platform, Comment, IssueLink,
    ]),
    AuthModule,
    AuthzModule,
  ],
  controllers: [IssuesController, AttachmentsController, StaffPlatformsController],
  providers: [IssuesService, MergeService, AttachmentsService],
  exports: [IssuesService],
})
export class IssuesModule {}
