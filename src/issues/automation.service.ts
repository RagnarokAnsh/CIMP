import {
  BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, Repository } from 'typeorm';
import { isUUID } from 'class-validator';
import {
  AccountStatus, ActorType, AutomationAction, AutomationTrigger, IssueStatus, Priority, Role,
} from '../common/enums';
import {
  AutomationRule, Issue, IssueLabel, Label, StaffUser,
} from '../entities';
import { AuthenticatedStaff } from '../auth/auth.types';
import { AuthService } from '../auth/auth.service';
import { ScopeService } from '../authz/scope.service';
import { STAFF_WRITE_ROLES } from '../authz/role-sets';
import { AuditService } from '../audit/audit.service';
import {
  IssueAssignedEvent, IssueEvents, IssuePriorityChangedEvent,
} from '../events/issue-events';
import { CreateAutomationRuleDto, UpdateAutomationRuleDto } from './dto/automation-rule.dto';

// Automation writes have no staff actor. Empty string matches the reporter path
// (ReporterService.addComment) and, unlike a real id, never equals a recipient's
// id — so NotificationsService's "never notify the actor" filter drops nobody.
const SYSTEM_ACTOR = '';

@Injectable()
export class AutomationService {
  private readonly logger = new Logger(AutomationService.name);

  constructor(
    @InjectRepository(AutomationRule) private readonly rules: Repository<AutomationRule>,
    @InjectRepository(Issue) private readonly issues: Repository<Issue>,
    @InjectRepository(StaffUser) private readonly staff: Repository<StaffUser>,
    @InjectRepository(Label) private readonly labels: Repository<Label>,
    private readonly dataSource: DataSource,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
    private readonly auth: AuthService,
    private readonly events: EventEmitter2,
  ) {}

  // ── CRUD (per-platform, scope-checked) ─────────────────────────────
  // Automation rules are platform config: write roles only, list included
  // (read-only watchers have no business here).
  private assertAccess(staff: AuthenticatedStaff, platformId: string): void {
    if (!this.scope.canAccessPlatform(staff, platformId, STAFF_WRITE_ROLES)) {
      throw new ForbiddenException('You do not have access to this platform.');
    }
  }

  async listForPlatform(staff: AuthenticatedStaff, platformId: string) {
    this.assertAccess(staff, platformId);
    const rows = await this.rules.find({
      where: { platform: { id: platformId } },
      order: { createdAt: 'ASC' },
    });
    return rows.map((r) => this.toView(r));
  }

  async create(staff: AuthenticatedStaff, platformId: string, dto: CreateAutomationRuleDto) {
    this.assertAccess(staff, platformId);
    await this.assertActionValue(platformId, dto.action, dto.actionValue);
    const saved = await this.rules.save(
      this.rules.create({
        platform: { id: platformId } as any,
        name: dto.name,
        trigger: dto.trigger,
        triggerStatus: dto.triggerStatus ?? null,
        action: dto.action,
        actionValue: dto.actionValue,
        enabled: dto.enabled ?? true,
        createdBy: staff.id,
      }),
    );
    return this.toView(saved);
  }

  async update(staff: AuthenticatedStaff, platformId: string, ruleId: string, dto: UpdateAutomationRuleDto) {
    this.assertAccess(staff, platformId);
    const rule = await this.rules.findOne({ where: { id: ruleId }, relations: { platform: true } });
    if (!rule || rule.platform.id !== platformId) throw new NotFoundException('Rule not found.');

    // action and actionValue are independently optional, so validate the pair the
    // rule will actually end up holding — sending only one half must not slip an
    // unchecked combination (e.g. action→ASSIGN over a leftover 'HIGH') past us.
    // Untouched pairs are left alone: renaming or disabling a rule must not fail
    // because its assignee lost the grant since.
    const action = dto.action ?? rule.action;
    const actionValue = dto.actionValue ?? rule.actionValue;
    if (dto.action !== undefined || dto.actionValue !== undefined) {
      await this.assertActionValue(platformId, action, actionValue);
    }

    Object.assign(rule, {
      name: dto.name ?? rule.name,
      enabled: dto.enabled ?? rule.enabled,
      trigger: dto.trigger ?? rule.trigger,
      triggerStatus: dto.triggerStatus !== undefined ? dto.triggerStatus : rule.triggerStatus,
      action,
      actionValue,
    });
    return this.toView(await this.rules.save(rule));
  }

