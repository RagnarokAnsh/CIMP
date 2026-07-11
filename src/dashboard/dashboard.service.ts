import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { IssueStatus } from '../common/enums';
import { Issue } from '../entities';
import { AuthenticatedStaff } from '../auth/auth.types';
import { ScopeService } from '../authz/scope.service';
import { SLA_AT_RISK_FRACTION, slaDueSql } from '../issues/sla';

const OPEN_STATUSES = [
  IssueStatus.NEW, IssueStatus.IN_PROGRESS, IssueStatus.ON_HOLD, IssueStatus.REOPENED,
];

// Aggregated counts for the staff dashboard, always limited to the caller's
// platform scope.
@Injectable()
export class DashboardService {
  constructor(
    @InjectRepository(Issue) private readonly issues: Repository<Issue>,
    private readonly scope: ScopeService,
  ) {}

  async summary(staff: AuthenticatedStaff) {
    const scope = this.scope.scopedPlatformIds(staff);
    if (Array.isArray(scope) && scope.length === 0) {
      return this.empty();
    }

    const [byStatus, byPriority, byPlatform, byAssignee, trend, sla, csat, ops] = await Promise.all([
      this.groupCount(scope, 'issue.status', 'status'),
      this.groupCount(scope, 'issue.priority', 'priority'),
      this.byPlatform(scope),
      this.byAssignee(scope),
      this.trend(scope),
      this.slaCounts(scope),
      this.csat(scope),
      this.ops(scope),
    ]);

    const total = byStatus.reduce((sum, r) => sum + r.count, 0);
    const open = byStatus
      .filter((r) => OPEN_STATUSES.includes(r.key as IssueStatus))
      .reduce((sum, r) => sum + r.count, 0);

    return {
      totals: { all: total, open, resolvedOrClosed: total - open },
      byStatus,
      byPriority,
      byPlatform,
      byAssignee,
      trend,
      sla,
      csat,
      ops,
    };
  }

  // Operational quality over the last 30 days (all raw SQL — the aggregates
  // need percentile_cont / cross-table joins TypeORM can't express):
  //  - time-to-first-staff-action: creation → first STAFF audit event
  //  - resolution time: creation → resolved_at
  //  - reopen rate: issues reopened ÷ issues resolved
  //  - deflected: "notify me instead" subscriptions ÷ (new issues + deflected)
  private async ops(scope: string[] | 'ALL') {
    const scopeSql = scope === 'ALL' ? '' : 'AND i.platform_id = ANY($1)';
    const params = scope === 'ALL' ? [] : [scope];
    const q = <T>(sql: string) => this.issues.manager.query(sql, params) as Promise<T[]>;

    const [ttfr] = await q<{ p50: string | null; p90: string | null }>(`
      SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY t.hours) AS p50,
             percentile_cont(0.9) WITHIN GROUP (ORDER BY t.hours) AS p90
      FROM (
        SELECT EXTRACT(EPOCH FROM (MIN(a.created_at) - i.created_at)) / 3600 AS hours
        FROM issues i
        JOIN audit_events a ON a.issue_id = i.id AND a.actor_type = 'STAFF'
        WHERE i.created_at >= now() - interval '30 days' ${scopeSql}
        GROUP BY i.id, i.created_at
      ) t`);

    const [resolution] = await q<{ p50: string | null; p90: string | null; resolved: string }>(`
      SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (i.resolved_at - i.created_at)) / 3600) AS p50,
             percentile_cont(0.9) WITHIN GROUP (ORDER BY EXTRACT(EPOCH FROM (i.resolved_at - i.created_at)) / 3600) AS p90,
             COUNT(*) AS resolved
      FROM issues i
      WHERE i.resolved_at IS NOT NULL
        AND i.resolved_at >= now() - interval '30 days' ${scopeSql}`);

    const [reopens] = await q<{ count: string }>(`
      SELECT COUNT(DISTINCT a.issue_id) AS count
      FROM audit_events a
      JOIN issues i ON i.id = a.issue_id
      WHERE a.action = 'STATUS_CHANGED' AND a.new_value = 'REOPENED'
        AND a.created_at >= now() - interval '30 days' ${scopeSql}`);

    const [deflected] = await q<{ count: string }>(`
      SELECT COUNT(*) AS count
      FROM reporter_subscriptions s
      JOIN issues i ON i.id = s.issue_id
      WHERE s.created_at >= now() - interval '30 days' ${scopeSql}`);
    const [created] = await q<{ count: string }>(`
      SELECT COUNT(*) AS count FROM issues i
      WHERE i.created_at >= now() - interval '30 days' ${scopeSql}`);

    const num = (v: string | null | undefined) =>
      v === null || v === undefined ? null : Math.round(Number(v) * 10) / 10;
    const resolvedCount = Number(resolution?.resolved ?? 0);
    const deflectedCount = Number(deflected?.count ?? 0);
    const createdCount = Number(created?.count ?? 0);
    return {
      ttfrHours: { p50: num(ttfr?.p50), p90: num(ttfr?.p90) },
      resolutionHours: { p50: num(resolution?.p50), p90: num(resolution?.p90) },
      reopenRate: resolvedCount > 0
        ? Math.round((Number(reopens?.count ?? 0) / resolvedCount) * 100)
        : null,
      deflected: deflectedCount,
      deflectionRate: deflectedCount + createdCount > 0
        ? Math.round((deflectedCount / (deflectedCount + createdCount)) * 100)
        : null,
    };
  }

