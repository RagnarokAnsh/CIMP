import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { AccountStatus, PlatformStatus, Role } from '../common/enums';
import { AuthenticatedStaff } from '../auth/auth.types';

// Covers the destructive half of the admin surface: platform/staff removal and
// the guards that stop an admin locking everyone (including themselves) out.
// No DB — repositories are stubbed, and the transaction callback runs inline
// against a fake EntityManager.
describe('AdminService', () => {
  let platforms: any;
  let staff: any;
  let roles: any;
  let issues: any;
  let dataSource: any;
  let audit: any;
  let em: any;
  let service: AdminService;

  const ADMIN: AuthenticatedStaff = {
    id: 'admin-1',
    idpSubject: 'local:admin@cimp.dev',
    name: 'Admin',
    email: 'admin@cimp.dev',
    roles: [{ role: Role.ADMIN, platformId: null }],
  };

  const platform = (over: Partial<any> = {}) => ({
    id: 'p1', key: 'portal-a', name: 'Portal A', status: PlatformStatus.ACTIVE,
    jiraProjectKey: null, jiraEnabled: false, slaPolicy: null, createdAt: new Date(), ...over,
  });

  const user = (over: Partial<any> = {}) => ({
    id: 'u1', idpSubject: 'local:jane@cimp.dev', name: 'Jane', email: 'jane@cimp.dev',
    status: AccountStatus.ACTIVE, tokenVersion: 1, ...over,
  });

  // assertNotLastAdmin counts OTHER active admins via a query builder.
  const otherAdmins = (n: number) => {
    roles.createQueryBuilder.mockReturnValue({
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getCount: jest.fn().mockResolvedValue(n),
    });
  };

  beforeEach(() => {
    em = { save: jest.fn(async (x: any) => x), remove: jest.fn(async (x: any) => x) };
    platforms = { findOne: jest.fn(), find: jest.fn(), create: jest.fn((x: any) => x) };
    staff = { findOne: jest.fn(), find: jest.fn(), create: jest.fn((x: any) => x) };
    roles = { findOne: jest.fn(), create: jest.fn((x: any) => x), createQueryBuilder: jest.fn() };
    issues = { count: jest.fn().mockResolvedValue(0) };
    dataSource = { transaction: jest.fn(async (cb: any) => cb(em)) };
    audit = { record: jest.fn() };
    service = new AdminService(platforms, staff, roles, issues, dataSource, audit);
    otherAdmins(1);
  });

  // ---- deletePlatform ------------------------------------------------------

  describe('deletePlatform', () => {
    it('deletes a platform that holds no issues', async () => {
      platforms.findOne.mockResolvedValue(platform());
      issues.count.mockResolvedValue(0);

      await expect(service.deletePlatform(ADMIN, 'p1')).resolves.toEqual({ ok: true });
      expect(em.remove).toHaveBeenCalledWith(expect.objectContaining({ id: 'p1' }));
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'PLATFORM_DELETED', oldValue: 'portal-a' }),
        em,
      );
    });

    // Issue.platform is ON DELETE RESTRICT — Postgres would reject this with a
    // 500. Check first so the caller gets a 409 naming the real remedy.
    it('409s with the issue count and points at disabling instead', async () => {
      platforms.findOne.mockResolvedValue(platform());
      issues.count.mockResolvedValue(42);

      await expect(service.deletePlatform(ADMIN, 'p1')).rejects.toThrow(ConflictException);
      await expect(service.deletePlatform(ADMIN, 'p1')).rejects.toThrow(/42 issue\(s\)/);
      await expect(service.deletePlatform(ADMIN, 'p1')).rejects.toThrow(/DISABLED/);
      expect(em.remove).not.toHaveBeenCalled();
    });

    it('404s for an unknown platform', async () => {
      platforms.findOne.mockResolvedValue(null);
      await expect(service.deletePlatform(ADMIN, 'nope')).rejects.toThrow(NotFoundException);
    });
  });

  // ---- updateStaff ---------------------------------------------------------

  describe('updateStaff', () => {
    it('disables an account and bumps tokenVersion to kill live sessions', async () => {
      staff.findOne.mockResolvedValue(user());

      const res = await service.updateStaff(ADMIN, 'u1', { status: AccountStatus.DISABLED });

      expect(res.status).toBe(AccountStatus.DISABLED);
      expect(em.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: AccountStatus.DISABLED, tokenVersion: 2 }),
      );
    });

    it('re-keys idpSubject and revokes sessions when the email changes', async () => {
      staff.findOne
        .mockResolvedValueOnce(user())   // target
        .mockResolvedValueOnce(null);    // no clash on the new address

      const res = await service.updateStaff(ADMIN, 'u1', { email: 'Jane.New@CIMP.dev' });

      expect(res.email).toBe('jane.new@cimp.dev');
      expect(em.save).toHaveBeenCalledWith(
        expect.objectContaining({ idpSubject: 'local:jane.new@cimp.dev', tokenVersion: 2 }),
      );
    });

    it('rejects an email already held by another staff user', async () => {
      staff.findOne
        .mockResolvedValueOnce(user())
        .mockResolvedValueOnce(user({ id: 'u2', email: 'taken@cimp.dev' }));

      await expect(
        service.updateStaff(ADMIN, 'u1', { email: 'taken@cimp.dev' }),
      ).rejects.toThrow(ConflictException);
    });

    it('renames without touching tokenVersion', async () => {
      staff.findOne.mockResolvedValue(user());
      await service.updateStaff(ADMIN, 'u1', { name: 'Jane Renamed' });
      expect(em.save).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'Jane Renamed', tokenVersion: 1 }),
      );
    });

    it('refuses to disable your own account', async () => {
      staff.findOne.mockResolvedValue(user({ id: ADMIN.id }));
      await expect(
        service.updateStaff(ADMIN, ADMIN.id, { status: AccountStatus.DISABLED }),
      ).rejects.toThrow(BadRequestException);
    });

    it('refuses to disable the last active administrator', async () => {
      staff.findOne.mockResolvedValue(user());
      otherAdmins(0);
      await expect(
        service.updateStaff(ADMIN, 'u1', { status: AccountStatus.DISABLED }),
      ).rejects.toThrow(/last active administrator/);
    });

    // Re-disabling an already-disabled row must not trip the guard (it changes
    // nothing) — otherwise a no-op PATCH could 409 on the last admin.
    it('skips the lockout guard when the account is already disabled', async () => {
      staff.findOne.mockResolvedValue(user({ status: AccountStatus.DISABLED }));
      otherAdmins(0);
      await expect(
        service.updateStaff(ADMIN, 'u1', { status: AccountStatus.DISABLED }),
      ).resolves.toMatchObject({ status: AccountStatus.DISABLED });
    });
  });

  // ---- deleteStaff ---------------------------------------------------------

  describe('deleteStaff', () => {
    it('deletes another staff user and records the audit entry', async () => {
      staff.findOne.mockResolvedValue(user());
      await expect(service.deleteStaff(ADMIN, 'u1')).resolves.toEqual({ ok: true });
      expect(em.remove).toHaveBeenCalledWith(expect.objectContaining({ id: 'u1' }));
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'STAFF_DELETED', oldValue: 'jane@cimp.dev' }),
        em,
      );
    });

    it('refuses to delete your own account', async () => {
      staff.findOne.mockResolvedValue(user({ id: ADMIN.id }));
      await expect(service.deleteStaff(ADMIN, ADMIN.id)).rejects.toThrow(BadRequestException);
      expect(em.remove).not.toHaveBeenCalled();
    });

    it('refuses to delete the last active administrator', async () => {
      staff.findOne.mockResolvedValue(user());
      otherAdmins(0);
      await expect(service.deleteStaff(ADMIN, 'u1')).rejects.toThrow(ConflictException);
    });

    it('404s for an unknown staff user', async () => {
      staff.findOne.mockResolvedValue(null);
      await expect(service.deleteStaff(ADMIN, 'nope')).rejects.toThrow(NotFoundException);
    });
  });

  // ---- revokeRole ----------------------------------------------------------

  describe('revokeRole', () => {
    it('revokes a non-admin grant without consulting the lockout guard', async () => {
      roles.findOne.mockResolvedValue({
        id: 'g1', role: Role.FOCAL_POINT, staffUser: user(), platform: platform(),
      });
      await expect(service.revokeRole(ADMIN, 'g1')).resolves.toEqual({ ok: true });
      expect(roles.createQueryBuilder).not.toHaveBeenCalled();
    });

    // The bin icon on your own ADMIN badge is one click from a permanent
    // lockout — nothing else in the app can re-grant ADMIN.
    it('refuses to revoke the only remaining ADMIN grant', async () => {
      roles.findOne.mockResolvedValue({
        id: 'g1', role: Role.ADMIN, staffUser: user({ id: ADMIN.id }), platform: null,
      });
      otherAdmins(0);
      await expect(service.revokeRole(ADMIN, 'g1')).rejects.toThrow(/last active administrator/);
      expect(em.remove).not.toHaveBeenCalled();
    });

    it('allows revoking an ADMIN grant while another admin remains', async () => {
      roles.findOne.mockResolvedValue({
        id: 'g1', role: Role.ADMIN, staffUser: user(), platform: null,
      });
      otherAdmins(1);
      await expect(service.revokeRole(ADMIN, 'g1')).resolves.toEqual({ ok: true });
    });

    it('404s for an unknown grant', async () => {
      roles.findOne.mockResolvedValue(null);
      await expect(service.revokeRole(ADMIN, 'nope')).rejects.toThrow(NotFoundException);
    });
  });
});
