import { Role } from '../common/enums';

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
}
