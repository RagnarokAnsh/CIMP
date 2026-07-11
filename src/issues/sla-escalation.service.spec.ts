import { SlaEscalationService } from './sla-escalation.service';
import { IssueEvents } from '../events/issue-events';

describe('SlaEscalationService', () => {
  let issues: any;
  let events: any;
  let audit: any;
  let service: SlaEscalationService;
  let qb: any;

  beforeEach(() => {
    qb = {};
    for (const m of ['innerJoin', 'select', 'addSelect', 'where', 'andWhere']) {
      qb[m] = jest.fn(() => qb);
    }
    qb.getRawMany = jest.fn().mockResolvedValue([]);
    issues = {
      createQueryBuilder: jest.fn(() => qb),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    events = { emit: jest.fn() };
    audit = { record: jest.fn() };
    service = new SlaEscalationService(issues, events, audit);
    delete process.env.SLA_SWEEP_ENABLED;
  });

  it('marks each breached issue once and emits issue.sla_breached', async () => {
    qb.getRawMany.mockResolvedValue([
      { id: 'i1', platformId: 'pA' },
      { id: 'i2', platformId: 'pB' },
    ]);
    const count = await service.sweep();
    expect(count).toBe(2);
    expect(issues.update).toHaveBeenCalledTimes(2);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'SLA_BREACHED', issueId: 'i1' }),
    );
    expect(events.emit).toHaveBeenCalledWith(
      IssueEvents.SLA_BREACHED,
      { issueId: 'i2', platformId: 'pB' },
    );
  });

  it('skips issues a concurrent run already marked (conditional update no-op)', async () => {
    qb.getRawMany.mockResolvedValue([{ id: 'i1', platformId: 'pA' }]);
    issues.update.mockResolvedValue({ affected: 0 });
    const count = await service.sweep();
    expect(count).toBe(0);
    expect(events.emit).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('is disabled by SLA_SWEEP_ENABLED=false', async () => {
    process.env.SLA_SWEEP_ENABLED = 'false';
    expect(await service.sweep()).toBe(0);
    expect(issues.createQueryBuilder).not.toHaveBeenCalled();
  });

  it('swallows errors (a cron tick must never crash the process)', async () => {
    qb.getRawMany.mockRejectedValue(new Error('db down'));
    await expect(service.sweep()).resolves.toBe(0);
  });
});
