import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Attachment, Issue } from '../entities';
import { JiraService } from './jira.service';
import { JiraListener } from './jira.listener';
import { JiraInboundService } from './jira-inbound.service';
import { JiraWebhookController } from './jira-webhook.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Issue, Attachment])],
  controllers: [JiraWebhookController],
  providers: [JiraService, JiraListener, JiraInboundService],
  exports: [JiraService],
})
export class JiraModule {}
