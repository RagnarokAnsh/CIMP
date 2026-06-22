import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { AuthzModule } from '../authz/authz.module';
import { RealtimeService } from './realtime.service';
import { RealtimeController } from './realtime.controller';
import { SseAuthGuard } from './sse-auth.guard';

@Module({
  imports: [AuthModule, AuthzModule],
  controllers: [RealtimeController],
  providers: [RealtimeService, SseAuthGuard],
})
export class RealtimeModule {}
