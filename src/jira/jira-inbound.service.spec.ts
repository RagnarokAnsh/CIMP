import { JiraInboundService } from './jira-inbound.service';
import { IssueStatus } from '../common/enums';

// Verifies the Jira status-category → IssueStatus mapping and the guards that
// prevent no-op writes / sync loops.
describe('JiraInboundService.applyWebhook', () => {
  const payload = (key: string, category: string) => ({
    issue: { key, fields: { status: { statusCategory: { key: category } } } },
  });

  function make(issue: any) {
    // Mimic em inside dataSource.transaction(cb) → cb(em).
    const em = {
      findOne: jest.fn().mockResolvedValue(issue),
      save: jest.fn().mockResolvedValue(issue),
    };
    const dataSource = {
      transaction: jest.fn(async (cb: any) => cb(em)),
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new JiraInboundService(dataSource as any, audit as any);
    return { service, em, audit };
  }

  it('maps "done" to RESOLVED and records an audit event', async () => {
    const issue = { id: 'i1', referenceNo: 'SUP-1', status: IssueStatus.IN_PROGRESS, resolvedAt: null };
    const { service, em, audit } = make(issue);

    const res = await service.applyWebhook(payload('JIRA-1', 'done'));

    expect(res.applied).toBe(true);
    expect(issue.status).toBe(IssueStatus.RESOLVED);
    expect(issue.resolvedAt).toBeInstanceOf(Date);
    expect(em.save).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalled();
  });

  it('re-stamps resolvedAt through the shared side effects', async () => {
    // Converged on applyStatusSideEffects, which stamps unconditionally — the old
    // inbound copy kept an existing value with `?? new Date()`.
    const stale = new Date('2024-01-01T00:00:00Z');
    const issue = { id: 'i1', referenceNo: 'SUP-1', status: IssueStatus.IN_PROGRESS, resolvedAt: stale };
    const { service } = make(issue);

    await service.applyWebhook(payload('JIRA-1', 'done'));

    expect(issue.resolvedAt.getTime()).toBeGreaterThan(stale.getTime());
  });

  it('treats a move out of a terminal state as a reopen, not a bare status write', async () => {
    // Jira only reports a category, so "dragged out of Done" arrives as
    // indeterminate. Writing IN_PROGRESS verbatim would leave closedAt populated
    // and the SLA clock on the original createdAt — an instant re-breach (L8).
    const issue = {
      id: 'i1',
      referenceNo: 'SUP-1',
      status: IssueStatus.CLOSED,
      resolvedAt: new Date('2024-01-01T00:00:00Z'),
      closedAt: new Date('2024-01-02T00:00:00Z'),
      slaStartedAt: new Date('2024-01-01T00:00:00Z'),
      slaBreachedAt: new Date('2024-01-03T00:00:00Z'),
      duplicateOf: { id: 'i2' },
    };
    const { service, audit } = make(issue);

    const res = await service.applyWebhook(payload('JIRA-1', 'indeterminate'));

    expect(res.applied).toBe(true);
    expect(issue.status).toBe(IssueStatus.REOPENED);
    expect(issue.resolvedAt).toBeNull();
    expect(issue.closedAt).toBeNull();
    expect(issue.slaBreachedAt).toBeNull();
    expect(issue.slaStartedAt.getTime()).toBeGreaterThan(new Date('2024-01-01T00:00:00Z').getTime());
    // The audit row must show the reopen, not the raw category mapping.
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ oldValue: IssueStatus.CLOSED, newValue: IssueStatus.REOPENED }),
      expect.anything(),
    );
  });

  it('is a no-op when the status already matches', async () => {
    const issue = { id: 'i1', referenceNo: 'SUP-1', status: IssueStatus.IN_PROGRESS };
    const { service, em } = make(issue);

    const res = await service.applyWebhook(payload('JIRA-1', 'indeterminate'));

    expect(res.applied).toBe(false);
    expect(em.save).not.toHaveBeenCalled();
  });

  it('ignores unknown categories and missing fields', async () => {
    const { service } = make(null);
    expect((await service.applyWebhook(payload('JIRA-1', 'weird'))).applied).toBe(false);
    expect((await service.applyWebhook({})).applied).toBe(false);
  });
});
