import { ExecutionContext, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DevAuthService } from '../auth/dev-auth.service';
import { LocalAuthService } from '../auth/local-auth.service';

// SSE can't set Authorization headers (EventSource has no header API), so the
// token arrives as a `?access_token=` query param. We promote it into the
// Authorization header, then reuse the normal JwtAuthGuard — so both the dev and
// OIDC auth paths work unchanged.
@Injectable()
export class SseAuthGuard extends JwtAuthGuard {
  constructor(config: ConfigService, devAuth: DevAuthService, localAuth: LocalAuthService) {
    super(config, devAuth, localAuth);
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    if (!req.headers.authorization) {
      const token = req.query?.access_token;
      if (typeof token === 'string' && token) {
        req.headers.authorization = `Bearer ${token}`;
      }
    }
    return super.canActivate(context);
  }
}
