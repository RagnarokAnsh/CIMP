import {
  ConflictException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Repository } from 'typeorm';
import { ActorType, CommentVisibility, IssueStatus } from '../common/enums';
import { Comment, CsatResponse, Issue, Reporter } from '../entities';
import { HandoffContext } from '../handoff/handoff.types';
import { CsatReceivedEvent, IssueEvents } from '../events/issue-events';
import { SubmitCsatDto } from './dto/submit-csat.dto';

// In-portal CSAT (OD-02: reporters are never emailed, so there are no email
// rating links — the widget on the reporter's issue page is the only surface).
// One response per issue; re-rating overwrites.
@Injectable()
export class CsatService {
  constructor(
    @InjectRepository(CsatResponse) private readonly responses: Repository<CsatResponse>,
    @InjectRepository(Issue) private readonly issues: Repository<Issue>,
    @InjectRepository(Reporter) private readonly reporters: Repository<Reporter>,
    @InjectRepository(Comment) private readonly comments: Repository<Comment>,
    private readonly events: EventEmitter2,
  ) {}

  async submit(ctx: HandoffContext, issueId: string, dto: SubmitCsatDto) {
    const reporter = await this.reporters.findOne({
      where: { platform: { id: ctx.platformId }, portalUserId: ctx.reporter.portalUserId },
    });
    if (!reporter) throw new NotFoundException('Issue not found');

    // Ownership check mirrors every other reporter route: someone else's issue
    // is indistinguishable from a missing one.
    const issue = await this.issues.findOne({
      where: { id: issueId, reporter: { id: reporter.id } },
      relations: { platform: true },
    });
    if (!issue) throw new NotFoundException('Issue not found');

    if (issue.status !== IssueStatus.RESOLVED && issue.status !== IssueStatus.CLOSED) {
      throw new ConflictException('You can rate an issue once it has been resolved.');
    }

    const score = dto.score === 'up' ? 1 : 0;
    const existing = await this.responses.findOne({ where: { issue: { id: issueId } } });
    const saved = await this.responses.save(
      this.responses.create({
        ...(existing ? { id: existing.id } : {}),
        issue: { id: issueId } as any,
        reporter: { id: reporter.id } as any,
        score,
        comment: dto.comment?.trim() || null,
      }),
    );

    // A negative rating flags the issue for the team (internal note only —
    // never bounced back at the reporter).
    if (score === 0 && (!existing || existing.score !== 0)) {
      await this.comments.save(
        this.comments.create({
          issue: { id: issueId } as any,
          author: null,
          authorType: ActorType.STAFF,
          body: `Reporter rated the resolution negatively${dto.comment?.trim() ? `: "${dto.comment.trim()}"` : '.'}`,
          visibility: CommentVisibility.INTERNAL,
        }),
      );
    }

    this.events.emit(IssueEvents.CSAT_RECEIVED, {
      issueId,
      platformId: issue.platform.id,
      score,
    } satisfies CsatReceivedEvent);

    return { score: saved.score, comment: saved.comment };
  }
}
