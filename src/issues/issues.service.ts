import {
  BadRequestException, ConflictException, ForbiddenException, Injectable,
  NotFoundException, UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Brackets, DataSource, Repository } from 'typeorm';
import { AccountStatus, ActorType, IssueStatus, Priority, Role } from '../common/enums';
import { Issue, Platform, StaffUser, UserPlatformRole } from '../entities';
import { AuthenticatedStaff } from '../auth/auth.types';
import { AuthService } from '../auth/auth.service';
import { ScopeService } from '../authz/scope.service';
import { AuditService } from '../audit/audit.service';
import {
  IssueAssignedEvent, IssueEvents, IssuePriorityChangedEvent, IssueStatusChangedEvent,
} from '../events/issue-events';
import { ListIssuesDto } from './dto/list-issues.dto';
import { UpdateStatusDto } from './dto/update-status.dto';
import { UpdateAssignmentDto } from './dto/update-assignment.dto';
import { UpdatePriorityDto } from './dto/update-priority.dto';
import { BulkOp, BulkUpdateDto } from './dto/bulk-update.dto';
import { canTransition } from './status-machine';
import { computeSla } from './sla';

@Injectable()
export class IssuesService {
  constructor(
    @InjectRepository(Issue) private readonly issues: Repository<Issue>,
    @InjectRepository(StaffUser) private readonly staff: Repository<StaffUser>,
    @InjectRepository(UserPlatformRole) private readonly roles: Repository<UserPlatformRole>,
    @InjectRepository(Platform) private readonly platforms: Repository<Platform>,
    private readonly dataSource: DataSource,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    private readonly events: EventEmitter2,
    private readonly config: ConfigService,
  ) {}

  // ---- Queries -------------------------------------------------------------

  async list(staff: AuthenticatedStaff, dto: ListIssuesDto) {
    const scope = this.scope.scopedPlatformIds(staff);
    if (Array.isArray(scope) && scope.length === 0) {
      return { data: [], total: 0, page: dto.page, pageSize: dto.pageSize };
    }

    const qb = this.buildListQuery(staff, dto, scope);
    qb.skip((dto.page - 1) * dto.pageSize).take(dto.pageSize);

    // When the search has full-text terms, lead with relevance (description match
    // weight) then fall back to the requested sort. The rank is a named select so
    // TypeORM's join-pagination can order by it. Reference-only searches (no FTS
    // terms) just use the requested sort.
    const tsq = dto.q ? this.searchParams(dto.q).tsq : '';
    if (tsq) {
      qb.addSelect(
        `ts_rank(to_tsvector('english', issue.description), to_tsquery('english', :tsq))`,
        'rank',
      )
        .orderBy('rank', 'DESC')
        .addOrderBy(`issue.${dto.sort}`, dto.order);
    } else {
      qb.orderBy(`issue.${dto.sort}`, dto.order);
    }

    const [rows, total] = await qb.getManyAndCount();
    return {
      data: rows.map((i) => this.toListItem(i)),
      total,
      page: dto.page,
      pageSize: dto.pageSize,
    };
  }

  // Used by the CSV export — same filters/scope, no pagination.
  async listAllForExport(staff: AuthenticatedStaff, dto: ListIssuesDto): Promise<Issue[]> {
    const scope = this.scope.scopedPlatformIds(staff);
    if (Array.isArray(scope) && scope.length === 0) return [];
    const qb = this.buildListQuery(staff, dto, scope);
    qb.orderBy(`issue.${dto.sort}`, dto.order);
    return qb.getMany();
  }

