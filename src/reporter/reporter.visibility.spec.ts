import { NotFoundException } from '@nestjs/common';
import { ReporterService } from './reporter.service';
import { CommentVisibility, ActorType } from '../common/enums';
import { HandoffContext } from '../handoff/handoff.types';

// Two reporter-facing trust boundaries:
//  1. INTERNAL staff notes must NEVER appear in a reporter's issue view.
//  2. A reporter can only read their OWN issues (ownership scoping = IDOR
//     defense), enforced by the reporter-scoped WHERE clause.
describe('ReporterService reporter-facing safety', () => {
  const ctx: HandoffContext = {
    platformId: 'p1',
    platformKey: 'portal-a',
    reporter: { portalUserId: 'u1', name: 'Asha', email: 'a@x.com' },
  };

  let reporters: { findOne: jest.Mock };
  let issues: { findOne: jest.Mock };
  let service: ReporterService;

  beforeEach(() => {
    reporters = { findOne: jest.fn() };
    issues = { findOne: jest.fn() };
    service = new ReporterService(
      reporters as any,
      issues as any,
      {} as any, // views
      {} as any, // attachments
      {} as any, // storage
      {} as any, // dataSource
      {} as any, // events
    );
  });

  it('hides INTERNAL comments and returns only REPORTER_VISIBLE updates', async () => {
    reporters.findOne.mockResolvedValue({ id: 'r1' });
    issues.findOne.mockResolvedValue({
      id: 'i1', referenceNo: 'SUP-1', status: 'NEW', priority: 'MEDIUM',
      description: 'desc', createdAt: new Date(), updatedAt: new Date(),
      attachments: [],
      comments: [
        { body: 'secret internal note', visibility: CommentVisibility.INTERNAL, createdAt: new Date(1), authorType: ActorType.STAFF, authorName: 'S' },
        { body: 'public reply', visibility: CommentVisibility.REPORTER_VISIBLE, createdAt: new Date(2), authorType: ActorType.STAFF, authorName: 'S' },
      ],
    });

    const res = await service.getIssueForReporter(ctx, 'i1');
    const bodies = res.updates.map((u: any) => u.body);
    expect(bodies).toEqual(['public reply']);
    expect(bodies).not.toContain('secret internal note');
  });

  it("404s (not leaks) another reporter's issue — ownership is enforced in the query", async () => {
    reporters.findOne.mockResolvedValue({ id: 'r1' });
    issues.findOne.mockResolvedValue(null); // reporter-scoped query matches nothing

    await expect(service.getIssueForReporter(ctx, 'issue-owned-by-r2')).rejects.toThrow(
      NotFoundException,
    );
    expect(issues.findOne).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: 'issue-owned-by-r2', reporter: { id: 'r1' } }),
      }),
    );
  });
});
