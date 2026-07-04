import { ForbiddenException } from '@nestjs/common';
import { AutomationService } from './automation.service';
import { ScopeService } from '../authz/scope.service';
import {
  AutomationAction, AutomationTrigger, IssueStatus, Role,
} from '../common/enums';

describe('AutomationService', () => {
  const scopedToPA = { id: 's1', roles: [{ role: Role.DEVELOPER, platformId: 'pA' }] } as any;
  let rules: any;
  let issues: any;
  let dataSource: any;
  let audit: any;
  let service: AutomationService;

  const exec = () => ({ execute: jest.fn().mockResolvedValue({}) });
  const em = {
    createQueryBuilder: () => ({
      update: () => ({ set: () => ({ where: () => exec() }) }),
      insert: () => ({ into: () => ({ values: () => ({ orIgnore: () => exec() }) }) }),
    }),
  };

  beforeEach(() => {
    rules = { find: jest.fn().mockResolvedValue([]), findOne: jest.fn(), create: jest.fn((x) => x), save: jest.fn(), remove: jest.fn() };
    issues = { findOne: jest.fn() };
    dataSource = { transaction: jest.fn(async (cb: any) => cb(em)) };
    audit = { record: jest.fn() };
    service = new AutomationService(rules, issues, dataSource, new ScopeService(), audit);
  });

  it('forbids creating a rule on a platform outside the staff scope', async () => {
    await expect(
      service.create(scopedToPA, 'pB', {
        name: 'x', trigger: AutomationTrigger.ISSUE_CREATED, action: AutomationAction.ADD_LABEL, actionValue: 'l1',
      } as any),
    ).rejects.toThrow(ForbiddenException);
  });

  it('applies only status-changed rules whose target status matches (or is any)', async () => {
    rules.find.mockResolvedValue([
      { id: 'r1', triggerStatus: IssueStatus.RESOLVED, action: AutomationAction.SET_PRIORITY, actionValue: 'HIGH' },
      { id: 'r2', triggerStatus: IssueStatus.CLOSED, action: AutomationAction.SET_PRIORITY, actionValue: 'LOW' },
      { id: 'r3', triggerStatus: null, action: AutomationAction.ADD_LABEL, actionValue: 'lbl' },
    ]);
    issues.findOne.mockResolvedValue({ id: 'i1', priority: 'LOW', assignee: null });

    await service.applyForStatusChanged('i1', 'pA', IssueStatus.RESOLVED);

    // r1 (RESOLVED) + r3 (any) apply; r2 (CLOSED) does not.
    expect(dataSource.transaction).toHaveBeenCalledTimes(2);
    expect(audit.record).toHaveBeenCalledTimes(2);
  });

  it('skips SET_PRIORITY when the issue is already at the target priority', async () => {
    rules.find.mockResolvedValue([
      { id: 'r1', triggerStatus: null, action: AutomationAction.SET_PRIORITY, actionValue: 'HIGH' },
    ]);
    issues.findOne.mockResolvedValue({ id: 'i1', priority: 'HIGH', assignee: null });

    await service.applyForStatusChanged('i1', 'pA', IssueStatus.RESOLVED);
    expect(audit.record).not.toHaveBeenCalled();
  });
});
