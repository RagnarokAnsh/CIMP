import {
  CanActivate, ExecutionContext, Injectable, UnauthorizedException,
} from '@nestjs/common';
import { Request } from 'express';
import { LocalAuthService } from './local-auth.service';

// Guards staff routes: requires a valid self-issued JWT (signed with JWT_SECRET).
// On success the AuthenticatedStaff is attached to req.user. Identity comes from
// the token; authorization always comes from UserPlatformRole via ScopeService.
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly localAuth: LocalAuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: unknown }>();
    const header = req.header('authorization');
    const token = header?.startsWith('Bearer ') ? header.slice(7) : '';

    const staff = token ? await this.localAuth.verifyToken(token) : null;
    if (!staff) throw new UnauthorizedException();
    req.user = staff;
    return true;
  }
}
