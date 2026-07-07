import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { Role } from '../common/enums';
import { Issue, IssueLabel, Label } from '../entities';
import { AuthenticatedStaff } from '../auth/auth.types';
import { ScopeService } from '../authz/scope.service';
import { STAFF_READ_ROLES, STAFF_WRITE_ROLES } from '../authz/role-sets';
import { AddIssueLabelDto, CreateLabelDto } from './dto/label.dto';
const isUniqueViolation = (e: unknown): boolean =>
  e instanceof QueryFailedError
  && (e as QueryFailedError & { driverError?: { code?: string } }).driverError?.code === '23505';

@Injectable()
export class LabelsService {
  constructor(
    @InjectRepository(Label) private readonly labels: Repository<Label>,
    @InjectRepository(IssueLabel) private readonly issueLabels: Repository<IssueLabel>,
    @InjectRepository(Issue) private readonly issues: Repository<Issue>,
    private readonly scope: ScopeService,
  ) {}

  // ── Per-platform label catalog ─────────────────────────────────────
  // Reading the catalog needs any role on the platform (watchers see labels on
  // issues, so they may list them); creating/deleting needs a write role.
  private assertPlatformAccess(staff: AuthenticatedStaff, platformId: string, roles: Role[]): void {
    if (!this.scope.canAccessPlatform(staff, platformId, roles)) {
      throw new ForbiddenException('You do not have access to this platform.');
    }
  }

  async listForPlatform(staff: AuthenticatedStaff, platformId: string) {
    this.assertPlatformAccess(staff, platformId, STAFF_READ_ROLES);
    const rows = await this.labels.find({
      where: { platform: { id: platformId } },
      order: { name: 'ASC' },
    });
    return rows.map((l) => this.toView(l));
  }

  async createForPlatform(staff: AuthenticatedStaff, platformId: string, dto: CreateLabelDto) {
    this.assertPlatformAccess(staff, platformId, STAFF_WRITE_ROLES);
    try {
      const saved = await this.labels.save(
        this.labels.create({
          platform: { id: platformId } as any,
          name: dto.name.trim(),
          color: dto.color ?? '#6b7280',
        }),
      );
      return this.toView(saved);
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException('A label with that name already exists on this platform.');
      throw e;
    }
  }

  async deleteForPlatform(staff: AuthenticatedStaff, platformId: string, labelId: string) {
    this.assertPlatformAccess(staff, platformId, STAFF_WRITE_ROLES);
    const label = await this.labels.findOne({ where: { id: labelId }, relations: { platform: true } });
    if (!label || label.platform.id !== platformId) throw new NotFoundException('Label not found.');
    await this.labels.remove(label);
    return { ok: true };
  }

  // ── Issue ↔ label assignment (issue access already enforced by the guard) ──
  async listForIssue(issueId: string) {
    const rows = await this.issueLabels.find({
      where: { issue: { id: issueId } },
      relations: { label: true },
    });
    return rows.map((il) => this.toView(il.label));
  }

  async addToIssue(issueId: string, dto: AddIssueLabelDto) {
    const issue = await this.issues.findOne({ where: { id: issueId }, relations: { platform: true } });
    if (!issue) throw new NotFoundException('Issue not found.');
    const label = await this.labels.findOne({ where: { id: dto.labelId }, relations: { platform: true } });
    if (!label) throw new NotFoundException('Label not found.');
    if (label.platform.id !== issue.platform.id) {
      throw new BadRequestException('Label belongs to a different platform.');
    }
    try {
      await this.issueLabels.save(
        this.issueLabels.create({ issue: { id: issueId } as any, label: { id: label.id } as any }),
      );
    } catch (e) {
      if (!isUniqueViolation(e)) throw e; // already attached → idempotent
    }
    return this.listForIssue(issueId);
  }

  async removeFromIssue(issueId: string, labelId: string) {
    const row = await this.issueLabels.findOne({
      where: { issue: { id: issueId }, label: { id: labelId } },
    });
    if (row) await this.issueLabels.remove(row);
    return { ok: true };
  }

  private toView(l: Label) {
    return { id: l.id, name: l.name, color: l.color };
  }
}
