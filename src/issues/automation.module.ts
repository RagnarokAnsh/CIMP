import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import {
  AutomationRule, Issue, IssueLabel, Label, StaffUser,
} from '../entities';
import { AuthModule } from '../auth/auth.module';
import { AuthzModule } from '../authz/authz.module';
import { AutomationController } from './automation.controller';
import { AutomationService } from './automation.service';
import { AutomationListener } from './automation.listener';

@Module({
  // StaffUser + Label back the action-value checks (an ASSIGN target must be an
  // active developer on the platform; an ADD_LABEL target must be its label).
  imports: [
    TypeOrmModule.forFeature([AutomationRule, Issue, IssueLabel, Label, StaffUser]),
    AuthModule,
    AuthzModule,
  ],
  controllers: [AutomationController],
  providers: [AutomationService, AutomationListener],
})
export class AutomationModule {}
