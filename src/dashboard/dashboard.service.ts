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

    const [byStatus, byPriority, byPlatform, byAssignee, trend, sla] = await Promise.all([
      this.groupCount(scope, 'issue.status', 'status'),
      this.groupCount(scope, 'issue.priority', 'priority'),
      this.byPlatform(scope),
      this.byAssignee(scope),
      this.trend(scope),
      this.slaCounts(scope),
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
    };
  }

  // Open issues past their SLA window (overdue) or within the at-risk fraction of
  // it. Thresholds mirror computeSla via the shared slaDueSql expression.
  private async slaCounts(scope: string[] | 'ALL') {
    const due = slaDueSql();
    const row = await this.base(scope)
      .andWhere('issue.status IN (:...open)', { open: OPEN_STATUSES })
      .select(`COUNT(*) FILTER (WHERE now() >= ${due})`, 'overdue')
      .addSelect(
        `COUNT(*) FILTER (WHERE now() < ${due} AND now() >= issue.created_at + (${due} - issue.created_at) * ${SLA_AT_RISK_FRACTION})`,
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
    };
  }
}
