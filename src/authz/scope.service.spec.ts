import { Role } from '../common/enums';
import { AuthenticatedStaff } from '../auth/auth.types';
import { ScopeService } from './scope.service';

const PORTAL_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const PORTAL_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

function staffWith(roles: AuthenticatedStaff['roles']): AuthenticatedStaff {
  return { id: 's1', idpSubject: 'sub', name: 'S', email: 's@x', roles };
}

describe('ScopeService', () => {
  const scope = new ScopeService();

  describe('scopedPlatformIds', () => {
    it('returns ALL for an admin (global grant)', () => {
      const admin = staffWith([{ role: Role.ADMIN, platformId: null }]);
      expect(scope.scopedPlatformIds(admin)).toBe('ALL');
    });

    it('returns ALL for a global developer', () => {
      const dev = staffWith([{ role: Role.DEVELOPER, platformId: null }]);
      expect(scope.scopedPlatformIds(dev)).toBe('ALL');
    });

    it('returns the platform set for a scoped focal point', () => {
      const fp = staffWith([
        { role: Role.FOCAL_POINT, platformId: PORTAL_A },
        { role: Role.DEVELOPER, platformId: PORTAL_B },
      ]);
      expect(scope.scopedPlatformIds(fp)).toEqual([PORTAL_A, PORTAL_B]);
    });

    it('returns an empty set for staff with no grants', () => {
      expect(scope.scopedPlatformIds(staffWith([]))).toEqual([]);
    });
  });

  describe('canAccessPlatform', () => {
    it('lets a Portal A focal point access Portal A', () => {
      const fp = staffWith([{ role: Role.FOCAL_POINT, platformId: PORTAL_A }]);
      expect(scope.canAccessPlatform(fp, PORTAL_A, [Role.FOCAL_POINT])).toBe(true);
    });

    it('denies a Portal A focal point on Portal B (the 403 case)', () => {
      const fp = staffWith([{ role: Role.FOCAL_POINT, platformId: PORTAL_A }]);
      expect(scope.canAccessPlatform(fp, PORTAL_B, [Role.FOCAL_POINT])).toBe(false);
    });

    it('lets an admin access any platform', () => {
      const admin = staffWith([{ role: Role.ADMIN, platformId: null }]);
      expect(scope.canAccessPlatform(admin, PORTAL_B, [Role.ADMIN])).toBe(true);
    });

    it('lets a global developer access any platform', () => {
      const dev = staffWith([{ role: Role.DEVELOPER, platformId: null }]);
      expect(scope.canAccessPlatform(dev, PORTAL_A, [Role.DEVELOPER])).toBe(true);
    });

    it('denies when the role does not match even with platform scope', () => {
      const fp = staffWith([{ role: Role.FOCAL_POINT, platformId: PORTAL_A }]);
      expect(scope.canAccessPlatform(fp, PORTAL_A, [Role.DEVELOPER])).toBe(false);
    });
  });

  describe('scopeAllows', () => {
    it('ALL allows anything', () => {
      expect(scope.scopeAllows('ALL', PORTAL_A)).toBe(true);
    });
    it('a list allows only its members', () => {
      expect(scope.scopeAllows([PORTAL_A], PORTAL_A)).toBe(true);
      expect(scope.scopeAllows([PORTAL_A], PORTAL_B)).toBe(false);
    });
  });
});
