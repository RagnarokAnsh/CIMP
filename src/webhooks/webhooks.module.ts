import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Issue, WebhookEndpoint } from '../entities';
import { AuthModule } from '../auth/auth.module';
import { AuthzModule } from '../authz/authz.module';
import { WebhooksService } from './webhooks.service';
import { WebhooksListener } from './webhooks.listener';
import { WebhooksController } from './webhooks.controller';

@Module({
  imports: [
    TypeOrmModule.forFeature([WebhookEndpoint, Issue]),
    AuthModule,
    AuthzModule,
  ],
  controllers: [WebhooksController],
  providers: [WebhooksService, WebhooksListener],
})
export class WebhooksModule {}
