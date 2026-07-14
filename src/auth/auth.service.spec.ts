import { QueryFailedError } from 'typeorm';
import { AuthService } from './auth.service';
import { AccountStatus } from '../common/enums';

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

  it('creates a brand-new user from full session claims', async () => {
    staff.findOne.mockResolvedValue(null);
    await service.upsertFromClaims({
      sub: 'local:new@cimp.dev', tv: 1, name: 'New', email: 'new@cimp.dev',
    });
    expect(staff.create).toHaveBeenCalledWith(
      expect.objectContaining({ idpSubject: 'local:new@cimp.dev', name: 'New', email: 'new@cimp.dev' }),
    );
  });

  it('recovers from a concurrent-insert unique violation (23505) by re-fetching the winner', async () => {
    const dup = new QueryFailedError('insert', undefined, { code: '23505', message: 'dup' } as any);
    staff.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(admin());
    staff.save.mockRejectedValueOnce(dup);
    const res = await service.upsertFromClaims({
      sub: 'local:admin@cimp.dev', tv: 1, name: 'Admin', email: 'admin@cimp.dev',
    });
    expect(res).toMatchObject({ id: 'a1' });
  });

  it('rethrows a non-unique-violation save error', async () => {
    staff.findOne.mockResolvedValue(null);
    staff.save.mockRejectedValue(new Error('connection reset'));
    await expect(
      service.upsertFromClaims({ sub: 'local:x@cimp.dev', tv: 1, name: 'X', email: 'x@cimp.dev' }),
    ).rejects.toThrow('connection reset');
  });
});