  // Reporter satisfaction over the last 30 days: share of 👍 among all
  // responses in scope. Null rate when there are no responses yet.
  private async csat(scope: string[] | 'ALL') {
    const qb = this.issues.manager
      .createQueryBuilder()
      .select('COUNT(*)', 'count')
      .addSelect('COALESCE(AVG(c.score), -1)', 'rate')
      .from('csat_responses', 'c')
      .innerJoin('issues', 'i', 'i.id = c.issue_id')
      .where("c.created_at >= now() - interval '30 days'");
    if (scope !== 'ALL') qb.andWhere('i.platform_id IN (:...ids)', { ids: scope });
    const row = await qb.getRawOne<{ count: string; rate: string }>();
    const count = Number(row?.count ?? 0);
    return {
      count,
      positiveRate: count > 0 ? Math.round(Number(row!.rate) * 100) : null,
    };
  }

  // Open issues past their SLA window (overdue) or within the at-risk fraction of
  // it. Thresholds mirror computeSla via the shared slaDueSql expression.
  private async slaCounts(scope: string[] | 'ALL') {
    // slaDueSql consults the per-platform policy, so the platform join is
    // required; the baseline is sla_started_at (resets on reopen, L8).
    const due = slaDueSql('issue.sla_started_at', 'platform');
    const row = await this.base(scope)
      .leftJoin('issue.platform', 'platform')
      .andWhere('issue.status IN (:...open)', { open: OPEN_STATUSES })
      .select(`COUNT(*) FILTER (WHERE now() >= ${due})`, 'overdue')
      .addSelect(
        `COUNT(*) FILTER (WHERE now() < ${due} AND now() >= issue.sla_started_at + (${due} - issue.sla_started_at) * ${SLA_AT_RISK_FRACTION})`,
        'atRisk',
      )
      .getRawOne<{ overdue: string; atRisk: string }>();
    return { overdue: Number(row?.overdue ?? 0), atRisk: Number(row?.atRisk ?? 0) };
  }

  private base(scope: string[] | 'ALL'): SelectQueryBuilder<Issue> {
    const qb = this.issues.createQueryBuilder('issue');
    if (scope !== 'ALL') qb.where('issue.platform_id IN (:...ids)', { ids: scope });
    return qb;
  }

  private async groupCount(scope: string[] | 'ALL', column: string, alias: string) {
    const rows = await this.base(scope)
      .select(column, 'key')
      .addSelect('COUNT(*)', 'count')
      .groupBy(column)
      .getRawMany<{ key: string; count: string }>();
    return rows.map((r) => ({ key: r.key, count: Number(r.count) }));
  }

  private async byPlatform(scope: string[] | 'ALL') {
    const rows = await this.base(scope)
      .leftJoin('issue.platform', 'platform')
      .select('platform.key', 'key')
      .addSelect('COUNT(*)', 'count')
      .groupBy('platform.key')
      .getRawMany<{ key: string; count: string }>();
    return rows.map((r) => ({ key: r.key, count: Number(r.count) }));
  }

  private async byAssignee(scope: string[] | 'ALL') {
    const rows = await this.base(scope)
      .leftJoin('issue.assignee', 'assignee')
      .select('assignee.id', 'id')
      .addSelect('assignee.name', 'name')
      .addSelect('COUNT(*)', 'count')
      .where(scope === 'ALL' ? '1=1' : 'issue.platform_id IN (:...ids)', { ids: scope })
      .andWhere('assignee.id IS NOT NULL')
      .groupBy('assignee.id')
      .addGroupBy('assignee.name')
      .getRawMany<{ id: string; name: string; count: string }>();
    return rows.map((r) => ({ assigneeId: r.id, name: r.name, count: Number(r.count) }));
  }

  // 14-day open-vs-resolved trend: issues created vs resolved per day.
  private async trend(scope: string[] | 'ALL') {
    const created = await this.base(scope)
      .select("to_char(date_trunc('day', issue.created_at), 'YYYY-MM-DD')", 'day')
      .addSelect('COUNT(*)', 'count')
      .andWhere("issue.created_at >= now() - interval '14 days'")
      .groupBy('day')
      .orderBy('day', 'ASC')
      .getRawMany<{ day: string; count: string }>();

    const resolved = await this.base(scope)
      .select("to_char(date_trunc('day', issue.resolved_at), 'YYYY-MM-DD')", 'day')
      .addSelect('COUNT(*)', 'count')
      .andWhere('issue.resolved_at IS NOT NULL')
      .andWhere("issue.resolved_at >= now() - interval '14 days'")
      .groupBy('day')
      .orderBy('day', 'ASC')
      .getRawMany<{ day: string; count: string }>();

    return {
      created: created.map((r) => ({ day: r.day, count: Number(r.count) })),
      resolved: resolved.map((r) => ({ day: r.day, count: Number(r.count) })),
    };
  }

  private empty() {
    return {
      totals: { all: 0, open: 0, resolvedOrClosed: 0 },
      byStatus: [],
      byPriority: [],
      byPlatform: [],
      byAssignee: [],
      trend: { created: [], resolved: [] },
      sla: { overdue: 0, atRisk: 0 },
      csat: { count: 0, positiveRate: null as number | null },
      ops: {
        ttfrHours: { p50: null as number | null, p90: null as number | null },
        resolutionHours: { p50: null as number | null, p90: null as number | null },
        reopenRate: null as number | null,
        deflected: 0,
        deflectionRate: null as number | null,
      },
    };
  }
}
