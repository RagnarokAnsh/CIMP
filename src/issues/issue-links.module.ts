import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Issue, IssueLink } from '../entities';
import { AuthModule } from '../auth/auth.module';
import { AuthzModule } from '../authz/authz.module';
import { IssueLinksController } from './issue-links.controller';
import { IssueLinksService } from './issue-links.service';

@Module({
  imports: [TypeOrmModule.forFeature([IssueLink, Issue]), AuthModule, AuthzModule],
  controllers: [IssueLinksController],
  providers: [IssueLinksService],
})
export class IssueLinksModule {}
