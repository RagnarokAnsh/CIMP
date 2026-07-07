import type { StaffMe } from '@/api/types';

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
