import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, Repository } from 'typeorm';
import { ActorType } from '../common/enums';
import { AuditEvent } from '../entities';

export interface AuditInput {
  issueId?: string | null;
  actorType: ActorType;
  actorId?: string | null;
  action: string;
  field?: string | null;
  oldValue?: string | null;
  newValue?: string | null;
  metadata?: Record<string, unknown> | null;
}

// Central writer for the immutable audit trail. Every state-changing action
// (status, assignment, priority, comments, admin changes) records one event.
// Pass a transaction's EntityManager to keep the audit row atomic with the
// change it describes.
@Injectable()
export class AuditService {
  constructor(
    @InjectRepository(AuditEvent) private readonly events: Repository<AuditEvent>,
  ) {}

  async record(input: AuditInput, em?: EntityManager): Promise<void> {
    const repo = em ? em.getRepository(AuditEvent) : this.events;
    await repo.save(
      repo.create({
        issue: input.issueId ? ({ id: input.issueId } as any) : null,
        actorType: input.actorType,
        actorId: input.actorId ?? null,
        action: input.action,
        field: input.field ?? null,
        oldValue: input.oldValue ?? null,
        newValue: input.newValue ?? null,
        metadata: input.metadata ?? null,
      }),
    );
  }

  // History for an issue, newest first.
  async forIssue(issueId: string): Promise<AuditEvent[]> {
    return this.events.find({
      where: { issue: { id: issueId } },
      order: { createdAt: 'DESC' },
    });
  }

  // Admin audit-log viewer: filterable, paginated feed across all issues.
  async query(filters: {
    actorType?: ActorType;
    action?: string;
    issueId?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  }): Promise<{ data: any[]; total: number; page: number; pageSize: number }> {
    const page = Math.max(1, filters.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, filters.pageSize ?? 50));

    const qb = this.events
      .createQueryBuilder('e')
      .leftJoin('e.issue', 'issue')
      .addSelect(['issue.id', 'issue.referenceNo'])
      .orderBy('e.created_at', 'DESC')
      .skip((page - 1) * pageSize)
      .take(pageSize);

    if (filters.actorType) qb.andWhere('e.actor_type = :actorType', { actorType: filters.actorType });
    if (filters.action) qb.andWhere('e.action = :action', { action: filters.action });
    if (filters.issueId) qb.andWhere('issue.id = :issueId', { issueId: filters.issueId });
    if (filters.from) qb.andWhere('e.created_at >= :from', { from: filters.from });
    if (filters.to) qb.andWhere('e.created_at <= :to', { to: filters.to });

    const [rows, total] = await qb.getManyAndCount();
    return {
      data: rows.map((e) => ({
        id: e.id,
        actorType: e.actorType,
        actorId: e.actorId,
        action: e.action,
        field: e.field,
        oldValue: e.oldValue,
        newValue: e.newValue,
        createdAt: e.createdAt,
        issue: e.issue ? { id: e.issue.id, referenceNo: e.issue.referenceNo } : null,
      })),
      total,
      page,
      pageSize,
    };
  }
}
