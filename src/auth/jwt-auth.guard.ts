import { ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { DevAuthService } from './dev-auth.service';

// Guards staff routes: requires a valid OIDC access token. On success the
// AuthenticatedStaff is attached to req.user.
//
// When devAuth is enabled (DEV_AUTH=true, non-production), a locally-signed dev
// token is accepted first; otherwise it falls through to the OIDC strategy. The
// OIDC path is completely untouched when devAuth is off.
@Injectable()
export class JwtAuthGuard extends AuthGuard('oidc') {
  constructor(
    private readonly config: ConfigService,
    private readonly devAuth: DevAuthService,
  ) {
    super();
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    if (this.config.get<boolean>('devAuth.enabled')) {
      const req = context.switchToHttp().getRequest<Request & { user?: unknown }>();
      const header = req.header('authorization');
      const token = header?.startsWith('Bearer ') ? header.slice(7) : '';
      const staff = token ? await this.devAuth.verifyToken(token) : null;
      if (staff) {
        req.user = staff;
        return true;
      }
    }
    return (await super.canActivate(context)) as boolean;
  }
}
