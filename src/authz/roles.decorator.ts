import { SetMetadata } from '@nestjs/common';
import { Role } from '../common/enums';

export const ROLES_KEY = 'roles';

// Declares which roles may invoke a handler. The PlatformAccessGuard reads this
// and checks the role against the staff member's scope (global or per-platform).
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
