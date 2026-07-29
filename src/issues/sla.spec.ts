import { IssueStatus, Priority } from '../common/enums';
import { computeSla, SLA_TARGET_HOURS } from './sla';

const H = 3_600_000;

describe('computeSla', () => {
  const created = new Date('2026-07-01T00:00:00Z');
  const base = {
    status: IssueStatus.IN_PROGRESS,
    priority: Priority.MEDIUM, // env default 72h
    createdAt: created,
  };

  it('uses the env default window when the platform has no policy', () => {
    const { dueAt, slaState } = computeSla(base, new Date(created.getTime() + 1 * H));
    expect(dueAt).toBe(new Date(created.getTime() + SLA_TARGET_HOURS.MEDIUM * H).toISOString());
    expect(slaState).toBe('on_track');
  });

  it('flags at_risk at the configured fraction and breached past due', () => {
    const windowMs = SLA_TARGET_HOURS.MEDIUM * H;
    expect(computeSla(base, new Date(created.getTime() + windowMs * 0.85)).slaState).toBe('at_risk');
    expect(computeSla(base, new Date(created.getTime() + windowMs + 1)).slaState).toBe('breached');
  });

  it('reports no state for resolved/closed issues', () => {
    expect(computeSla({ ...base, status: IssueStatus.RESOLVED }).slaState).toBeNull();
    expect(computeSla({ ...base, status: IssueStatus.CLOSED }).slaState).toBeNull();
  });

  it('a platform SLA policy overrides the env default for its priority', () => {
    const input = { ...base, platform: { slaPolicy: { MEDIUM: 10 } } };
    const { dueAt, slaState } = computeSla(input, new Date(created.getTime() + 11 * H));
    expect(dueAt).toBe(new Date(created.getTime() + 10 * H).toISOString());
    expect(slaState).toBe('breached');
  });

  it('a partial policy falls back to the default for unlisted priorities', () => {
    const input = { ...base, platform: { slaPolicy: { CRITICAL: 1 } } };
    expect(computeSla(input).dueAt).toBe(
      new Date(created.getTime() + SLA_TARGET_HOURS.MEDIUM * H).toISOString(),
    );
  });

  it('ignores invalid policy values (zero, negative, non-numeric)', () => {
    for (const bad of [0, -5, 'x' as unknown as number, null as unknown as number]) {
      const input = { ...base, platform: { slaPolicy: { MEDIUM: bad } } };
      expect(computeSla(input).dueAt).toBe(
        new Date(created.getTime() + SLA_TARGET_HOURS.MEDIUM * H).toISOString(),
      );
    }
  });

  it('L8: a reopened issue measures from slaStartedAt, not the original createdAt', () => {
    const reopenedAt = new Date(created.getTime() + 400 * H); // long after creation
    const input = {
      ...base,
      status: IssueStatus.REOPENED,
      slaStartedAt: reopenedAt,
    };
    const soonAfterReopen = new Date(reopenedAt.getTime() + 1 * H);
    const { dueAt, slaState } = computeSla(input, soonAfterReopen);
    expect(dueAt).toBe(new Date(reopenedAt.getTime() + SLA_TARGET_HOURS.MEDIUM * H).toISOString());
    expect(slaState).toBe('on_track'); // would be 'breached' measured from createdAt
  });
});
