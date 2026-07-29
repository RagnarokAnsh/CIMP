import { BadRequestException } from '@nestjs/common';
import { applyJqlFilters, parseJql } from './jql';

describe('parseJql', () => {
  it('parses simple equality and keeps field/op/values', () => {
    expect(parseJql('status = NEW')).toEqual([
      { field: 'status', op: '=', values: ['NEW'] },
    ]);
  });

  it('parses AND chains, IN lists, quoted strings, dates and contains', () => {
    const filters = parseJql(
      'priority IN (HIGH, CRITICAL) AND platform = portal-a AND assignee ~ "jane doe" AND created >= 2026-07-01 AND text ~ login',
    );
    expect(filters).toEqual([
      { field: 'priority', op: 'in', values: ['HIGH', 'CRITICAL'] },
      { field: 'platform', op: '=', values: ['portal-a'] },
      { field: 'assignee', op: '~', values: ['jane doe'] },
      { field: 'created', op: '>=', values: ['2026-07-01'] },
      { field: 'text', op: '~', values: ['login'] },
    ]);
  });

  it('is case-insensitive for keywords, fields and enum values', () => {
    expect(parseJql('Status != resolved and Priority in (low)')).toEqual([
      { field: 'status', op: '!=', values: ['RESOLVED'] },
      { field: 'priority', op: 'in', values: ['LOW'] },
    ]);
  });

  it('supports assignee = me / unassigned', () => {
    expect(parseJql('assignee = me')).toEqual([{ field: 'assignee', op: '=', values: ['me'] }]);
    expect(parseJql('assignee = unassigned')).toEqual([
      { field: 'assignee', op: '=', values: ['unassigned'] },
    ]);
  });

  it('rejects unknown fields, bad enum values, wrong operators and bad dates', () => {
    expect(() => parseJql('bogus = x')).toThrow(BadRequestException);
    expect(() => parseJql('status = NOT_A_STATUS')).toThrow(/status/i);
    expect(() => parseJql('created ~ 2026')).toThrow(/created/i);
    expect(() => parseJql('created >= yesterday')).toThrow(/date/i);
    expect(() => parseJql('status >= NEW')).toThrow(/operator/i);
    expect(() => parseJql('text = login')).toThrow(/text/i);
  });

  it('rejects trailing garbage and dangling AND', () => {
    expect(() => parseJql('status = NEW garbage')).toThrow(BadRequestException);
    expect(() => parseJql('status = NEW AND')).toThrow(BadRequestException);
    expect(() => parseJql('')).toThrow(BadRequestException);
  });

  it('rejects OR with a helpful v1 message', () => {
    expect(() => parseJql('status = NEW OR status = REOPENED')).toThrow(/OR/i);
  });
});

describe('applyJqlFilters', () => {
  const qb = () => {
    const calls: { sql: string; params: Record<string, unknown> }[] = [];
    return {
      calls,
      andWhere: jest.fn(function (this: any, sql: string, params?: Record<string, unknown>) {
        calls.push({ sql, params: params ?? {} });
        return this;
      }),
    } as any;
  };

  it('translates each field to scoped SQL with unique parameter names', () => {
    const q = qb();
    applyJqlFilters(q, parseJql(
      'status IN (NEW, REOPENED) AND platform != portal-b AND assignee = me AND label = bug AND created >= 2026-07-01',
    ), 'staff-1');
    const all = q.calls.map((c: any) => c.sql).join(' | ');
    expect(all).toContain('issue.status IN');
    expect(all).toContain('platform.key');
    expect(all).toContain('assignee.id = :');
    expect(all).toContain('EXISTS');
    expect(all).toContain('issue.created_at >=');
    // the `me` sentinel resolves to the calling staff id
    const meParam = q.calls.find((c: any) => c.sql.includes('assignee.id'));
    expect(Object.values(meParam.params)).toContain('staff-1');
    // no param-name collisions across clauses
    const names = q.calls.flatMap((c: any) => Object.keys(c.params));
    expect(new Set(names).size).toBe(names.length);
  });

  it('assignee = unassigned becomes IS NULL; label != becomes NOT EXISTS', () => {
    const q = qb();
    applyJqlFilters(q, parseJql('assignee = unassigned AND label != wontfix'), 'staff-1');
    const all = q.calls.map((c: any) => c.sql).join(' | ');
    expect(all).toContain('assignee.id IS NULL');
    expect(all).toContain('NOT EXISTS');
  });
});
