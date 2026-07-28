import { QueryFailedError } from 'typeorm';
import { AuthService } from './auth.service';
import { AccountStatus, Role } from '../common/enums';

// Focused on upsertFromClaims — the identity mirror called on EVERY authed
// request by both the session guard (full claims) and the SSE guard ({sub,tv}).
describe('AuthService.upsertFromClaims', () => {
  let staff: any;
  let roles: any;
  let service: AuthService;

  const admin = () => ({
    id: 'a1',
    idpSubject: 'local:admin@cimp.dev',
    name: 'Admin',
    email: 'admin@cimp.dev',
    status: AccountStatus.ACTIVE,
    tokenVersion: 1,
  });

  beforeEach(() => {
    staff = {
      findOne: jest.fn(),
      create: jest.fn((x: any) => x),
      save: jest.fn(async (x: any) => x),
    };
    roles = { find: jest.fn().mockResolvedValue([]) };
    service = new AuthService(staff, roles);
  });

  it('returns null for a sub-less token without touching the DB', async () => {
    expect(await service.upsertFromClaims({ sub: undefined } as any)).toBeNull();
    expect(staff.findOne).not.toHaveBeenCalled();
  });

  // Regression: the SSE ticket carries only {sub,tv}. Computing email as
  // `claims.email ?? ''` used to overwrite the stored row to email='' (unique,
  // not-null) → broke login and 401-stormed the SSE stream.
  it('SSE-shaped {sub,tv} claims never clobber the stored name/email', async () => {
    staff.findOne.mockResolvedValue(admin());
    const res = await service.upsertFromClaims({ sub: 'local:admin@cimp.dev', tv: 1 });
    expect(staff.save).not.toHaveBeenCalled(); // no drift → no write at all
    expect(res).toMatchObject({ name: 'Admin', email: 'admin@cimp.dev' });
  });

  it('refreshes name/email only when the token carries a changed value', async () => {
    staff.findOne.mockResolvedValue(admin());
    await service.upsertFromClaims({
      sub: 'local:admin@cimp.dev', tv: 1, name: 'Admin Renamed', email: 'admin@cimp.dev',
    });
    expect(staff.save).toHaveBeenCalledTimes(1);
    expect(staff.save.mock.calls[0][0]).toMatchObject({
      name: 'Admin Renamed', email: 'admin@cimp.dev',
    });
  });

  it('nulls a revoked token (inactive account or stale tokenVersion)', async () => {
    staff.findOne.mockResolvedValue({ ...admin(), status: AccountStatus.DISABLED });
    expect(await service.upsertFromClaims({ sub: 'local:admin@cimp.dev', tv: 1 })).toBeNull();

    staff.findOne.mockResolvedValue(admin());
    expect(await service.upsertFromClaims({ sub: 'local:admin@cimp.dev', tv: 2 })).toBeNull();
    expect(staff.save).not.toHaveBeenCalled();
  });

  it('creates a brand-new user from full session claims (external IdP subject)', async () => {
    staff.findOne.mockResolvedValue(null);
    await service.upsertFromClaims({
      sub: 'oidc|new', tv: 1, name: 'New', email: 'new@cimp.dev',
    });
    expect(staff.create).toHaveBeenCalledWith(
      expect.objectContaining({ idpSubject: 'oidc|new', name: 'New', email: 'new@cimp.dev' }),
    );
  });

  // A `local:` subject only exists because POST /api/admin/staff made it. If the
  // row is gone the account was deleted (or its email re-keyed) while a token
  // was live — auto-creating would resurrect it as a role-less ghost holding the
  // freed email, silently undoing the delete.
  it('refuses to auto-create a missing local: subject', async () => {
    staff.findOne.mockResolvedValue(null);
    const res = await service.upsertFromClaims({
      sub: 'local:deleted@cimp.dev', tv: 1, name: 'Deleted', email: 'deleted@cimp.dev',
    });
    expect(res).toBeNull();
    expect(staff.create).not.toHaveBeenCalled();
    expect(staff.save).not.toHaveBeenCalled();
  });

  it('recovers from a concurrent-insert unique violation (23505) by re-fetching the winner', async () => {
    const dup = new QueryFailedError('insert', undefined, { code: '23505', message: 'dup' } as any);
    staff.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(admin());
    staff.save.mockRejectedValueOnce(dup);
    const res = await service.upsertFromClaims({
      sub: 'oidc|admin', tv: 1, name: 'Admin', email: 'admin@cimp.dev',
    });
    expect(res).toMatchObject({ id: 'a1' });
  });

  it('rethrows a non-unique-violation save error', async () => {
    staff.findOne.mockResolvedValue(null);
    staff.save.mockRejectedValue(new Error('connection reset'));
    await expect(
      service.upsertFromClaims({ sub: 'oidc|x', tv: 1, name: 'X', email: 'x@cimp.dev' }),
    ).rejects.toThrow('connection reset');
  });
});

// The SSE stream is the one path authenticated once and then held open for hours,
// so it re-authorizes on every heartbeat through refreshAuthenticated. Anything
// that returns a stale answer here keeps a revoked account receiving live events.
describe('AuthService.refreshAuthenticated', () => {
  let staff: any;
  let roles: any;
  let service: AuthService;

  const watcher = () => ({
    id: 'w1',
    idpSubject: 'local:watcher@cimp.dev',
    name: 'Watcher',
    email: 'watcher@cimp.dev',
    status: AccountStatus.ACTIVE,
    tokenVersion: 1,
  });

  beforeEach(() => {
    staff = {
      findOne: jest.fn(),
      create: jest.fn((x: any) => x),
      save: jest.fn(async (x: any) => x),
    };
    roles = { find: jest.fn().mockResolvedValue([]) };
    service = new AuthService(staff, roles);
  });

  it('returns the identity plus freshly loaded grants for an ACTIVE user', async () => {
    staff.findOne.mockResolvedValue(watcher());
    roles.find.mockResolvedValue([{ role: Role.WATCHER, platform: { id: 'p1' } }]);

    const res = await service.refreshAuthenticated('w1');

    expect(staff.findOne).toHaveBeenCalledWith({ where: { id: 'w1' } });
    expect(res).toMatchObject({
      staff: {
        id: 'w1',
        email: 'watcher@cimp.dev',
        roles: [{ role: Role.WATCHER, platformId: 'p1' }],
      },
      // Surfaced so the SSE stream can pin it and drop the connection when a
      // password reset bumps it — otherwise the forced-logout lever does not
      // reach anyone already connected.
      tokenVersion: 1,
    });
  });

  it('reports a bumped tokenVersion so an open stream can be dropped', async () => {
    staff.findOne.mockResolvedValue({ ...watcher(), tokenVersion: 7 });
    const res = await service.refreshAuthenticated('w1');
    expect(res?.tokenVersion).toBe(7);
  });

  it('returns null once the account is no longer ACTIVE', async () => {
    staff.findOne.mockResolvedValue({ ...watcher(), status: AccountStatus.DISABLED });
    expect(await service.refreshAuthenticated('w1')).toBeNull();
    expect(roles.find).not.toHaveBeenCalled();
  });

  it('returns null for an id that no longer exists (deleted mid-stream)', async () => {
    staff.findOne.mockResolvedValue(null);
    expect(await service.refreshAuthenticated('gone')).toBeNull();
    expect(roles.find).not.toHaveBeenCalled();
  });
});
