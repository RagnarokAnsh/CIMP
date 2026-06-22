import {
  Controller, MessageEvent, Sse, UseGuards,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle } from '@nestjs/throttler';
import { Observable, filter, interval, map, merge } from 'rxjs';
import { CurrentStaff } from '../auth/current-staff.decorator';
import { AuthenticatedStaff } from '../auth/auth.types';
import { ScopeService } from '../authz/scope.service';
import { RealtimeEvent, RealtimeService } from './realtime.service';
import { SseAuthGuard } from './sse-auth.guard';

// Server-Sent Events stream for the staff workspace. Each connection only
// receives events for platforms in the caller's scope (plus events explicitly
// targeted at them). A periodic ping keeps the connection alive through proxies.
@ApiTags('staff-realtime')
@SkipThrottle()
@Controller('staff')
export class RealtimeController {
  constructor(
    private readonly realtime: RealtimeService,
    private readonly scope: ScopeService,
  ) {}

  @Sse('events')
  @UseGuards(SseAuthGuard)
  @ApiOperation({ summary: 'Live event stream (SSE). Auth via ?access_token=.' })
  events(@CurrentStaff() staff: AuthenticatedStaff): Observable<MessageEvent> {
    const allowed = this.scope.scopedPlatformIds(staff);
    const inScope = (e: RealtimeEvent): boolean =>
      allowed === 'ALL' ||
      allowed.includes(e.platformId) ||
      (e.targetStaffIds?.includes(staff.id) ?? false);

    const live = this.realtime.events$.pipe(
      filter(inScope),
      map((e) => ({ data: e }) as MessageEvent),
    );

    // Keep-alive so idle SSE connections aren't dropped by proxies.
    const heartbeat = interval(25_000).pipe(
      map(() => ({ data: { type: 'ping' } }) as MessageEvent),
    );

    return merge(live, heartbeat);
  }
}
