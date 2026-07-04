import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { Issue, IssueWatcher } from '../entities';
import { AuthenticatedStaff } from '../auth/auth.types';

const isUniqueViolation = (e: unknown): boolean =>
  e instanceof QueryFailedError
  && (e as QueryFailedError & { driverError?: { code?: string } }).driverError?.code === '23505';

@Injectable()
export class WatchersService {
  constructor(
    @InjectRepository(IssueWatcher) private readonly watchers: Repository<IssueWatcher>,
    @InjectRepository(Issue) private readonly issues: Repository<Issue>,
  ) {}

  async watch(staff: AuthenticatedStaff, issueId: string) {
    const issue = await this.issues.findOne({ where: { id: issueId } });
    if (!issue) throw new NotFoundException('Issue not found.');
    try {
      await this.watchers.save(
        this.watchers.create({ issue: { id: issueId } as any, staffUser: { id: staff.id } as any }),
      );
    } catch (e) {
      if (!isUniqueViolation(e)) throw e; // already watching → idempotent
    }
    return this.listForIssue(staff, issueId);
  }

  async unwatch(staff: AuthenticatedStaff, issueId: string) {
    const row = await this.watchers.findOne({
      where: { issue: { id: issueId }, staffUser: { id: staff.id } },
    });
    if (row) await this.watchers.remove(row);
    return this.listForIssue(staff, issueId);
  }

  async listForIssue(staff: AuthenticatedStaff, issueId: string) {
    const rows = await this.watchers.find({
      where: { issue: { id: issueId } },
      relations: { staffUser: true },
      order: { createdAt: 'ASC' },
    });
    return {
      watching: rows.some((w) => w.staffUser?.id === staff.id),
      watchers: rows.map((w) => ({ id: w.staffUser.id, name: w.staffUser.name })),
    };
  }
}
