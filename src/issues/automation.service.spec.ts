import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { AutomationService } from './automation.service';
import { ScopeService } from '../authz/scope.service';
import { IssueEvents } from '../events/issue-events';
import {
  AccountStatus, AutomationAction, AutomationTrigger, IssueStatus, Role,
} from '../common/enums';

describe('AutomationService', () => {
  const scopedToPA = { id: 's1', roles: [{ role: Role.DEVELOPER, platformId: 'pA' }] } as any;
  // Action values that reference a row must be uuids — the service rejects the
  // shape before it ever reaches Postgres.
  const DEV_ID = '11111111-1111-4111-8111-111111111111';
  const LABEL_ID = '22222222-2222-4222-8222-222222222222';
  let rules: any;
  let issues: any;
  let staff: any;
  let labels: any;
  let dataSource: any;
  let audit: any;
  let auth: any;
  let events: any;
  let service: AutomationService;

  const exec = () => ({ execute: jest.fn().mockResolvedValue({}) });
  const em = {
    createQueryBuilder: () => ({
      update: () => ({ set: () => ({ where: () => exec() }) }),
      insert: () => ({ into: () => ({ values: () => ({ orIgnore: () => exec() }) }) }),
    }),
  };

  const activeDeveloper = () => {
    staff.findOne.mockResolvedValue({
      id: DEV_ID, idpSubject: 'local:dev@x.io', name: 'Dev', email: 'dev@x.io',
      status: AccountStatus.ACTIVE,
    });
    auth.loadRoles.mockResolvedValue([{ role: Role.DEVELOPER, platformId: 'pA' }]);
  };

  const issueOnPA = () => ({ id: 'i1', priority: 'LOW', assignee: null, platform: { id: 'pA' } });

  beforeEach(() => {
    rules = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn(async (x: any) => x),
      remove: jest.fn(),
    };
    issues = { findOne: jest.fn() };
    staff = { findOne: jest.fn().mockResolvedValue(null) };
    labels = { findOne: jest.fn().mockResolvedValue(null) };
    dataSource = { transaction: jest.fn(async (cb: any) => cb(em)) };
    audit = { record: jest.fn() };
    auth = { loadRoles: jest.fn().mockResolvedValue([]) };
    events = { emit: jest.fn() };
    service = new AutomationService(
      rules, issues, staff, labels, dataSource, new ScopeService(), audit, auth, events,
    );
  });

  it('forbids creating a rule on a platform outside the staff scope', async () => {
    await expect(
      service.create(scopedToPA, 'pB', {
        name: 'x', trigger: AutomationTrigger.ISSUE_CREATED, action: AutomationAction.ADD_LABEL, actionValue: 'l1',
      } as any),
    ).rejects.toThrow(ForbiddenException);
  });

  // ── Action-value validation at write time ──────────────────────────

  it('rejects a SET_PRIORITY value that is not a Priority', async () => {
    await expect(
      service.create(scopedToPA, 'pA', {
        name: 'x', trigger: AutomationTrigger.ISSUE_CREATED, action: AutomationAction.SET_PRIORITY, actionValue: 'URGENT',
      } as any),
    ).rejects.toThrow(BadRequestException);
    expect(rules.save).not.toHaveBeenCalled();
  });

  it('rejects an ASSIGN target with no developer grant on the platform', async () => {
    staff.findOne.mockResolvedValue({
      id: DEV_ID, idpSubject: 'local:x@x.io', name: 'X', email: 'x@x.io', status: AccountStatus.ACTIVE,
    });
    auth.loadRoles.mockResolvedValue([{ role: Role.DEVELOPER, platformId: 'pB' }]);

    await expect(
      service.create(scopedToPA, 'pA', {
        name: 'x', trigger: AutomationTrigger.ISSUE_CREATED, action: AutomationAction.ASSIGN, actionValue: DEV_ID,
      } as any),
    ).rejects.toThrow('Assignee is not a developer on this platform.');
    expect(rules.save).not.toHaveBeenCalled();
  });

  it('rejects an ASSIGN target whose account is disabled', async () => {
    staff.findOne.mockResolvedValue({ id: DEV_ID, status: AccountStatus.DISABLED });

    await expect(
      service.create(scopedToPA, 'pA', {
        name: 'x', trigger: AutomationTrigger.ISSUE_CREATED, action: AutomationAction.ASSIGN, actionValue: DEV_ID,
      } as any),
    ).rejects.toThrow('Assignee not found or inactive.');
  });

  it('accepts an ASSIGN target that is an active developer on the platform', async () => {
    activeDeveloper();

    const out = await service.create(scopedToPA, 'pA', {
      name: 'x', trigger: AutomationTrigger.ISSUE_CREATED, action: AutomationAction.ASSIGN, actionValue: DEV_ID,
    } as any);

    expect(rules.save).toHaveBeenCalled();
    expect(out.actionValue).toBe(DEV_ID);
  });

  it('rejects an ADD_LABEL value that is not a label of this platform', async () => {
    // labels.findOne is scoped to the platform, so another platform's label misses.
    await expect(
      service.create(scopedToPA, 'pA', {
        name: 'x', trigger: AutomationTrigger.ISSUE_CREATED, action: AutomationAction.ADD_LABEL, actionValue: LABEL_ID,
      } as any),
    ).rejects.toThrow('Label not found on this platform.');
    expect(labels.findOne).toHaveBeenCalledWith({
      where: { id: LABEL_ID, platform: { id: 'pA' } },
    });
  });

  it('validates the effective pair on update when only the action is sent', async () => {
    rules.findOne.mockResolvedValue({
      id: 'r1', platform: { id: 'pA' }, name: 'x', enabled: true,
      trigger: AutomationTrigger.ISSUE_CREATED, triggerStatus: null,
      action: AutomationAction.SET_PRIORITY, actionValue: 'HIGH',
    });

    // Switching to ASSIGN leaves 'HIGH' behind as the assignee id.
    await expect(
      service.update(scopedToPA, 'pA', 'r1', { action: AutomationAction.ASSIGN } as any),
    ).rejects.toThrow(BadRequestException);
    expect(rules.save).not.toHaveBeenCalled();
  });

  it('leaves an untouched action/value pair alone so a stale rule can still be disabled', async () => {
    rules.findOne.mockResolvedValue({
      id: 'r1', platform: { id: 'pA' }, name: 'x', enabled: true,
      trigger: AutomationTrigger.ISSUE_CREATED, triggerStatus: null,
      action: AutomationAction.ASSIGN, actionValue: DEV_ID,
    });

    const out = await service.update(scopedToPA, 'pA', 'r1', { enabled: false } as any);

    expect(out.enabled).toBe(false);
    expect(staff.findOne).not.toHaveBeenCalled();
  });

  // ── Engine ─────────────────────────────────────────────────────────

  it('applies only status-changed rules whose target status matches (or is any)', async () => {
    rules.find.mockResolvedValue([
      { id: 'r1', triggerStatus: IssueStatus.RESOLVED, action: AutomationAction.SET_PRIORITY, actionValue: 'HIGH' },
      { id: 'r2', triggerStatus: IssueStatus.CLOSED, action: AutomationAction.SET_PRIORITY, actionValue: 'LOW' },
      { id: 'r3', triggerStatus: null, action: AutomationAction.ADD_LABEL, actionValue: LABEL_ID },
    ]);
    issues.findOne.mockResolvedValue(issueOnPA());

    await service.applyForStatusChanged('i1', 'pA', IssueStatus.RESOLVED);

    // r1 (RESOLVED) + r3 (any) apply; r2 (CLOSED) does not.
    expect(dataSource.transaction).toHaveBeenCalledTimes(2);
    expect(audit.record).toHaveBeenCalledTimes(2);
  });

  it('skips SET_PRIORITY when the issue is already at the target priority', async () => {
    rules.find.mockResolvedValue([
      { id: 'r1', triggerStatus: null, action: AutomationAction.SET_PRIORITY, actionValue: 'HIGH' },
    ]);
    issues.findOne.mockResolvedValue({ ...issueOnPA(), priority: 'HIGH' });

    await service.applyForStatusChanged('i1', 'pA', IssueStatus.RESOLVED);
    expect(audit.record).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });

  it('emits PRIORITY_CHANGED so webhooks and the SSE stream see the automation write', async () => {
    rules.find.mockResolvedValue([
      { id: 'r1', triggerStatus: null, action: AutomationAction.SET_PRIORITY, actionValue: 'HIGH' },
    ]);
    issues.findOne.mockResolvedValue(issueOnPA());

    await service.applyForStatusChanged('i1', 'pA', IssueStatus.RESOLVED);

    expect(events.emit).toHaveBeenCalledWith(IssueEvents.PRIORITY_CHANGED, {
      issueId: 'i1', platformId: 'pA', from: 'LOW', to: 'HIGH', actorStaffId: '',
    });
  });

  it('emits ASSIGNED so the automation-picked assignee is notified', async () => {
    rules.find.mockResolvedValue([
      { id: 'r1', triggerStatus: null, action: AutomationAction.ASSIGN, actionValue: DEV_ID },
    ]);
    issues.findOne.mockResolvedValue(issueOnPA());
    activeDeveloper();

    await service.applyForStatusChanged('i1', 'pA', IssueStatus.RESOLVED);

    expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    expect(events.emit).toHaveBeenCalledWith(IssueEvents.ASSIGNED, {
      issueId: 'i1', platformId: 'pA', assigneeId: DEV_ID, actorStaffId: '',
    });
  });

  it('skips ASSIGN when the rule outlived the grant that made it valid', async () => {
    rules.find.mockResolvedValue([
      { id: 'r1', triggerStatus: null, action: AutomationAction.ASSIGN, actionValue: DEV_ID },
    ]);
    issues.findOne.mockResolvedValue(issueOnPA());
    // Assignee still exists but the DEVELOPER grant on pA was revoked.
    staff.findOne.mockResolvedValue({
      id: DEV_ID, idpSubject: 'local:dev@x.io', name: 'Dev', email: 'dev@x.io',
      status: AccountStatus.ACTIVE,
    });
    auth.loadRoles.mockResolvedValue([{ role: Role.WATCHER, platformId: 'pA' }]);

    // Swallowed + logged by applyRules: a stale rule must never break intake.
    await service.applyForStatusChanged('i1', 'pA', IssueStatus.RESOLVED);

    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
    expect(events.emit).not.toHaveBeenCalled();
  });
});
