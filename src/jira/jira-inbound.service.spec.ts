import { JiraInboundService } from './jira-inbound.service';
import { IssueStatus } from '../common/enums';

// Verifies the Jira status-category → IssueStatus mapping and the guards that
// prevent no-op writes / sync loops.
describe('JiraInboundService.applyWebhook', () => {
  const payload = (key: string, category: string) => ({
    issue: { key, fields: { status: { statusCategory: { key: category } } } },
  });

  function make(issue: any) {
    const issues = {
      findOne: jest.fn().mockResolvedValue(issue),
      save: jest.fn().mockResolvedValue(issue),
    };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const service = new JiraInboundService(issues as any, audit as any);
    return { service, issues, audit };
  }

  it('maps "done" to RESOLVED and records an audit event', async () => {
    const issue = { id: 'i1', referenceNo: 'SUP-1', status: IssueStatus.IN_PROGRESS, resolvedAt: null };
    const { service, issues, audit } = make(issue);

    const res = await service.applyWebhook(payload('JIRA-1', 'done'));

    expect(res.applied).toBe(true);
    expect(issue.status).toBe(IssueStatus.RESOLVED);
    expect(issue.resolvedAt).toBeInstanceOf(Date);
    expect(issues.save).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalled();
  });

  it('is a no-op when the status already matches', async () => {
    const issue = { id: 'i1', referenceNo: 'SUP-1', status: IssueStatus.IN_PROGRESS };
    const { service, issues } = make(issue);

    const res = await service.applyWebhook(payload('JIRA-1', 'indeterminate'));

    expect(res.applied).toBe(false);
    expect(issues.save).not.toHaveBeenCalled();
  });

  it('ignores unknown categories and missing fields', async () => {
    const { service } = make(null);
    expect((await service.applyWebhook(payload('JIRA-1', 'weird'))).applied).toBe(false);
    expect((await service.applyWebhook({})).applied).toBe(false);
  });
});
