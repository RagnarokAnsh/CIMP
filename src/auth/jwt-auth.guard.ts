import { ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { DevAuthService } from './dev-auth.service';
import { LocalAuthService } from './local-auth.service';

// Guards staff routes; on success attaches AuthenticatedStaff to req.user.
//
// Tries, in order: a self-issued JWT (LocalAuthService, when JWT_SECRET is set),
// then the dev shim (non-production), then the OIDC strategy. Each tries its own
// secret and returns null on mismatch, so the next method gets a turn — and the
// OIDC path is untouched when the others are disabled.
@Injectable()
export class JwtAuthGuard extends AuthGuard('oidc') {
  constructor(
    private readonly config: ConfigService,
    private readonly devAuth: DevAuthService,
    private readonly localAuth: LocalAuthService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: unknown }>();
    const header = req.header('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7) : '';

    if (token && this.localAuth.enabled) {
      const staff = await this.localAuth.verifyToken(token);
      if (staff) {
        req.user = staff;
        return true;
      }
    }

    if (token && this.config.get<boolean>('devAuth.enabled')) {
      const staff = await this.devAuth.verifyToken(token);
      if (staff) {
        req.user = staff;
        return true;
      }
    }

    return (await super.canActivate(context)) as boolean;
  }
}
