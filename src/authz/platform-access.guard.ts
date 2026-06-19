import {
  CanActivate, ExecutionContext, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Request } from 'express';
import { Role } from '../common/enums';
import { Issue } from '../entities';
import { AuthenticatedStaff } from '../auth/auth.types';
import { ROLES_KEY } from './roles.decorator';
import { ScopeService } from './scope.service';

const ALL_STAFF_ROLES: Role[] = [Role.FOCAL_POINT, Role.DEVELOPER, Role.ADMIN];

// Enforces role + platform scope. Runs after JwtAuthGuard (req.user is set).
// For routes carrying an issue `:id`, it resolves the issue's platform and
// requires the staff member to hold one of the route's roles for that platform
// (or globally). For routes without an issue id, it requires the role in any
// scope (admin routes use this branch — admins are always global).
@Injectable()
export class PlatformAccessGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly scope: ScopeService,
    @InjectRepository(Issue) private readonly issues: Repository<Issue>,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const required =
      this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
        ctx.getHandler(),
        ctx.getClass(),
      ]) ?? ALL_STAFF_ROLES;

    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthenticatedStaff }>();
    const staff = req.user;
    if (!staff) throw new ForbiddenException('Not authenticated');

    const issueId = req.params?.id;
    if (issueId) {
      const issue = await this.issues.findOne({
        where: { id: issueId },
        relations: { platform: true },
      });
      if (!issue) throw new NotFoundException('Issue not found');
      if (!this.scope.canAccessPlatform(staff, issue.platform.id, required)) {
        throw new ForbiddenException('You do not have access to this issue.');
      }
      return true;
    }

    // No issue context: require the role in any scope.
    if (!staff.roles.some((g) => required.includes(g.role))) {
      throw new ForbiddenException('Insufficient role.');
    }
    return true;
  }
}
