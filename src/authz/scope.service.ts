import { Injectable } from '@nestjs/common';
import { Role } from '../common/enums';
import { AuthenticatedStaff } from '../auth/auth.types';

export type PlatformScope = string[] | 'ALL';

// Pure authorization logic over a staff member's role grants. No DB access —
// the grants are loaded once at authentication time and carried on the request.
@Injectable()
export class ScopeService {
  // Which platforms this staff member can see. 'ALL' when they hold any global
  // grant (global developer or admin); otherwise the distinct set of platform
  // ids they hold any role on. Used to filter list/dashboard queries.
  scopedPlatformIds(staff: AuthenticatedStaff): PlatformScope {
    if (staff.roles.some((g) => g.platformId === null)) return 'ALL';
    const ids = new Set<string>();
    for (const g of staff.roles) {
      if (g.platformId) ids.add(g.platformId);
    }
    return [...ids];
  }

  // True if the staff member holds one of `requiredRoles` either globally
  // (platformId null) or specifically for `platformId`.
  canAccessPlatform(
    staff: AuthenticatedStaff,
    platformId: string,
    requiredRoles: Role[],
  ): boolean {
    return staff.roles.some(
      (g) =>
        requiredRoles.includes(g.role) &&
        (g.platformId === null || g.platformId === platformId),
    );
  }

  // True if the scope permits this platform (used after scopedPlatformIds).
  scopeAllows(scope: PlatformScope, platformId: string): boolean {
    return scope === 'ALL' || scope.includes(platformId);
  }
}
