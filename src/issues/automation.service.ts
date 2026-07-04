import {
  ForbiddenException, Injectable, Logger, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  ActorType, AutomationAction, AutomationTrigger, IssueStatus, Priority, Role,
} from '../common/enums';
import {
  AutomationRule, Issue, IssueLabel,
} from '../entities';
import { AuthenticatedStaff } from '../auth/auth.types';
import { ScopeService } from '../authz/scope.service';
import { AuditService } from '../audit/audit.service';
import { CreateAutomationRuleDto, UpdateAutomationRuleDto } from './dto/automation-rule.dto';

const ALL_STAFF_ROLES: Role[] = [Role.FOCAL_POINT, Role.DEVELOPER, Role.ADMIN];

@Injectable()
export class AutomationService {
  private readonly logger = new Logger(AutomationService.name);

  constructor(
    @InjectRepository(AutomationRule) private readonly rules: Repository<AutomationRule>,
    @InjectRepository(Issue) private readonly issues: Repository<Issue>,
    private readonly dataSource: DataSource,
    private readonly scope: ScopeService,
    private readonly audit: AuditService,
  ) {}

  // ── CRUD (per-platform, scope-checked) ─────────────────────────────
  private assertAccess(staff: AuthenticatedStaff, platformId: string): void {
    if (!this.scope.canAccessPlatform(staff, platformId, ALL_STAFF_ROLES)) {
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
    Object.assign(rule, {
      name: dto.name ?? rule.name,
      enabled: dto.enabled ?? rule.enabled,
      trigger: dto.trigger ?? rule.trigger,
      triggerStatus: dto.triggerStatus !== undefined ? dto.triggerStatus : rule.triggerStatus,
      action: dto.action ?? rule.action,
      actionValue: dto.actionValue ?? rule.actionValue,
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
    const issue = await this.issues.findOne({ where: { id: issueId }, relations: { assignee: true } });
    if (!issue) return;
    for (const rule of rules) {
      try {
        await this.applyAction(rule, issue);
      } catch (e) {
        // A misconfigured rule (bad assignee/label id) must not break intake.
        this.logger.warn(`Automation rule ${rule.id} failed on issue ${issueId}: ${(e as Error).message}`);
      }
    }
  }

  private async applyAction(rule: AutomationRule, issue: Issue): Promise<void> {
    await this.dataSource.transaction(async (em) => {
      if (rule.action === AutomationAction.SET_PRIORITY) {
        if (issue.priority === (rule.actionValue as Priority)) return;
        await em.createQueryBuilder().update(Issue)
          .set({ priority: rule.actionValue as Priority })
          .where('id = :id', { id: issue.id }).execute();
        await this.audit.record({
          issueId: issue.id, actorType: ActorType.SYSTEM, action: 'PRIORITY_CHANGED',
          field: 'priority', oldValue: issue.priority, newValue: rule.actionValue,
          metadata: { automationRuleId: rule.id },
        }, em);
      } else if (rule.action === AutomationAction.ASSIGN) {
        await em.createQueryBuilder().update(Issue)
          .set({ assignee: { id: rule.actionValue } as any })
          .where('id = :id', { id: issue.id }).execute();
        await this.audit.record({
          issueId: issue.id, actorType: ActorType.SYSTEM, action: 'ASSIGNED',
          field: 'assignee', oldValue: issue.assignee?.id ?? null, newValue: rule.actionValue,
          metadata: { automationRuleId: rule.id },
        }, em);
      } else if (rule.action === AutomationAction.ADD_LABEL) {
        await em.createQueryBuilder().insert().into(IssueLabel)
          .values({ issue: { id: issue.id } as any, label: { id: rule.actionValue } as any })
          .orIgnore().execute();
        await this.audit.record({
          issueId: issue.id, actorType: ActorType.SYSTEM, action: 'LABEL_ADDED',
          field: 'label', newValue: rule.actionValue, metadata: { automationRuleId: rule.id },
        }, em);
      }
    });
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
