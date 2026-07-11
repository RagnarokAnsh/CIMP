import { ConflictException, NotFoundException } from '@nestjs/common';
import { CsatService } from './csat.service';
import { CommentVisibility, IssueStatus } from '../common/enums';
import { IssueEvents } from '../events/issue-events';

describe('CsatService', () => {
  const ctx = {
    platformId: 'pA',
    platformKey: 'portal-a',
    reporter: { portalUserId: 'u1', name: 'Asha', email: 'a@x.com' },
  } as any;

  let responses: any;
  let issues: any;
  let reporters: any;
  let comments: any;
  let events: any;
  let service: CsatService;

  beforeEach(() => {
    responses = { findOne: jest.fn().mockResolvedValue(null), create: jest.fn((x) => x), save: jest.fn(async (x) => x) };
    issues = { findOne: jest.fn() };
    reporters = { findOne: jest.fn().mockResolvedValue({ id: 'r1' }) };
    comments = { create: jest.fn((x) => x), save: jest.fn(async (x) => x) };
    events = { emit: jest.fn() };
    service = new CsatService(responses, issues, reporters, comments, events);
  });

  const resolvedIssue = { id: 'i1', status: IssueStatus.RESOLVED, platform: { id: 'pA' } };

  it('404s for an unknown reporter or a foreign issue', async () => {
    reporters.findOne.mockResolvedValue(null);
    await expect(service.submit(ctx, 'i1', { score: 'up' })).rejects.toThrow(NotFoundException);

    reporters.findOne.mockResolvedValue({ id: 'r1' });
    issues.findOne.mockResolvedValue(null); // ownership filter misses
    await expect(service.submit(ctx, 'i1', { score: 'up' })).rejects.toThrow(NotFoundException);
  });

  it('409s when the issue is not resolved/closed yet', async () => {
    issues.findOne.mockResolvedValue({ ...resolvedIssue, status: IssueStatus.IN_PROGRESS });
    await expect(service.submit(ctx, 'i1', { score: 'up' })).rejects.toThrow(ConflictException);
  });

  it('records an up-vote and emits csat.received without flagging the team', async () => {
    issues.findOne.mockResolvedValue(resolvedIssue);
    const res = await service.submit(ctx, 'i1', { score: 'up' });
    expect(res.score).toBe(1);
    expect(comments.save).not.toHaveBeenCalled();
    expect(events.emit).toHaveBeenCalledWith(
      IssueEvents.CSAT_RECEIVED,
      expect.objectContaining({ issueId: 'i1', score: 1 }),
    );
  });

  it('a down-vote adds an internal note with the comment text', async () => {
    issues.findOne.mockResolvedValue(resolvedIssue);
    await service.submit(ctx, 'i1', { score: 'down', comment: 'still broken' });
    const note = comments.save.mock.calls[0][0];
    expect(note.visibility).toBe(CommentVisibility.INTERNAL);
    expect(note.body).toContain('still broken');
  });

  it('re-rating overwrites the existing response and does not re-flag', async () => {
    issues.findOne.mockResolvedValue(resolvedIssue);
    responses.findOne.mockResolvedValue({ id: 'c9', score: 0 });
    await service.submit(ctx, 'i1', { score: 'down' });
    expect(responses.save.mock.calls[0][0].id).toBe('c9'); // upsert, not insert
    expect(comments.save).not.toHaveBeenCalled(); // was already negative
  });
});
