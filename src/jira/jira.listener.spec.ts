import { JiraListener } from './jira.listener';
import { JiraSyncStatus, ScanStatus } from '../common/enums';

// A1 regression: attachments are pushed to Jira once scanning completes, exactly
// once (the atomic claim dedupes the create-path vs scan-complete-path), and
// PENDING / already-synced files are skipped.
describe('JiraListener attachment sync', () => {
  function make(files: any[]) {
    const issues = {
      findOne: jest.fn().mockResolvedValue({
        id: 'i1', referenceNo: 'SUP-1', jiraIssueKey: 'JIRA-1',
        platform: { jiraEnabled: true },
      }),
    };
    const attachments = {
      find: jest.fn().mockResolvedValue(files),
      // Claim succeeds (affected:1) unless told otherwise per id.
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const jira = { isConfigured: () => true, addAttachment: jest.fn().mockResolvedValue(undefined) };
    const storage = { read: jest.fn().mockResolvedValue(Buffer.from('x')) };
    const listener = new JiraListener(issues as any, attachments as any, jira as any, storage as any);
    return { listener, attachments, jira };
  }

  it('pushes only servable, unsynced attachments and claims each', async () => {
    const files = [
      { id: 'a1', filename: 'clean.png', contentType: 'image/png', storageKey: 'k1', scanStatus: ScanStatus.CLEAN, jiraSynced: false },
      { id: 'a2', filename: 'pending.png', contentType: 'image/png', storageKey: 'k2', scanStatus: ScanStatus.PENDING, jiraSynced: false },
      { id: 'a3', filename: 'done.png', contentType: 'image/png', storageKey: 'k3', scanStatus: ScanStatus.SKIPPED, jiraSynced: true },
    ];
    const { listener, attachments, jira } = make(files);

    await listener.onAttachmentsScanned({ issueId: 'i1' });

    expect(jira.addAttachment).toHaveBeenCalledTimes(1);
    expect(jira.addAttachment).toHaveBeenCalledWith('JIRA-1', expect.objectContaining({ filename: 'clean.png' }));
    // Claimed exactly the one servable+unsynced file.
    expect(attachments.update).toHaveBeenCalledWith({ id: 'a1', jiraSynced: false }, { jiraSynced: true });
  });

  it('skips a file already claimed by the other path (affected: 0)', async () => {
    const files = [
      { id: 'a1', filename: 'clean.png', contentType: 'image/png', storageKey: 'k1', scanStatus: ScanStatus.CLEAN, jiraSynced: false },
    ];
    const { listener, attachments, jira } = make(files);
    attachments.update.mockResolvedValueOnce({ affected: 0 });

    await listener.onAttachmentsScanned({ issueId: 'i1' });

    expect(jira.addAttachment).not.toHaveBeenCalled();
  });
});

// The create path claims the issue with jiraSyncStatus=PENDING before calling
// Jira. That claim must stay idempotent while a call is genuinely in flight, but
// must NOT survive a crash — nothing else ever revisits a wedged PENDING row.
describe('JiraListener create-path claim', () => {
  const CREATED = { issueId: 'i1', platformId: 'p1' };

  function issueWith(over: Record<string, unknown>) {
    return {
      id: 'i1',
      referenceNo: 'SUP-1',
      jiraIssueKey: null,
      jiraSyncStatus: JiraSyncStatus.NOT_SYNCED,
      platform: { jiraEnabled: true, jiraProjectKey: 'SUP' },
      updatedAt: new Date(),
      ...over,
    };
  }

  function make(issue: any) {
    const issues = {
      findOne: jest.fn().mockResolvedValue(issue),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const attachments = { find: jest.fn().mockResolvedValue([]), update: jest.fn() };
    const jira = { isConfigured: () => true, createIssue: jest.fn().mockResolvedValue('JIRA-9') };
    const storage = { read: jest.fn() };
    const listener = new JiraListener(issues as any, attachments as any, jira as any, storage as any);
    return { listener, issues, jira };
  }

  it('skips an issue whose PENDING claim is still fresh', async () => {
    const { listener, jira } = make(issueWith({
      jiraSyncStatus: JiraSyncStatus.PENDING,
      updatedAt: new Date(Date.now() - 30_000),
    }));

    await listener.onIssueCreated(CREATED);

    expect(jira.createIssue).not.toHaveBeenCalled();
  });

  it('retries a PENDING claim left behind by a dead process', async () => {
    const { listener, issues, jira } = make(issueWith({
      jiraSyncStatus: JiraSyncStatus.PENDING,
      updatedAt: new Date(Date.now() - 60 * 60_000),
    }));

    await listener.onIssueCreated(CREATED);

    expect(jira.createIssue).toHaveBeenCalledTimes(1);
    expect(issues.update).toHaveBeenCalledWith('i1', {
      jiraIssueKey: 'JIRA-9',
      jiraSyncStatus: JiraSyncStatus.SYNCED,
    });
  });

  it('never re-creates once a key exists, however stale the claim', async () => {
    const { listener, jira } = make(issueWith({
      jiraIssueKey: 'JIRA-1',
      jiraSyncStatus: JiraSyncStatus.PENDING,
      updatedAt: new Date(0),
    }));

    await listener.onIssueCreated(CREATED);

    expect(jira.createIssue).not.toHaveBeenCalled();
  });

  it('gives up after the last attempt without a trailing backoff', async () => {
    const { listener, issues, jira } = make(issueWith({}));
    jira.createIssue.mockRejectedValue(new Error('jira down'));
    const delay = jest.spyOn(listener as any, 'delay').mockResolvedValue(undefined);

    await listener.onIssueCreated(CREATED);

    expect(jira.createIssue).toHaveBeenCalledTimes(3);
    // Two gaps between three attempts — none after the one that gives up.
    expect(delay).toHaveBeenCalledTimes(2);
    expect(delay).toHaveBeenLastCalledWith(1000);
    expect(issues.update).toHaveBeenLastCalledWith('i1', {
      jiraSyncStatus: JiraSyncStatus.FAILED,
    });
  });
});
