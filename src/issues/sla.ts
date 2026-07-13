import { IssueStatus, Priority } from '../common/enums';
import { OPEN_ISSUE_STATUSES } from '../common/constants';

// Resolution SLA: hours-from-baseline target per priority. Env defaults below
// (SLA_HOURS_*), overridable PER PLATFORM via `platforms.sla_policy` jsonb
// ({ CRITICAL?: hours, ... } — missing/invalid keys fall back to env). Plain
// elapsed hours — business-hours calendars are deliberately out of scope.
//
// Baseline is `issues.sla_started_at`, not created_at: reopening an issue
// resets the clock (L8) instead of instantly re-breaching on old issues.
// Kept in one place so the per-issue computation (JS), the dashboard
// aggregate and the breach sweep (SQL) never drift.
const hoursFromEnv = (key: string, fallback: number): number => {
  const raw = process.env[key];
  const n = raw === undefined ? NaN : Number(raw);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const SLA_TARGET_HOURS: Record<Priority, number> = {
  CRITICAL: hoursFromEnv('SLA_HOURS_CRITICAL', 4),
  HIGH: hoursFromEnv('SLA_HOURS_HIGH', 24),
  MEDIUM: hoursFromEnv('SLA_HOURS_MEDIUM', 72),
  LOW: hoursFromEnv('SLA_HOURS_LOW', 168), // 7 days
};

// Fraction of the window elapsed at which an open issue is flagged "at risk".
export const SLA_AT_RISK_FRACTION = (() => {
  const n = Number(process.env.SLA_AT_RISK_FRACTION);
  return Number.isFinite(n) && n > 0 && n < 1 ? n : 0.8;
})();

export type SlaState = 'on_track' | 'at_risk' | 'breached' | null;

export type SlaPolicy = Partial<Record<Priority, number>>;

// SLA is tracked for live work only; resolved/closed issues report no state.
const OPEN_STATUSES: ReadonlySet<IssueStatus> = new Set(OPEN_ISSUE_STATUSES);

export function slaWindowHours(
  priority: Priority,
  policy?: SlaPolicy | null,
): number {
  const override = policy?.[priority];
  if (typeof override === 'number' && Number.isFinite(override) && override > 0) {
    return override;
  }
  return SLA_TARGET_HOURS[priority];
}

export function computeSla(
  input: {
    status: IssueStatus;
    priority: Priority;
    createdAt: Date | string;
    slaStartedAt?: Date | string | null;
    platform?: { slaPolicy?: SlaPolicy | null } | null;
  },
  now: Date = new Date(),
): { dueAt: string; slaState: SlaState } {
  const baseline = new Date(input.slaStartedAt ?? input.createdAt).getTime();
  const windowMs = slaWindowHours(input.priority, input.platform?.slaPolicy) * 3_600_000;
  const dueAt = new Date(baseline + windowMs).toISOString();

  if (!OPEN_STATUSES.has(input.status)) return { dueAt, slaState: null };

  const elapsed = now.getTime() - baseline;
  if (elapsed >= windowMs) return { dueAt, slaState: 'breached' };
  if (elapsed >= windowMs * SLA_AT_RISK_FRACTION) return { dueAt, slaState: 'at_risk' };
  return { dueAt, slaState: 'on_track' };
}

// SQL twin of the JS computation: an issue's due timestamp from its baseline
// plus the per-platform (fallback env) window. Requires the platform relation
// joined under `platformAlias` so the jsonb policy can be consulted.
export function slaDueSql(
  baselineCol = 'issue.sla_started_at',
  platformAlias = 'platform',
): string {
  const policyHours = `NULLIF((${platformAlias}.sla_policy->>(issue.priority::text)), '')::numeric`;
  const defaultHours = `CASE issue.priority
    WHEN 'CRITICAL' THEN ${SLA_TARGET_HOURS.CRITICAL}
    WHEN 'HIGH' THEN ${SLA_TARGET_HOURS.HIGH}
    WHEN 'MEDIUM' THEN ${SLA_TARGET_HOURS.MEDIUM}
    WHEN 'LOW' THEN ${SLA_TARGET_HOURS.LOW}
  END`;
  return `(${baselineCol} + (COALESCE(
    CASE WHEN ${policyHours} > 0 THEN ${policyHours} ELSE NULL END,
    ${defaultHours}
  ) * interval '1 hour'))`;
}
