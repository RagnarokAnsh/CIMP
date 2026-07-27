import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { DashboardService } from './dashboard.service';
import { ScopeService } from '../authz/scope.service';
import { Role } from '../common/enums';

// The per-platform tenant report is the one dashboard surface addressable by id,
// so its access boundary is what matters here: read-role on THAT platform (the
// read-only WATCHER included — that grant is the canonical tenant-owner role),
// and nothing else. The aggregates themselves are raw SQL and are covered by e2e.
describe('DashboardService.platformReport', () => {
  const developerOnPA = { id: 's1', roles: [{ role: Role.DEVELOPER, platformId: 'pA' }] } as any;
  const watcherOnPA = { id: 's2', roles: [{ role: Role.WATCHER, platformId: 'pA' }] } as any;
  const developerOnPB = { id: 's3', roles: [{ role: Role.DEVELOPER, platformId: 'pB' }] } as any;

  let issues: any;
  let platforms: any;
  let service: DashboardService;

  beforeEach(() => {
    issues = { find: jest.fn().mockResolvedValue([]) };
    platforms = { findOne: jest.fn() };
    service = new DashboardService(issues, platforms, new ScopeService());
    // The aggregate fan-out is exercised elsewhere; stub it so these tests stay
    // on the access boundary rather than on Postgres-only SQL.
    jest
      .spyOn(service as any, 'computeForScope')
      .mockResolvedValue({ totals: { all: 0, open: 0, resolvedOrClosed: 0 } });
  });

  it('forbids a staff member with no grant on the requested platform', async () => {
    await expect(service.platformReport(developerOnPB, 'pA')).rejects.toThrow(ForbiddenException);
    // Refused before any data is read.
    expect(platforms.findOne).not.toHaveBeenCalled();
  });

  it('allows a read-only watcher — the tenant-owner grant', async () => {
    platforms.findOne.mockResolvedValue({ id: 'pA', key: 'portal-a', name: 'Portal A' });
    const res = await service.platformReport(watcherOnPA, 'pA');
    expect(res.platform).toEqual({ id: 'pA', key: 'portal-a', name: 'Portal A' });
  });

  it('scopes the aggregates to exactly the requested platform', async () => {
    platforms.findOne.mockResolvedValue({ id: 'pA', key: 'portal-a', name: 'Portal A' });
    await service.platformReport(developerOnPA, 'pA');
    expect((service as any).computeForScope).toHaveBeenCalledWith(['pA']);
  });

  it('404s a platform that does not exist', async () => {
    platforms.findOne.mockResolvedValue(null);
    await expect(service.platformReport(developerOnPA, 'pA')).rejects.toThrow(NotFoundException);
  });

  it('lists only published known issues for the platform', async () => {
    platforms.findOne.mockResolvedValue({ id: 'pA', key: 'portal-a', name: 'Portal A' });
    await service.platformReport(developerOnPA, 'pA');
    expect(issues.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { platform: { id: 'pA' }, publiclyVisible: true },
      }),
    );
  });
});
