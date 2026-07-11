import { BadRequestException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { DeflectionService } from './deflection.service';
import { IssueStatus, PlatformStatus } from '../common/enums';

const SECRET = 'test-secret-at-least-32-characters!!';

describe('DeflectionService', () => {
  const ctx = {
    platformId: 'pA',
    platformKey: 'portal-a',
    reporter: { portalUserId: 'u1', name: 'Asha', email: 'a@x.com' },
  } as any;

  let issues: any;
  let reporters: any;
  let subscriptions: any;
  let platforms: any;
  let audit: any;
  let service: DeflectionService;

  const qb = () => {
    const q: any = {};
    for (const m of ['where', 'andWhere', 'addSelect', 'orderBy', 'addOrderBy', 'take', 'select', 'groupBy', 'insert', 'values', 'orIgnore']) {
      q[m] = jest.fn(() => q);
    }
    q.getMany = jest.fn().mockResolvedValue([]);
    q.getRawMany = jest.fn().mockResolvedValue([]);
    q.execute = jest.fn().mockResolvedValue(undefined);
    return q;
  };

  let issueQb: any;

  beforeEach(() => {
    issueQb = qb();
    issues = { createQueryBuilder: jest.fn(() => issueQb), findOne: jest.fn(), find: jest.fn().mockResolvedValue([]), save: jest.fn(async (x: any) => x) };
    reporters = { findOne: jest.fn().mockResolvedValue({ id: 'r1' }), create: jest.fn((x: any) => x), save: jest.fn(async (x: any) => x) };
    subscriptions = { createQueryBuilder: jest.fn(() => qb()) };
    platforms = { findOne: jest.fn() };
    audit = { record: jest.fn() };
    const config = { get: jest.fn(() => SECRET) };
    service = new DeflectionService(issues, reporters, subscriptions, platforms, config as any, audit);
  });

  describe('findSimilar', () => {
    it('returns [] for queries that produce no tsquery terms', async () => {
      expect(await service.findSimilar(ctx, '!!! ???')).toEqual([]);
      expect(issues.createQueryBuilder).not.toHaveBeenCalled();
    });

    it('returns ONLY privacy-safe fields plus an opaque token', async () => {
      issueQb.getMany.mockResolvedValue([
        { id: 'i1', status: IssueStatus.IN_PROGRESS, createdAt: new Date('2026-07-01') },
      ]);
      issueQb.getRawMany.mockResolvedValue([{ canonicalId: 'i1', count: '3' }]);
      const [hit] = await service.findSimilar(ctx, 'payment page crashes on submit');
      expect(Object.keys(hit).sort()).toEqual(['firstReportedAt', 'reportCount', 'status', 'subscribeToken']);
      expect(hit.reportCount).toBe(4); // 1 + 3 duplicates
      const claims = jwt.verify(hit.subscribeToken, SECRET) as any;
      expect(claims).toMatchObject({ purpose: 'subscribe', issueId: 'i1', platformId: 'pA' });
    });
  });

  describe('subscribe', () => {
    const token = (over: object = {}) =>
      jwt.sign({ purpose: 'subscribe', issueId: 'i1', platformId: 'pA', ...over }, SECRET, { expiresIn: '30m' });

    it('rejects garbage, wrong-purpose, and expired tokens with 401', async () => {
      await expect(service.subscribe(ctx, 'garbage')).rejects.toThrow(UnauthorizedException);
      await expect(service.subscribe(ctx, token({ purpose: 'csat' }))).rejects.toThrow(UnauthorizedException);
      const expired = jwt.sign({ purpose: 'subscribe', issueId: 'i1', platformId: 'pA' }, SECRET, { expiresIn: '-1s' });
      await expect(service.subscribe(ctx, expired)).rejects.toThrow(UnauthorizedException);
    });

    it('404s a token minted for another platform (tenant isolation)', async () => {
      await expect(service.subscribe(ctx, token({ platformId: 'pB' }))).rejects.toThrow(NotFoundException);
    });

    it('subscribes, creating the reporter row when they never filed an issue', async () => {
      issues.findOne.mockResolvedValue({ id: 'i1' });
      reporters.findOne.mockResolvedValue(null); // first interaction ever
      const res = await service.subscribe(ctx, token());
      expect(res).toEqual({ subscribed: true });
      expect(reporters.save).toHaveBeenCalled();
    });
  });

  describe('publish', () => {
    it('requires a public title when publishing for the first time', async () => {
      issues.findOne.mockResolvedValue({ id: 'i1', publiclyVisible: false, publicTitle: null });
      await expect(
        service.publish({ id: 's1' } as any, 'i1', { publiclyVisible: true }),
      ).rejects.toThrow(BadRequestException);
    });

    it('publishes with a title and records an audit event', async () => {
      issues.findOne.mockResolvedValue({ id: 'i1', publiclyVisible: false, publicTitle: null });
      const res = await service.publish({ id: 's1' } as any, 'i1', {
        publiclyVisible: true, publicTitle: 'Login is degraded',
      });
      expect(res).toEqual({ publiclyVisible: true, publicTitle: 'Login is degraded' });
      expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: 'PUBLISH_CHANGED' }));
    });
  });

  describe('publicKnownIssues', () => {
    it('404s unknown or inactive platforms', async () => {
      platforms.findOne.mockResolvedValue(null);
      await expect(service.publicKnownIssues('nope')).rejects.toThrow(NotFoundException);
      platforms.findOne.mockResolvedValue({ id: 'pA', status: PlatformStatus.DISABLED });
      await expect(service.publicKnownIssues('pA')).rejects.toThrow(NotFoundException);
    });

    it('returns curated titles only — never descriptions or references', async () => {
      platforms.findOne.mockResolvedValue({ id: 'pA', status: PlatformStatus.ACTIVE });
      issues.find.mockResolvedValue([
        { publicTitle: 'Checkout is slow', status: IssueStatus.IN_PROGRESS, updatedAt: new Date(), description: 'SECRET', referenceNo: 'SUP-1' },
      ]);
      const [row] = await service.publicKnownIssues('portal-a');
      expect(Object.keys(row).sort()).toEqual(['status', 'title', 'updatedAt']);
      expect(JSON.stringify(row)).not.toContain('SECRET');
      expect(JSON.stringify(row)).not.toContain('SUP-1');
    });
  });
});
