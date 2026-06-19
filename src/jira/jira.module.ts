import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Attachment, Issue } from '../entities';
import { JiraService } from './jira.service';
import { JiraListener } from './jira.listener';

@Module({
  imports: [TypeOrmModule.forFeature([Issue, Attachment])],
  providers: [JiraService, JiraListener],
  exports: [JiraService],
})
export class JiraModule {}
