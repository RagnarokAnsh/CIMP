import {
  Controller, MessageEvent, Post, Sse, UnauthorizedException, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { Observable, filter, interval, map, merge } from 'rxjs';
import { CurrentStaff } from '../auth/current-staff.decorator';
import { AuthenticatedStaff } from '../auth/auth.types';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { LocalAuthService } from '../auth/local-auth.service';
import { ScopeService } from '../authz/scope.service';
import { RealtimeEvent, RealtimeService } from './realtime.service';
import { SseAuthGuard } from './sse-auth.guard';

// Server-Sent Events stream for the staff workspace. Each connection only
// receives events for platforms in the caller's scope (plus events explicitly
// targeted at them). A periodic ping keeps the connection alive through proxies.
@ApiTags('staff-realtime')
@Controller('staff')
export class RealtimeController {
  constructor(
    private readonly realtime: RealtimeService,
    private readonly scope: ScopeService,
    private readonly localAuth: LocalAuthService,
  ) {}

  // Bearer-authenticated (header, not URL): exchange the session token for a
  // short-lived SSE ticket. Lightly throttled to blunt ticket farming.
  @Post('events/ticket')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('staff')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  @ApiOperation({ summary: 'Get a short-lived ticket to open the SSE stream.' })
  async ticket(@CurrentStaff() staff: AuthenticatedStaff): Promise<{ ticket: string }> {
    const ticket = await this.localAuth.signSseTicket(staff.idpSubject);
    if (!ticket) throw new UnauthorizedException();
    return { ticket };
  }

  @Sse('events')
  @SkipThrottle()
  @UseGuards(SseAuthGuard)
  @ApiOperation({ summary: 'Live event stream (SSE). Auth via a ?ticket= from /events/ticket.' })
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
