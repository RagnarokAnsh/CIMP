import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';
import { validate } from './config/env.validation';
import { ALL_ENTITIES } from './entities';
import { StorageModule } from './storage/storage.module';
import { ScanningModule } from './scanning/scanning.module';
import { HandoffModule } from './handoff/handoff.module';
import { ReporterModule } from './reporter/reporter.module';
import { AuthModule } from './auth/auth.module';
import { AuthzModule } from './authz/authz.module';
import { AuditModule } from './audit/audit.module';
import { IssuesModule } from './issues/issues.module';
import { CommentsModule } from './comments/comments.module';
import { NotificationsModule } from './notifications/notifications.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { AdminModule } from './admin/admin.module';
import { JiraModule } from './jira/jira.module';
import { HealthModule } from './health/health.module';
import { SavedViewsModule } from './saved-views/saved-views.module';
import { RealtimeModule } from './realtime/realtime.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration], validate }),
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get<string>('database.host'),
        port: config.get<number>('database.port'),
        username: config.get<string>('database.user'),
        password: config.get<string>('database.password'),
        database: config.get<string>('database.name'),
        entities: ALL_ENTITIES,
        // DEV ONLY. Use migrations in production.
        synchronize: config.get<boolean>('database.synchronize'),
      }),
    }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: (config.get<number>('throttle.ttl') ?? 60) * 1000,
          limit: config.get<number>('throttle.limit') ?? 120,
        },
      ],
    }),
    EventEmitterModule.forRoot(),
    StorageModule,
    ScanningModule,
    HandoffModule,
    ReporterModule,
    AuthModule,
    AuthzModule,
    AuditModule,
    IssuesModule,
    CommentsModule,
    NotificationsModule,
    DashboardModule,
    AdminModule,
    JiraModule,
    HealthModule,
    SavedViewsModule,
    RealtimeModule,
  ],
  providers: [
    // Global rate limiting; intake route tightens this further.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