  async remove(staff: AuthenticatedStaff, platformId: string, ruleId: string) {
    this.assertAccess(staff, platformId);
    const rule = await this.rules.findOne({ where: { id: ruleId }, relations: { platform: true } });
    if (!rule || rule.platform.id !== platformId) throw new NotFoundException('Rule not found.');
    await this.rules.remove(rule);
    return { ok: true };
  }

  // ── Action-value validation ────────────────────────────────────────
  // `actionValue` is one free-text column serving three actions, and the rule is
  // applied later by the system with no request pipe in front of it. Check the
  // value against its action here, at write time, using the same constraints the
  // manual path (IssuesService) enforces — otherwise a rule is a way to assign
  // issues to staff with no access to the platform, or to pin another platform's
  // label onto them.
  private async assertActionValue(
    platformId: string,
    action: AutomationAction,
    actionValue: string,
  ): Promise<void> {
    if (action === AutomationAction.SET_PRIORITY) {
      if (!Object.values(Priority).includes(actionValue as Priority)) {
        throw new BadRequestException(
          `actionValue for SET_PRIORITY must be one of: ${Object.values(Priority).join(', ')}.`,
        );
      }
      return;
    }
    if (action === AutomationAction.ASSIGN) {
      await this.assertAssignable(actionValue, platformId);
      return;
    }
    // ADD_LABEL: the labels catalog is per-platform, so a label id is only valid
    // on the platform that owns it.
    if (!isUUID(actionValue)) {
      throw new BadRequestException('actionValue for ADD_LABEL must be a label id.');
    }
    const label = await this.labels.findOne({
      where: { id: actionValue, platform: { id: platformId } },
    });
    if (!label) throw new BadRequestException('Label not found on this platform.');
  }

  // Mirrors IssuesService.applyAssignment: the target must exist, be ACTIVE, and
  // hold DEVELOPER globally or on this platform. Reuses AuthService.loadRoles +
  // ScopeService so "is a developer here" has exactly one definition.
  private async assertAssignable(staffUserId: string, platformId: string): Promise<void> {
    // Shape first: a non-uuid actionValue (rules written before this was checked)
    // makes Postgres throw on the id comparison instead of failing cleanly.
    if (!isUUID(staffUserId)) {
      throw new BadRequestException('actionValue for ASSIGN must be a staff id.');
    }
    const user = await this.staff.findOne({ where: { id: staffUserId } });
    if (!user || user.status !== AccountStatus.ACTIVE) {
      throw new BadRequestException('Assignee not found or inactive.');
    }
    const roles = await this.auth.loadRoles(user.id);
    const canDevelop = this.scope.canAccessPlatform(
      {
        id: user.id, idpSubject: user.idpSubject, name: user.name, email: user.email, roles,
      },
      platformId,
      [Role.DEVELOPER],
    );
    if (!canDevelop) {
      throw new BadRequestException('Assignee is not a developer on this platform.');
    }
  }

  // ── Engine (called from AutomationListener) ────────────────────────
  async applyForCreated(issueId: string, platformId: string): Promise<void> {
    await this.runMatching(issueId, { platform: { id: platformId }, enabled: true, trigger: AutomationTrigger.ISSUE_CREATED });
  }

  async applyForStatusChanged(issueId: string, platformId: string, to: IssueStatus): Promise<void> {
    const rules = await this.rules.find({
      where: { platform: { id: platformId }, enabled: true, trigger: AutomationTrigger.STATUS_CHANGED },
    });
    // Match rules with no specific status, or whose target status equals `to`.
    const matched = rules.filter((r) => r.triggerStatus === null || r.triggerStatus === to);
    await this.applyRules(issueId, matched);
  }

  private async runMatching(issueId: string, where: any): Promise<void> {
    const rules = await this.rules.find({ where });
    await this.applyRules(issueId, rules);
  }

