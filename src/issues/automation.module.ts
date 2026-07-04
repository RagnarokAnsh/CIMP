import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AutomationRule, Issue, IssueLabel } from '../entities';
import { AuthModule } from '../auth/auth.module';
import { AuthzModule } from '../authz/authz.module';
import { AutomationController } from './automation.controller';
import { AutomationService } from './automation.service';
import { AutomationListener } from './automation.listener';

@Module({
  imports: [TypeOrmModule.forFeature([AutomationRule, Issue, IssueLabel]), AuthModule, AuthzModule],
  controllers: [AutomationController],
  providers: [AutomationService, AutomationListener],
})
export class AutomationModule {}
