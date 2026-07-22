import { Role } from '../common/enums';

// Password-login staff are keyed `local:<email>` so a self-issued token's `sub`
// resolves back to the row that AdminService created. OIDC subjects never carry
// this prefix, which is what lets upsertFromClaims tell "provisioned here" from
// "vouched for by an external IdP".
export const LOCAL_SUBJECT_PREFIX = 'local:';

export function localSubject(email: string): string {
  return `${LOCAL_SUBJECT_PREFIX}${email.toLowerCase()}`;
}

// Shape of an authenticated staff member attached to the request after the
// JWT guard runs: the StaffUser plus a flattened view of their role grants.
export interface AuthenticatedStaff {
  id: string;
  idpSubject: string;
  name: string;
  email: string;
  roles: StaffRoleGrant[];
}

export interface StaffRoleGrant {
  role: Role;
  // null = global scope (all platforms).
  platformId: string | null;
}

// Validated self-issued JWT claims.
export interface TokenClaims {
  sub: string;
  name?: string;
  email?: string;
  // Token version stamped at login; must match the StaffUser's current
  // tokenVersion or the token is treated as revoked.
  tv?: number;
}
