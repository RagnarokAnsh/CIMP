import type { Role, StaffMe } from '@/api/types';

// Mirrors the server's read/write role split (src/authz/role-sets.ts) so the UI
// only offers actions that will succeed. WATCHER is read-only: a watcher grant
// scopes what you can SEE, never what you can change. The server remains the
// enforcement point — this is UX gating only.

// True if the user holds a write role (anything but WATCHER) globally or on the
// given platform.
export function canWriteOn(me: StaffMe | undefined, platformId: string | null | undefined): boolean {
  if (!me || !platformId) return false;
  return me.roles.some(
    (r) => r.role !== 'WATCHER' && (r.platformId === null || r.platformId === platformId),
  );
}

// True if the user holds a write role anywhere — gates cross-platform surfaces
// like the bulk-edit toolbar (per-issue enforcement still happens server-side).
export function canWriteAnywhere(me: StaffMe | undefined): boolean {
  return Boolean(me?.roles.some((r) => r.role !== 'WATCHER'));
}

// Same shape as the server's ScopeService.canAccessPlatform: a grant counts when
// it is global (platformId null) or names this exact platform.
function holdsAnyOn(
  me: StaffMe | undefined,
  platformId: string | null | undefined,
  roles: Role[],
): boolean {
  if (!me || !platformId) return false;
  return me.roles.some(
    (r) => roles.includes(r.role) && (r.platformId === null || r.platformId === platformId),
  );
}

// True if the user holds a DEVELOPER grant globally or on the given platform —
// mirrors the server's assignee check in IssuesService.applyAssignment, which
// rejects an assignee who isn't a developer on the issue's platform with a 400.
export function canDevelopOn(
  me: StaffMe | undefined,
  platformId: string | null | undefined,
): boolean {
  return holdsAnyOn(me, platformId, ['DEVELOPER']);
}

// Mirrors IssuesService.assertCanTransition (the OD-09 seam): DEVELOPER/ADMIN may
// always transition, FOCAL_POINT only when the server reports the policy as on.
// The flag is absent on older /staff/me responses — treat that as off, matching
// the server default, so we never offer a control that 403s.
export function canTransitionStatusOn(
  me: StaffMe | undefined,
  platformId: string | null | undefined,
): boolean {
  const roles: Role[] = ['DEVELOPER', 'ADMIN'];
  if (me?.policy?.focalPointCanTransition) roles.push('FOCAL_POINT');
  return holdsAnyOn(me, platformId, roles);
}