  async getDetail(issueId: string) {
    const issue = await this.issues.findOne({
      where: { id: issueId },
      relations: {
        platform: true,
        reporter: true,
        assignee: true,
        attachments: true,
        comments: { author: true },
      },
    });
    if (!issue) throw new NotFoundException('Issue not found');

    const history = await this.audit.forIssue(issueId);
    return {
      id: issue.id,
      referenceNo: issue.referenceNo,
      status: issue.status,
      priority: issue.priority,
      version: issue.version,
      ...computeSla(issue),
      description: issue.description,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
      resolvedAt: issue.resolvedAt,
      closedAt: issue.closedAt,
      jiraIssueKey: issue.jiraIssueKey,
      jiraSyncStatus: issue.jiraSyncStatus,
      platform: { id: issue.platform.id, key: issue.platform.key, name: issue.platform.name },
      reporter: issue.reporter
        ? { id: issue.reporter.id, name: issue.reporter.name, email: issue.reporter.email }
        : null,
      assignee: issue.assignee
        ? { id: issue.assignee.id, name: issue.assignee.name, email: issue.assignee.email }
        : null,
      attachments: (issue.attachments ?? []).map((a) => ({
        id: a.id,
        filename: a.filename,
        contentType: a.contentType,
        sizeBytes: a.sizeBytes,
        scanStatus: a.scanStatus,
      })),
      comments: (issue.comments ?? [])
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .map((c) => ({
          id: c.id,
          body: c.body,
          visibility: c.visibility,
          authorType: c.authorType,
          author: c.author
            ? { id: c.author.id, name: c.author.name }
            : c.authorType === ActorType.REPORTER
              ? { id: null, name: c.authorName ?? 'Reporter' }
              : null,
          createdAt: c.createdAt,
          editedAt: c.editedAt,
        })),
      history: history.map((h) => ({
        action: h.action,
        field: h.field,
        oldValue: h.oldValue,
        newValue: h.newValue,
        actorType: h.actorType,
        actorId: h.actorId,
        createdAt: h.createdAt,
      })),
    };
  }

  // Platforms in the staff member's scope — used to populate the issue-list
  // platform filter (admins/global staff see all).
  async listScopedPlatforms(staff: AuthenticatedStaff) {
    const scope = this.scope.scopedPlatformIds(staff);
    const qb = this.platforms.createQueryBuilder('p').orderBy('p.name', 'ASC');
    if (scope !== 'ALL') {
      if (scope.length === 0) return [];
      qb.where('p.id IN (:...ids)', { ids: scope });
    }
    const rows = await qb.getMany();
    return rows.map((p) => ({ id: p.id, key: p.key, name: p.name }));
  }

