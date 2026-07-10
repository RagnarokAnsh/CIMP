import {
  ConflictException, Injectable, Logger, NotFoundException, UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { DataSource, Repository } from 'typeorm';
import {
  ActorType, CommentVisibility, IssueLinkType, IssueStatus,
} from '../common/enums';
import { Comment, Issue, IssueLink } from '../entities';
import { AuthenticatedStaff } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import {
  IssueEvents, IssueMergedEvent, IssueStatusChangedEvent,
} from '../events/issue-events';
import { MergeIssueDto } from './dto/merge-issue.dto';

// Duplicate merge: closes the duplicate with a pointer to the canonical issue,
// then (via the STATUS_CHANGED listener below) tells every duplicate's reporter
// when the canonical is resolved. Reporter-facing signals are in-app only
// (OD-02): a reporter-visible system comment + the updatedAt bump that drives
// the "has updates" flag — never email.
@Injectable()
export class MergeService {
  private readonly logger = new Logger(MergeService.name);

  constructor(
    @InjectRepository(Issue) private readonly issues: Repository<Issue>,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  // Access to `issueId` (the duplicate) is enforced by PlatformAccessGuard on
  // the route; the same-platform check below extends that to the canonical.
  async merge(staff: AuthenticatedStaff, issueId: string, dto: MergeIssueDto) {
    if (issueId === dto.canonicalIssueId) {
      throw new UnprocessableEntityException('An issue cannot be merged into itself.');
    }

    const duplicate = await this.issues.findOne({
      where: { id: issueId },
      relations: { platform: true, duplicateOf: true },
    });
    let canonical = await this.issues.findOne({
      where: { id: dto.canonicalIssueId },
      relations: { platform: true, duplicateOf: true },
    });
    if (!duplicate || !canonical) throw new NotFoundException('Issue not found');

    if (duplicate.platform.id !== canonical.platform.id) {
      throw new UnprocessableEntityException('Issues can only be merged within the same platform.');
    }
    if (duplicate.duplicateOf) {
      throw new ConflictException('This issue is already merged into another issue.');
    }
    if (duplicate.status === IssueStatus.CLOSED) {
      throw new UnprocessableEntityException('A closed issue cannot be merged.');
    }
    if (dto.version !== duplicate.version) {
      throw new ConflictException('This issue was modified by someone else. Reload and try again.');
    }

    // Flatten chains: merging into something that is itself a duplicate lands
    // on ITS canonical, so duplicate_of_id pointers are always one hop deep.
    if (canonical.duplicateOf) {
      canonical = await this.issues.findOne({
        where: { id: canonical.duplicateOf.id },
        relations: { platform: true, duplicateOf: true },
      });
      if (!canonical || canonical.duplicateOf) {
        throw new ConflictException('The chosen canonical issue is itself an unresolvable duplicate.');
      }
      if (canonical.id === duplicate.id) {
        throw new UnprocessableEntityException('An issue cannot be merged into itself.');
      }
    }
    if (canonical.status === IssueStatus.CLOSED) {
      throw new UnprocessableEntityException('Cannot merge into a closed issue.');
    }

    const canonicalId = canonical.id;
    const from = duplicate.status;

    await this.dataSource.transaction(async (em) => {
      // Sanctioned status-machine exception: merge is an administrative
      // terminal close (like the state machine's hard-close edges), not a
      // workflow transition — deliberately not routed through canTransition.
      duplicate.duplicateOf = { id: canonicalId } as Issue;
      duplicate.status = IssueStatus.CLOSED;
      duplicate.closedAt = duplicate.closedAt ?? new Date();
      await em.save(duplicate);

      await em
        .createQueryBuilder()
        .insert()
        .into(IssueLink)
        .values({
          sourceIssue: { id: duplicate.id } as Issue,
          targetIssue: { id: canonicalId } as Issue,
          type: IssueLinkType.DUPLICATES,
          createdBy: staff.id,
        })
        .orIgnore()
        .execute();

      // Carry the duplicate's staff watchers over to the canonical so they
      // keep receiving updates about the underlying problem.
      await em.query(
        `INSERT INTO issue_watchers (issue_id, staff_user_id)
         SELECT $1, staff_user_id FROM issue_watchers WHERE issue_id = $2
         ON CONFLICT DO NOTHING`,
        [canonicalId, duplicate.id],
      );

      await em.save(
        em.create(Comment, {
          issue: { id: duplicate.id } as Issue,
          author: { id: staff.id } as any,
          authorType: ActorType.STAFF,
          body:
            'This issue was identified as a duplicate of an already-tracked problem. '
            + "It has been closed here, and you'll be notified on this issue when the underlying problem is resolved.",
          visibility: CommentVisibility.REPORTER_VISIBLE,
        }),
      );
      await em.save(
        em.create(Comment, {
          issue: { id: canonicalId } as Issue,
          author: { id: staff.id } as any,
          authorType: ActorType.STAFF,
          body: `${duplicate.referenceNo} was merged into this issue as a duplicate.`,
          visibility: CommentVisibility.INTERNAL,
        }),
      );

      await this.audit.record(
        {
          issueId: duplicate.id,
          actorType: ActorType.STAFF,
          actorId: staff.id,
          action: 'MERGED',
          field: 'duplicateOf',
          oldValue: from,
          newValue: canonicalId,
          metadata: { canonicalReferenceNo: canonical.referenceNo },
        },
        em,
      );
    });

    this.events.emit(IssueEvents.MERGED, {
      duplicateIssueId: duplicate.id,
      canonicalIssueId: canonicalId,
      platformId: duplicate.platform.id,
      actorStaffId: staff.id,
    } satisfies IssueMergedEvent);

    return { ok: true, canonicalIssueId: canonicalId };
  }

  // Close-the-loop: when a canonical issue is resolved, every issue merged into
  // it gets a reporter-visible system comment + an updatedAt bump so its
  // reporter sees the update in "My issues" (in-app only, OD-02).
  @OnEvent(IssueEvents.STATUS_CHANGED, { async: true })
  async onCanonicalStatusChanged(evt: IssueStatusChangedEvent): Promise<void> {
    if (evt.to !== IssueStatus.RESOLVED) return;
    try {
      const duplicates = await this.issues.find({
        where: { duplicateOf: { id: evt.issueId } },
      });
      if (duplicates.length === 0) return;

      await this.dataSource.transaction(async (em) => {
        for (const dup of duplicates) {
          await em.save(
            em.create(Comment, {
              issue: { id: dup.id } as Issue,
              author: null,
              authorType: ActorType.STAFF,
              body: 'The underlying problem this issue duplicated has been resolved.',
              visibility: CommentVisibility.REPORTER_VISIBLE,
            }),
          );
          // Surfaces as an unread update in the reporter portal (hasUpdates is
          // derived from updatedAt vs lastViewedAt); version untouched.
          await em
            .createQueryBuilder()
            .update(Issue)
            .set({ updatedAt: () => 'now()' })
            .where('id = :id', { id: dup.id })
            .execute();
        }
      });
    } catch (err) {
      this.logger.error(
        `duplicate resolution fan-out failed for ${evt.issueId}: ${(err as Error).message}`,
      );
    }
  }
}
