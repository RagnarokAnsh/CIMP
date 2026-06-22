import { JiraListener } from './jira.listener';
import { ScanStatus } from '../common/enums';

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
