import {
  ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, Repository } from 'typeorm';
import { ActorType, CommentVisibility } from '../common/enums';
import { Comment, Issue } from '../entities';
import { AuthenticatedStaff } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { CommentAddedEvent, IssueEvents } from '../events/issue-events';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment) private readonly comments: Repository<Comment>,
    @InjectRepository(Issue) private readonly issues: Repository<Issue>,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  async addComment(staff: AuthenticatedStaff, issueId: string, dto: CreateCommentDto) {
    const issue = await this.issues.findOne({
      where: { id: issueId },
      relations: { platform: true },
    });
    if (!issue) throw new NotFoundException('Issue not found');

    const reporterVisible = dto.visibility === CommentVisibility.REPORTER_VISIBLE;

    const commentId = await this.dataSource.transaction(async (em) => {
      const comment = await em.save(
        em.create(Comment, {
          issue: { id: issueId } as any,
          author: { id: staff.id } as any,
          body: dto.body,
          visibility: dto.visibility,
        }),
      );

      // A reporter-visible comment must surface as an unread update in the
      // reporter's "My issues" view (in-app only, OD-02). hasUpdates is derived
      // from issue.updatedAt vs lastViewedAt, so bump updatedAt — without
      // touching the version (no optimistic-lock conflict for concurrent edits).
      if (reporterVisible) {
        await em
          .createQueryBuilder()
          .update(Issue)
          .set({ updatedAt: () => 'now()' })
          .where('id = :id', { id: issueId })
          .execute();
      }

      await this.audit.record(
        {
          issueId,
          actorType: ActorType.STAFF,
          actorId: staff.id,
          action: 'COMMENT_ADDED',
          field: 'visibility',
          newValue: dto.visibility,
          metadata: { commentId: comment.id },
        },
        em,
      );
      return comment.id;
    });

    this.events.emit(IssueEvents.COMMENT_ADDED, {
      issueId,
      platformId: issue.platform.id,
      commentId,
      reporterVisible,
      actorStaffId: staff.id,
      // Don't notify the author of their own mention.
      mentionStaffIds: (dto.mentionStaffIds ?? []).filter((id) => id !== staff.id),
    } satisfies CommentAddedEvent);

    return this.getOne(commentId);
  }

  async editComment(staff: AuthenticatedStaff, commentId: string, dto: UpdateCommentDto) {
    const comment = await this.comments.findOne({
      where: { id: commentId },
      relations: { author: true, issue: true },
    });
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.author?.id !== staff.id) {
      throw new ForbiddenException('You can only edit your own comments.');
    }

    const oldBody = comment.body;
    comment.body = dto.body;
    comment.editedAt = new Date();

    await this.dataSource.transaction(async (em) => {
      await em.save(comment);
      await this.audit.record(
        {
          issueId: comment.issue?.id ?? null,
          actorType: ActorType.STAFF,
          actorId: staff.id,
          action: 'COMMENT_EDITED',
          field: 'body',
          oldValue: oldBody.slice(0, 255),
          newValue: dto.body.slice(0, 255),
          metadata: { commentId },
        },
        em,
      );
    });

    return this.getOne(commentId);
  }

  private async getOne(commentId: string) {
    const c = await this.comments.findOne({
      where: { id: commentId },
      relations: { author: true },
    });
    if (!c) throw new NotFoundException('Comment not found');
    return {
      id: c.id,
      body: c.body,
      visibility: c.visibility,
      author: c.author ? { id: c.author.id, name: c.author.name } : null,
      createdAt: c.createdAt,
      editedAt: c.editedAt,
    };
  }
}