  // Active developers who may be assigned this issue: anyone holding a DEVELOPER
  // grant for the issue's platform, plus global developers (platform = null).
  async listAssignees(issueId: string) {
    const issue = await this.issues.findOne({
      where: { id: issueId },
      relations: { platform: true },
    });
    if (!issue) throw new NotFoundException('Issue not found');

    const grants = await this.roles
      .createQueryBuilder('upr')
      .innerJoinAndSelect('upr.staffUser', 'su')
      .leftJoin('upr.platform', 'p')
      .where('upr.role = :role', { role: Role.DEVELOPER })
      .andWhere('su.status = :active', { active: AccountStatus.ACTIVE })
      .andWhere(
        new Brackets((w) => {
          w.where('p.id = :pid', { pid: issue.platform.id }).orWhere('upr.platform_id IS NULL');
        }),
      )
      .getMany();

    const byId = new Map<string, { id: string; name: string; email: string }>();
    for (const g of grants) {
      const u = g.staffUser;
      if (u && !byId.has(u.id)) byId.set(u.id, { id: u.id, name: u.name, email: u.email });
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  // Everyone who can be @mentioned on this issue: any active staff holding a role
  // (any role) on the issue's platform, plus global staff. Broader than the
  // developer-only assignee list so focal points and admins can be looped in.
  async listPlatformMembers(issueId: string) {
    const issue = await this.issues.findOne({
      where: { id: issueId },
      relations: { platform: true },
    });
    if (!issue) throw new NotFoundException('Issue not found');

    const grants = await this.roles
      .createQueryBuilder('upr')
      .innerJoinAndSelect('upr.staffUser', 'su')
      .leftJoin('upr.platform', 'p')
      .where('su.status = :active', { active: AccountStatus.ACTIVE })
      .andWhere(
        new Brackets((w) => {
          w.where('p.id = :pid', { pid: issue.platform.id }).orWhere('upr.platform_id IS NULL');
        }),
      )
      .getMany();

    const byId = new Map<string, { id: string; name: string; email: string }>();
    for (const g of grants) {
      const u = g.staffUser;
      if (u && !byId.has(u.id)) byId.set(u.id, { id: u.id, name: u.name, email: u.email });
    }
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  // ---- Mutations -----------------------------------------------------------

  // Public single-issue handlers return the refreshed detail. The actual
  // write/audit/emit work lives in the `apply*` cores so the bulk loop can reuse
  // it on an already-loaded issue without the per-issue detail round-trip.

  async changeStatus(staff: AuthenticatedStaff, issueId: string, dto: UpdateStatusDto) {
    const issue = await this.loadForWrite(issueId);
    await this.applyStatus(staff, issue, dto);
    return this.getDetail(issueId);
  }

  async changeAssignment(staff: AuthenticatedStaff, issueId: string, dto: UpdateAssignmentDto) {
    const issue = await this.loadForWrite(issueId);
    await this.applyAssignment(staff, issue, dto);
    return this.getDetail(issueId);
  }

  async changePriority(staff: AuthenticatedStaff, issueId: string, dto: UpdatePriorityDto) {
    const issue = await this.loadForWrite(issueId);
    await this.applyPriority(staff, issue, dto);
    return this.getDetail(issueId);
  }

  private async applyStatus(staff: AuthenticatedStaff, issue: Issue, dto: UpdateStatusDto) {
    const issueId = issue.id;
    this.assertVersion(issue, dto.version);
    this.assertCanTransition(staff, issue.platform.id);

    if (issue.status === dto.status) {
      throw new UnprocessableEntityException('Issue is already in that status.');
    }
    if (!canTransition(issue.status, dto.status)) {
      throw new UnprocessableEntityException(
        `Cannot transition from ${issue.status} to ${dto.status}.`,
      );
    }

    const from = issue.status;
    issue.status = dto.status;
    this.applyStatusSideEffects(issue, dto.status);

    await this.dataSource.transaction(async (em) => {
      await em.save(issue);
      await this.audit.record(
        {
          issueId,
          actorType: ActorType.STAFF,
          actorId: staff.id,
          action: 'STATUS_CHANGED',
          field: 'status',
          oldValue: from,
          newValue: dto.status,
        },
        em,
      );
    });

    this.events.emit(IssueEvents.STATUS_CHANGED, {
      issueId,
      platformId: issue.platform.id,
      from,
      to: dto.status,
      actorStaffId: staff.id,
    } satisfies IssueStatusChangedEvent);
  }

  private async applyAssignment(
    staff: AuthenticatedStaff,
    issue: Issue,
    dto: UpdateAssignmentDto,
  ) {
    const issueId = issue.id;
    this.assertVersion(issue, dto.version);

    const oldAssigneeId = issue.assignee?.id ?? null;
    let newAssignee: StaffUser | null = null;

    if (dto.assigneeId) {
      newAssignee = await this.staff.findOne({ where: { id: dto.assigneeId } });
      if (!newAssignee || newAssignee.status !== AccountStatus.ACTIVE) {
        throw new BadRequestException('Assignee not found or inactive.');
      }
      const roles = await this.auth.loadRoles(newAssignee.id);
      const canDevelop = this.scope.canAccessPlatform(
        { ...this.asStaff(newAssignee), roles },
        issue.platform.id,
        [Role.DEVELOPER],
      );
      if (!canDevelop) {
        throw new BadRequestException('Assignee is not a developer on this platform.');
      }
    }

    issue.assignee = newAssignee;

    await this.dataSource.transaction(async (em) => {
      await em.save(issue);
      await this.audit.record(
        {
          issueId,
          actorType: ActorType.STAFF,
          actorId: staff.id,
          action: 'ASSIGNED',
          field: 'assignee',
          oldValue: oldAssigneeId,
          newValue: newAssignee?.id ?? null,
        },
        em,
      );
    });

    this.events.emit(IssueEvents.ASSIGNED, {
      issueId,
      platformId: issue.platform.id,
      assigneeId: newAssignee?.id ?? null,
      actorStaffId: staff.id,
    } satisfies IssueAssignedEvent);
  }

  private async applyPriority(staff: AuthenticatedStaff, issue: Issue, dto: UpdatePriorityDto) {
    const issueId = issue.id;
    this.assertVersion(issue, dto.version);

    const from = issue.priority;
    if (from === dto.priority) return;
    issue.priority = dto.priority;

    await this.dataSource.transaction(async (em) => {
      await em.save(issue);
      await this.audit.record(
        {
          issueId,
          actorType: ActorType.STAFF,
          actorId: staff.id,
          action: 'PRIORITY_CHANGED',
          field: 'priority',
          oldValue: from,
          newValue: dto.priority,
        },
        em,
      );
    });

    this.events.emit(IssueEvents.PRIORITY_CHANGED, {
      issueId,
      platformId: issue.platform.id,
      from,
      to: dto.priority,
      actorStaffId: staff.id,
    } satisfies IssuePriorityChangedEvent);
  }

  // Apply one change to many issues. Each issue is validated and written through
  // the same single-issue paths (scope, state machine, OD-09 gate, audit, events),
  // so a failure on one issue is recorded as "skipped" without aborting the rest.
  async bulkUpdate(staff: AuthenticatedStaff, dto: BulkUpdateDto) {
    const scope = this.scope.scopedPlatformIds(staff);
    if (Array.isArray(scope) && scope.length === 0) {
      return { updated: 0, skipped: dto.ids.map((id) => ({ id, reason: 'Out of scope' })) };
    }

    // Validate the target value up front (these writes bypass the request pipe).
    if (dto.op === BulkOp.STATUS && !Object.values(IssueStatus).includes(dto.value as IssueStatus)) {
      throw new BadRequestException('Invalid status value.');
    }
    if (dto.op === BulkOp.PRIORITY && !Object.values(Priority).includes(dto.value as Priority)) {
      throw new BadRequestException('Invalid priority value.');
    }

    const skipped: { id: string; reason: string }[] = [];
    let updated = 0;

    for (const id of dto.ids) {
      try {
        const issue = await this.loadForWrite(id);
        if (!this.scope.scopeAllows(scope, issue.platform.id)) {
          skipped.push({ id, reason: 'Out of scope' });
          continue;
        }
        // Reuse the loaded issue and skip the per-issue getDetail round-trip
        // that the public single-issue handlers do.
        if (dto.op === BulkOp.STATUS) {
          await this.applyStatus(staff, issue, { status: dto.value as IssueStatus, version: issue.version });
        } else if (dto.op === BulkOp.PRIORITY) {
          await this.applyPriority(staff, issue, { priority: dto.value as Priority, version: issue.version });
        } else {
          await this.applyAssignment(staff, issue, { assigneeId: dto.value || null, version: issue.version });
        }
        updated += 1;
      } catch (e) {
        skipped.push({ id, reason: (e as Error)?.message ?? 'Update failed' });
      }
    }

    return { updated, skipped };
  }

  // ---- Helpers -------------------------------------------------------------

  private buildListQuery(staff: AuthenticatedStaff, dto: ListIssuesDto, scope: string[] | 'ALL') {
    const qb = this.issues
      .createQueryBuilder('issue')
      .leftJoinAndSelect('issue.platform', 'platform')
      .leftJoinAndSelect('issue.reporter', 'reporter')
      .leftJoinAndSelect('issue.assignee', 'assignee');

    if (scope !== 'ALL') {
      qb.andWhere('platform.id IN (:...scopeIds)', { scopeIds: scope });
    }
    if (dto.platformId) {
      qb.andWhere('platform.id = :platformId', { platformId: dto.platformId });
    }
    if (dto.status) qb.andWhere('issue.status = :status', { status: dto.status });
    if (dto.priority) qb.andWhere('issue.priority = :priority', { priority: dto.priority });
    if (dto.assigneeId) qb.andWhere('assignee.id = :assigneeId', { assigneeId: dto.assigneeId });
    if (dto.from) qb.andWhere('issue.created_at >= :from', { from: dto.from });
    if (dto.to) qb.andWhere('issue.created_at <= :to', { to: dto.to });

    if (dto.q) {
      // Match the reference number (prefix/substring, for "jump to issue") OR
      // full-text over description + comment bodies. The FTS uses a prefix
      // tsquery (`term:*`) so it matches as the user types, not only on complete
      // words. In production the search_vector + GIN migration
      // (src/migrations/*AddIssueSearchVector*) makes the FTS branch index-backed.
      const { tsq, likeRef } = this.searchParams(dto.q);
      qb.andWhere(
        new Brackets((w) => {
          w.where('issue.reference_no ILIKE :likeRef', { likeRef });
          if (tsq) {
            w.orWhere(`to_tsvector('english', issue.description) @@ to_tsquery('english', :tsq)`, {
              tsq,
            }).orWhere(
              'issue.id IN ' +
                qb
                  .subQuery()
                  .select('c.issue_id')
                  .from('comments', 'c')
                  .where(`to_tsvector('english', c.body) @@ to_tsquery('english', :tsq)`)
                  .getQuery(),
              { tsq },
            );
          }
        }),
      );
    }
    return qb;
  }

  // Turns a raw search string into a prefix full-text query (`foo:* & bar:*`) and
  // a reference-number LIKE pattern. Stripping non-alphanumerics keeps the
  // to_tsquery input safe from syntax errors.
  private searchParams(q: string): { tsq: string; likeRef: string } {
    const raw = q.trim();
    const terms = raw
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.replace(/[^a-z0-9]/g, ''))
      .filter(Boolean);
    return { tsq: terms.map((t) => `${t}:*`).join(' & '), likeRef: `%${raw}%` };
  }

  // A single-line snippet of the description so list rows read like a summary
  // (the "title" the data model otherwise lacks).
  private preview(text: string, max = 140): string {
    const oneLine = (text ?? '').replace(/\s+/g, ' ').trim();
    return oneLine.length > max ? `${oneLine.slice(0, max).trimEnd()}…` : oneLine;
  }

  private toListItem(i: Issue) {
    return {
      id: i.id,
      referenceNo: i.referenceNo,
      status: i.status,
      priority: i.priority,
      version: i.version,
      descriptionPreview: this.preview(i.description),
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
      ...computeSla(i),
      platform: i.platform ? { id: i.platform.id, key: i.platform.key, name: i.platform.name } : null,
      reporter: i.reporter ? { id: i.reporter.id, name: i.reporter.name } : null,
      assignee: i.assignee ? { id: i.assignee.id, name: i.assignee.name } : null,
    };
  }

  private async loadForWrite(issueId: string): Promise<Issue> {
    const issue = await this.issues.findOne({
      where: { id: issueId },
      relations: { platform: true, assignee: true },
    });
    if (!issue) throw new NotFoundException('Issue not found');
    return issue;
  }

  private assertVersion(issue: Issue, version: number | undefined): void {
    if (version !== undefined && version !== issue.version) {
      throw new ConflictException(
        'This issue was modified by someone else. Reload and try again.',
      );
    }
  }

  // OD-09 seam: focal points may transition status only when the flag is on.
  private assertCanTransition(staff: AuthenticatedStaff, platformId: string): void {
    const roles: Role[] = [Role.DEVELOPER, Role.ADMIN];
    if (this.config.get<boolean>('focalPointCanTransition')) {
      roles.push(Role.FOCAL_POINT);
    }
    if (!this.scope.canAccessPlatform(staff, platformId, roles)) {
      throw new ForbiddenException('You may not change the status of this issue.');
    }
  }

  private applyStatusSideEffects(issue: Issue, to: IssueStatus): void {
    if (to === IssueStatus.RESOLVED) {
      issue.resolvedAt = new Date();
    } else if (to === IssueStatus.CLOSED) {
      issue.closedAt = issue.closedAt ?? new Date();
    } else if (to === IssueStatus.REOPENED) {
      issue.resolvedAt = null;
      issue.closedAt = null;
    }
  }

  private asStaff(user: StaffUser): AuthenticatedStaff {
    return {
      id: user.id,
      idpSubject: user.idpSubject,
      name: user.name,
      email: user.email,
      roles: [],
    };
  }
}
