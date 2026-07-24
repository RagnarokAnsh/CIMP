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
import { STAFF_READ_ROLES, STAFF_WRITE_ROLES } from './role-sets';

// Version-agnostic RFC-4122 shape, deliberately as permissive as ParseUUIDPipe's
// default so the guard never rejects an id the route's own pipe would accept.
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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
    // Routes without an explicit @Roles default to the WRITE set — fail-closed:
    // a read-only WATCHER only reaches routes that opt in via @Roles.
    const required =
      this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
        ctx.getHandler(),
        ctx.getClass(),
      ]) ?? STAFF_WRITE_ROLES;

    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthenticatedStaff }>();
    const staff = req.user;
    if (!staff) throw new ForbiddenException('Not authenticated');

    const issueId = req.params?.id;
    if (issueId) {
      // Guards run before pipes, so ParseUUIDPipe has not vetted `:id` yet. Handing a
      // non-UUID to the repository makes Postgres raise 22P02 (invalid uuid syntax),
      // which is not an HttpException and surfaces as a 500 on every /staff/issues/:id
      // route. Reject it here as 404, not 400: every unusable id — not-found,
      // out-of-scope (below), malformed — must answer identically, so the response
      // stays useless as an oracle for which issue ids exist.
      if (!UUID_PATTERN.test(issueId)) throw new NotFoundException('Issue not found');
      const issue = await this.issues.findOne({
        where: { id: issueId },
        relations: { platform: true },
      });
      if (!issue) throw new NotFoundException('Issue not found');
      // Hide cross-tenant existence: a staff member with NO role on the issue's
      // platform gets 404 (identical to not-found), so issue ids cannot be
      // enumerated across platforms via a 403-vs-404 oracle. A staff member who
      // IS scoped to the platform but lacks the specific role for this action
      // gets a truthful 403.
      if (!this.scope.canAccessPlatform(staff, issue.platform.id, STAFF_READ_ROLES)) {
        throw new NotFoundException('Issue not found');
      }
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
