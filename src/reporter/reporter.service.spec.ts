import { QueryFailedError } from 'typeorm';
import { ReporterService } from './reporter.service';
import { HandoffContext } from '../handoff/handoff.types';
import { IssueStatus, Priority } from '../common/enums';

// B2 regression: reference numbers are uniquely indexed, so a generation
// collision raises Postgres 23505. Intake must retry with a fresh reference
// instead of surfacing a 500.
describe('ReporterService reference-number collision handling', () => {
  const ctx: HandoffContext = {
    platformId: 'p1',
    platformKey: 'demo',
    reporter: { portalUserId: 'u1', name: 'Ada', email: 'ada@example.com' },
  };

  const reporter = { id: 'r1', name: 'Ada', email: 'ada@example.com' };

  function makeService(transaction: jest.Mock) {
    const reporters = {
      findOne: jest.fn().mockResolvedValue(reporter),
      create: jest.fn(),
      save: jest.fn().mockResolvedValue(reporter),
    };
    const issues = {
      findOne: jest.fn().mockResolvedValue({
        id: 'issue-1',
        referenceNo: 'SUP-ABCDEF',
        status: IssueStatus.NEW,
        priority: Priority.MEDIUM,
        description: 'broken',
        createdAt: new Date(),
        updatedAt: new Date(),
        attachments: [],
        comments: [],
      }),
    };
    const views = {};
    const attachments = { findOne: jest.fn() };
    const storage = { save: jest.fn() };
    const dataSource = { transaction } as any;
    const events = { emit: jest.fn() };

    return new ReporterService(
      reporters as any,
      issues as any,
      views as any,
      attachments as any,
      storage as any,
      dataSource,
      events as any,
    );
  }

  const uniqueViolation = () =>
    new QueryFailedError('insert', [], { code: '23505' } as any);

  it('retries on a unique-violation and then succeeds', async () => {
    const transaction = jest
      .fn()
      .mockRejectedValueOnce(uniqueViolation())
      .mockResolvedValueOnce('issue-1');
    const service = makeService(transaction);

    const result = await service.createIssue(ctx, { description: 'broken' } as any, []);

    expect(transaction).toHaveBeenCalledTimes(2);
    expect(result.id).toBe('issue-1');
  });

  it('gives up after repeated collisions and rethrows', async () => {
    const transaction = jest.fn().mockRejectedValue(uniqueViolation());
    const service = makeService(transaction);

    await expect(
      service.createIssue(ctx, { description: 'broken' } as any, []),
    ).rejects.toBeInstanceOf(QueryFailedError);
    expect(transaction).toHaveBeenCalledTimes(5);
  });
});
