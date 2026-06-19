import {
  CanActivate, ExecutionContext, ForbiddenException, Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { Role } from '../common/enums';
import { AuthenticatedStaff } from '../auth/auth.types';
import { ROLES_KEY } from './roles.decorator';

// Role-only guard (no issue/platform resolution). Use for routes whose access
// is purely role-based — chiefly admin routes, where the role (ADMIN) is always
// global. Runs after JwtAuthGuard.
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthenticatedStaff }>();
    const staff = req.user;
    if (!staff || !staff.roles.some((g) => required.includes(g.role))) {
      throw new ForbiddenException('Insufficient role.');
    }
    return true;
  }
}
