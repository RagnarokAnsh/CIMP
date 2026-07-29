import {
  BadRequestException, ForbiddenException, NotFoundException,
} from '@nestjs/common';
import { StatusService } from './status.service';
import { ScopeService } from '../authz/scope.service';
import {
  ComponentStatus, IncidentStatus, PlatformStatus, Role,
} from '../common/enums';

describe('StatusService', () => {
  const developerOnPA = { id: 's1', roles: [{ role: Role.DEVELOPER, platformId: 'pA' }] } as any;
  const watcherOnPA = { id: 's2', roles: [{ role: Role.WATCHER, platformId: 'pA' }] } as any;

  let components: any;
  let incidents: any;
  let updates: any;
  let platforms: any;
  let service: StatusService;

  beforeEach(() => {
    components = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn((x) => Promise.resolve(x)),
      remove: jest.fn(),
    };
    incidents = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn((x) => Promise.resolve(x)),
      remove: jest.fn(),
    };
    updates = { save: jest.fn(), create: jest.fn((x) => x) };
    platforms = { findOne: jest.fn() };
    service = new StatusService(
      components, incidents, updates, platforms, {} as any, new ScopeService(),
    );
  });

  // ── Access ──────────────────────────────────────────────────────────
  it('forbids managing the status page of a platform outside the scope', async () => {
    await expect(service.listComponents(developerOnPA, 'pB')).rejects.toThrow(ForbiddenException);
  });

  it('forbids a read-only watcher from publishing status', async () => {
    // Publishing to a public page is a write action, never a watcher's.
    await expect(
      service.createComponent(watcherOnPA, 'pA', { name: 'API' }),
    ).rejects.toThrow(ForbiddenException);
  });

  it('404s a component belonging to another platform', async () => {
    components.findOne.mockResolvedValue({ id: 'c1', platform: { id: 'pB' } });
    await expect(
      service.updateComponent(developerOnPA, 'pA', 'c1', { status: ComponentStatus.DEGRADED }),
    ).rejects.toThrow(NotFoundException);
  });

  it("rejects naming another platform's component on an incident", async () => {
    // Two ids requested, only one resolves within the platform → refuse.
    components.find.mockResolvedValue([{ id: 'c1' }]);
    await expect(
      service.createIncident(developerOnPA, 'pA', {
        title: 'Outage', body: 'Looking into it', componentIds: ['c1', 'c2'],
      }),
    ).rejects.toThrow(BadRequestException);
  });

  // ── Public page ─────────────────────────────────────────────────────
  it('404s the public page for an unknown platform key', async () => {
    platforms.findOne.mockResolvedValue(null);
    await expect(service.publicStatus('nope')).rejects.toThrow(NotFoundException);
  });

  it('404s the public page for a DISABLED platform', async () => {
    platforms.findOne.mockResolvedValue({
      id: 'pA', key: 'portal-a', name: 'A', status: PlatformStatus.DISABLED,
    });
    await expect(service.publicStatus('portal-a')).rejects.toThrow(NotFoundException);
  });

  it('reports the worst component status as the overall banner', async () => {
    platforms.findOne.mockResolvedValue({
      id: 'pA', key: 'portal-a', name: 'A', status: PlatformStatus.ACTIVE,
    });
    components.find.mockResolvedValue([
      { id: 'c1', name: 'Web', status: ComponentStatus.OPERATIONAL, description: null },
      { id: 'c2', name: 'API', status: ComponentStatus.PARTIAL_OUTAGE, description: null },
    ]);
    const res = await service.publicStatus('portal-a');
    expect(res.overall).toBe(ComponentStatus.PARTIAL_OUTAGE);
  });

  it('never shows green while an incident is open, even with no components', async () => {
    platforms.findOne.mockResolvedValue({
      id: 'pA', key: 'portal-a', name: 'A', status: PlatformStatus.ACTIVE,
    });
    components.find.mockResolvedValue([]);
    incidents.find.mockResolvedValue([
      {
        id: 'i1', title: 'Degraded logins', status: IncidentStatus.INVESTIGATING,
        impact: 'MAJOR', startedAt: new Date(), resolvedAt: null, components: [], updates: [],
      },
    ]);
    const res = await service.publicStatus('portal-a');
    expect(res.overall).toBe(ComponentStatus.DEGRADED);
    expect(res.activeIncidents).toHaveLength(1);
    expect(res.recentIncidents).toHaveLength(0);
  });

  it('separates resolved incidents into history', async () => {
    platforms.findOne.mockResolvedValue({
      id: 'pA', key: 'portal-a', name: 'A', status: PlatformStatus.ACTIVE,
    });
    incidents.find.mockResolvedValue([
      {
        id: 'i1', title: 'Old', status: IncidentStatus.RESOLVED, impact: 'MINOR',
        startedAt: new Date(), resolvedAt: new Date(), components: [], updates: [],
      },
    ]);
    const res = await service.publicStatus('portal-a');
    expect(res.overall).toBe(ComponentStatus.OPERATIONAL);
    expect(res.activeIncidents).toHaveLength(0);
    expect(res.recentIncidents).toHaveLength(1);
  });

  it('orders an incident timeline newest-first', async () => {
    platforms.findOne.mockResolvedValue({
      id: 'pA', key: 'portal-a', name: 'A', status: PlatformStatus.ACTIVE,
    });
    incidents.find.mockResolvedValue([
      {
        id: 'i1',
        title: 'Outage',
        status: IncidentStatus.MONITORING,
        impact: 'MAJOR',
        startedAt: new Date('2026-01-01T00:00:00Z'),
        resolvedAt: null,
        components: [],
        updates: [
          { id: 'u1', status: IncidentStatus.INVESTIGATING, body: 'first', createdAt: new Date('2026-01-01T00:00:00Z') },
          { id: 'u2', status: IncidentStatus.MONITORING, body: 'second', createdAt: new Date('2026-01-01T02:00:00Z') },
        ],
      },
    ]);
    const res = await service.publicStatus('portal-a');
    expect(res.activeIncidents[0].updates.map((u: any) => u.body)).toEqual(['second', 'first']);
  });
});
