import { IssueStatus, Priority } from '../common/enums';

// Resolution SLA: hours-from-creation target per priority. Global defaults for
// now; per-platform overrides are a future enhancement. Kept in one place so the
// per-issue computation (JS) and the dashboard aggregate (SQL) never drift.
export const SLA_TARGET_HOURS: Record<Priority, number> = {
  CRITICAL: 4,
  HIGH: 24,
  MEDIUM: 72,
  LOW: 168, // 7 days
};

// Fraction of the window elapsed at which an open issue is flagged "at risk".
export const SLA_AT_RISK_FRACTION = 0.8;

export type SlaState = 'on_track' | 'at_risk' | 'breached' | null;

// SLA is tracked for live work only; resolved/closed issues report no state.
const OPEN_STATUSES: ReadonlySet<IssueStatus> = new Set([
  IssueStatus.NEW, IssueStatus.IN_PROGRESS, IssueStatus.ON_HOLD, IssueStatus.REOPENED,
]);

export function computeSla(
  input: { status: IssueStatus; priority: Priority; createdAt: Date | string },
  now: Date = new Date(),
): { dueAt: string; slaState: SlaState } {
  const created = new Date(input.createdAt).getTime();
  const windowMs = SLA_TARGET_HOURS[input.priority] * 3_600_000;
  const dueAt = new Date(created + windowMs).toISOString();

  if (!OPEN_STATUSES.has(input.status)) return { dueAt, slaState: null };

  const elapsed = now.getTime() - created;
  if (elapsed >= windowMs) return { dueAt, slaState: 'breached' };
  if (elapsed >= windowMs * SLA_AT_RISK_FRACTION) return { dueAt, slaState: 'at_risk' };
  return { dueAt, slaState: 'on_track' };
}

// SQL expression for an issue's due timestamp (created_at + per-priority window).
// Used by the dashboard aggregate so its thresholds match computeSla exactly.
export function slaDueSql(col = 'issue.created_at'): string {
  return `(${col} + (CASE issue.priority
    WHEN 'CRITICAL' THEN interval '${SLA_TARGET_HOURS.CRITICAL} hours'
    WHEN 'HIGH' THEN interval '${SLA_TARGET_HOURS.HIGH} hours'
    WHEN 'MEDIUM' THEN interval '${SLA_TARGET_HOURS.MEDIUM} hours'
    WHEN 'LOW' THEN interval '${SLA_TARGET_HOURS.LOW} hours'
  END))`;
}