  private async applyRules(issueId: string, rules: AutomationRule[]): Promise<void> {
    if (rules.length === 0) return;
    // `platform` is loaded because every domain event applyAction emits carries
    // the platform id (webhooks fan out per platform).
    const issue = await this.issues.findOne({
      where: { id: issueId },
      relations: { assignee: true, platform: true },
    });
    if (!issue) return;
    for (const rule of rules) {
      try {
        await this.applyAction(rule, issue);
      } catch (e) {
        // A misconfigured or stale rule (assignee since disabled / de-scoped,
        // deleted label) must not break intake.
        this.logger.warn(`Automation rule ${rule.id} failed on issue ${issueId}: ${(e as Error).message}`);
      }
    }
  }

  private async applyAction(rule: AutomationRule, issue: Issue): Promise<void> {
    const platformId = issue.platform.id;

    if (rule.action === AutomationAction.SET_PRIORITY) {
      const from = issue.priority;
      const to = rule.actionValue as Priority;
      if (from === to) return;

      await this.dataSource.transaction(async (em) => {
        await em.createQueryBuilder().update(Issue)
          .set({ priority: to })
          .where('id = :id', { id: issue.id }).execute();
        await this.audit.record({
          issueId: issue.id, actorType: ActorType.SYSTEM, action: 'PRIORITY_CHANGED',
          field: 'priority', oldValue: from, newValue: to,
          metadata: { automationRuleId: rule.id },
        }, em);
      });

      // Keep the in-memory issue in step: later rules in this run compare against
      // it, so a stale copy would re-write and report the wrong `from`.
      issue.priority = to;
      // Same event the manual path emits, after the commit — without it an
      // automation write is invisible to webhooks and the staff SSE stream.
      this.events.emit(IssueEvents.PRIORITY_CHANGED, {
        issueId: issue.id, platformId, from, to, actorStaffId: SYSTEM_ACTOR,
      } satisfies IssuePriorityChangedEvent);
    } else if (rule.action === AutomationAction.ASSIGN) {
      // Re-assigning the same person would re-notify them on every re-trigger.
      const from = issue.assignee?.id ?? null;
      if (from === rule.actionValue) return;
      // Re-check at apply time: a rule outlives the grant that made it valid, so
      // a revoked role or a disabled account must not be assigned to. Throwing
      // lands in applyRules' catch, which logs and moves on to the next rule.
      await this.assertAssignable(rule.actionValue, platformId);

      await this.dataSource.transaction(async (em) => {
        await em.createQueryBuilder().update(Issue)
          .set({ assignee: { id: rule.actionValue } as any })
          .where('id = :id', { id: issue.id }).execute();
        await this.audit.record({
          issueId: issue.id, actorType: ActorType.SYSTEM, action: 'ASSIGNED',
          field: 'assignee', oldValue: from, newValue: rule.actionValue,
          metadata: { automationRuleId: rule.id },
        }, em);
      });

      issue.assignee = { id: rule.actionValue } as StaffUser;
      // Drives NotificationsListener.onIssueAssigned — without it an
      // automation-assigned developer is never told the issue is theirs.
      this.events.emit(IssueEvents.ASSIGNED, {
        issueId: issue.id, platformId, assigneeId: rule.actionValue, actorStaffId: SYSTEM_ACTOR,
      } satisfies IssueAssignedEvent);
    } else if (rule.action === AutomationAction.ADD_LABEL) {
      // No domain event: labelling has none on the manual path either.
      await this.dataSource.transaction(async (em) => {
        await em.createQueryBuilder().insert().into(IssueLabel)
          .values({ issue: { id: issue.id } as any, label: { id: rule.actionValue } as any })
          .orIgnore().execute();
        await this.audit.record({
          issueId: issue.id, actorType: ActorType.SYSTEM, action: 'LABEL_ADDED',
          field: 'label', newValue: rule.actionValue, metadata: { automationRuleId: rule.id },
        }, em);
      });
    }
  }

  private toView(r: AutomationRule) {
    return {
      id: r.id,
      name: r.name,
      enabled: r.enabled,
      trigger: r.trigger,
      triggerStatus: r.triggerStatus,
      action: r.action,
      actionValue: r.actionValue,
      createdAt: r.createdAt,
    };
  }
}
