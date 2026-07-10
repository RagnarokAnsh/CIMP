import { ConflictException, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { MergeService } from './merge.service';
import { IssueEvents } from '../events/issue-events';
import { CommentVisibility, IssueStatus } from '../common/enums';

describe('MergeService', () => {
  const staff = { id: 's1' } as any;
  let issues: any;
  let em: any;
  let dataSource: any;
  let audit: any;
  let events: any;
  let service: MergeService;

  const chainable = () => {
    const qb: any = {};
    for (const m of ['insert', 'into', 'values', 'orIgnore', 'update', 'set', 'where']) {
      qb[m] = jest.fn(() => qb);
    }
    qb.execute = jest.fn().mockResolvedValue(undefined);
    return qb;
  };

  beforeEach(() => {
    em = {
      save: jest.fn(async (x) => x),
      create: jest.fn((_cls, x) => x),
      createQueryBuilder: jest.fn(() => chainable()),
      query: jest.fn().mockResolvedValue(undefined),
    };
    issues = { findOne: jest.fn(), find: jest.fn().mockResolvedValue([]) };
    dataSource = { transaction: jest.fn(async (cb: any) => cb(em)) };
    audit = { record: jest.fn() };
    events = { emit: jest.fn() };
    service = new MergeService(issues, dataSource, audit, events);
  });

  const issue = (over: Record<string, unknown> = {}) => ({
    id: 'dup',
    referenceNo: 'SUP-1',
    status: IssueStatus.NEW,
    version: 1,
    closedAt: null,
    duplicateOf: null,
    platform: { id: 'pA' },
    ...over,
  });

  it('rejects merging an issue into itself', async () => {
    await expect(
      service.merge(staff, 'i1', { canonicalIssueId: 'i1', version: 1 }),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('404s when the canonical does not exist', async () => {
    issues.findOne.mockResolvedValueOnce(issue()).mockResolvedValueOnce(null);
    await expect(
      service.merge(staff, 'dup', { canonicalIssueId: 'canon', version: 1 }),
    ).rejects.toThrow(NotFoundException);
  });

  it('rejects cross-platform merges (tenant isolation)', async () => {
    issues.findOne
      .mockResolvedValueOnce(issue())
      .mockResolvedValueOnce(issue({ id: 'canon', platform: { id: 'pB' } }));
    await expect(
      service.merge(staff, 'dup', { canonicalIssueId: 'canon', version: 1 }),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('409s when the duplicate is already merged', async () => {
    issues.findOne
      .mockResolvedValueOnce(issue({ duplicateOf: { id: 'other' } }))
      .mockResolvedValueOnce(issue({ id: 'canon' }));
    await expect(
      service.merge(staff, 'dup', { canonicalIssueId: 'canon', version: 1 }),
    ).rejects.toThrow(ConflictException);
  });

  it('409s on a stale version (optimistic lock)', async () => {
    issues.findOne
      .mockResolvedValueOnce(issue({ version: 3 }))
      .mockResolvedValueOnce(issue({ id: 'canon' }));
    await expect(
      service.merge(staff, 'dup', { canonicalIssueId: 'canon', version: 2 }),
    ).rejects.toThrow(ConflictException);
  });

  it('rejects merging a closed issue', async () => {
    issues.findOne
      .mockResolvedValueOnce(issue({ status: IssueStatus.CLOSED }))
      .mockResolvedValueOnce(issue({ id: 'canon' }));
    await expect(
      service.merge(staff, 'dup', { canonicalIssueId: 'canon', version: 1 }),
    ).rejects.toThrow(UnprocessableEntityException);
  });

  it('flattens chains: merging into a duplicate lands on its canonical', async () => {
    issues.findOne
      .mockResolvedValueOnce(issue())
      .mockResolvedValueOnce(issue({ id: 'mid', duplicateOf: { id: 'root' } }))
      .mockResolvedValueOnce(issue({ id: 'root' }));
    const res = await service.merge(staff, 'dup', { canonicalIssueId: 'mid', version: 1 });
    expect(res.canonicalIssueId).toBe('root');
    const savedDuplicate = em.save.mock.calls[0][0];
    expect(savedDuplicate.duplicateOf).toEqual({ id: 'root' });
  });

  it('merges: closes the duplicate, links, copies watchers, comments both sides, audits, emits', async () => {
    issues.findOne
      .mockResolvedValueOnce(issue())
      .mockResolvedValueOnce(issue({ id: 'canon', referenceNo: 'SUP-2' }));

    const res = await service.merge(staff, 'dup', { canonicalIssueId: 'canon', version: 1 });

    expect(res).toEqual({ ok: true, canonicalIssueId: 'canon' });
    const savedDuplicate = em.save.mock.calls[0][0];
    expect(savedDuplicate.status).toBe(IssueStatus.CLOSED);
    expect(savedDuplicate.closedAt).toBeInstanceOf(Date);
    expect(savedDuplicate.duplicateOf).toEqual({ id: 'canon' });

    // watcher copy uses insert-ignore SQL targeting both issues
    expect(em.query).toHaveBeenCalledWith(expect.stringContaining('ON CONFLICT DO NOTHING'), ['canon', 'dup']);

    // one reporter-visible comment on the duplicate, one internal on the canonical
    const comments = em.save.mock.calls.slice(1).map((c: any[]) => c[0]);
    expect(comments).toHaveLength(2);
    expect(comments[0].visibility).toBe(CommentVisibility.REPORTER_VISIBLE);
    expect(comments[0].issue).toEqual({ id: 'dup' });
    expect(comments[1].visibility).toBe(CommentVisibility.INTERNAL);
    expect(comments[1].issue).toEqual({ id: 'canon' });

    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'MERGED', issueId: 'dup', newValue: 'canon' }),
      em,
    );
    expect(events.emit).toHaveBeenCalledWith(
      IssueEvents.MERGED,
      expect.objectContaining({ duplicateIssueId: 'dup', canonicalIssueId: 'canon' }),
    );
  });

  describe('resolution fan-out (STATUS_CHANGED listener)', () => {
    const evt = {
      issueId: 'canon', platformId: 'pA', from: IssueStatus.IN_PROGRESS,
      to: IssueStatus.RESOLVED, actorStaffId: 's1',
    };

    it('comments on each duplicate and bumps updatedAt when the canonical resolves', async () => {
      issues.find.mockResolvedValue([{ id: 'dup1' }, { id: 'dup2' }]);
      await service.onCanonicalStatusChanged(evt);
      const comments = em.save.mock.calls.map((c: any[]) => c[0]);
      expect(comments).toHaveLength(2);
      expect(comments.every((c: any) => c.visibility === CommentVisibility.REPORTER_VISIBLE)).toBe(true);
      expect(em.createQueryBuilder).toHaveBeenCalledTimes(2); // updatedAt bumps
    });

    it('does nothing for non-RESOLVED transitions or when there are no duplicates', async () => {
      await service.onCanonicalStatusChanged({ ...evt, to: IssueStatus.CLOSED });
      expect(issues.find).not.toHaveBeenCalled();

      issues.find.mockResolvedValue([]);
      await service.onCanonicalStatusChanged(evt);
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('swallows fan-out errors (a listener must never throw)', async () => {
      issues.find.mockRejectedValue(new Error('db down'));
      await expect(service.onCanonicalStatusChanged(evt)).resolves.toBeUndefined();
    });
  });
});
