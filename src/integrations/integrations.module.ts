import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ApiToken, Issue } from '../entities';
import { AuditModule } from '../audit/audit.module';
import { AuthModule } from '../auth/auth.module';
import { AuthzModule } from '../authz/authz.module';
import { ApiTokensController, IntegrationIssuesController } from './api-tokens.controller';
import { ApiTokensService } from './api-tokens.service';
import { ApiTokenGuard } from './api-token.guard';

@Module({
  imports: [TypeOrmModule.forFeature([ApiToken, Issue]), AuditModule, AuthModule, AuthzModule],
  controllers: [ApiTokensController, IntegrationIssuesController],
  providers: [ApiTokensService, ApiTokenGuard],
})
export class IntegrationsModule {}
