import {
  CanActivate, ExecutionContext, Injectable, UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { LocalAuthService } from '../auth/local-auth.service';

// SSE can't set Authorization headers (EventSource has no header API), so the
// caller first POSTs /api/staff/events/ticket (bearer-authenticated) to get a
// short-lived, audience-scoped ticket, then connects with `?ticket=`. We verify
// that ticket here — the full session JWT is NEVER placed in the URL.
@Injectable()
export class SseAuthGuard implements CanActivate {
  constructor(private readonly localAuth: LocalAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: unknown }>();
    const ticket = typeof req.query?.ticket === 'string' ? req.query.ticket : '';
    const staff = ticket ? await this.localAuth.verifySseTicket(ticket) : null;
    if (!staff) throw new UnauthorizedException();
    req.user = staff;
    return true;
  }
}
