import {
  Controller, Logger, MessageEvent, Post, Sse, UnauthorizedException, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { Observable, Subject, concatMap, filter, interval, map, merge, takeUntil } from 'rxjs';
import { CurrentStaff } from '../auth/current-staff.decorator';
import { AuthenticatedStaff } from '../auth/auth.types';
import { AuthService } from '../auth/auth.service';
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
  private readonly logger = new Logger(RealtimeController.name);

  constructor(
    private readonly realtime: RealtimeService,
    private readonly scope: ScopeService,
    private readonly localAuth: LocalAuthService,
    private readonly auth: AuthService,
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
    // Mutable on purpose: this connection outlives role changes, so the scope
    // resolved at connect time goes stale. Re-resolved on every heartbeat tick.
    let allowed = this.scope.scopedPlatformIds(staff);
    const inScope = (e: RealtimeEvent): boolean =>
      this.scope.scopeAllows(allowed, e.platformId) ||
      // Escape hatch: an @mention or assignment reaches its target regardless
      // of platform scope.
      (e.targetStaffIds?.includes(staff.id) ?? false);

    const live = this.realtime.events$.pipe(
      filter(inScope),
      map((e) => ({ data: e }) as MessageEvent),
    );

    // Revocation must not wait for the connection to end. Every ordinary request
    // re-checks status + grants (AuthService.upsertFromClaims), but this stream is
    // authenticated once and held open for hours — without this it would keep
    // pushing events for platforms the caller has since lost access to.
    const revoked = new Subject<void>();

    // Keep-alive so idle SSE connections aren't dropped by proxies — and the tick
    // we piggyback the re-authorization on.
    const heartbeat = interval(25_000).pipe(
      concatMap(async () => {
        try {
          const fresh = await this.auth.refreshAuthenticated(staff.id);
          // Account deleted or no longer ACTIVE: complete the stream. The browser
          // reconnects and that attempt fails cleanly at /events/ticket.
          if (!fresh) revoked.next();
          else allowed = this.scope.scopedPlatformIds(fresh);
        } catch (err) {
          // A DB hiccup must not silently kill a healthy stream: keep the scope we
          // already have and retry next tick, but never fail closed in silence.
          this.logger.warn(
            `SSE re-authorization failed for staff ${staff.id}, keeping previous scope: `
            + `${(err as Error).message}`,
          );
        }
      }),
      map(() => ({ data: { type: 'ping' } }) as MessageEvent),
    );

    return merge(live, heartbeat).pipe(takeUntil(revoked));
  }
}
