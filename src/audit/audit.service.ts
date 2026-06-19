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
}
