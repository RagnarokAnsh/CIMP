import {
  ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  DataSource, In, IsNull, Repository,
} from 'typeorm';
import { ActorType, CommentVisibility, Role } from '../common/enums';
import { Comment, Issue, UserPlatformRole } from '../entities';
import { AuthenticatedStaff } from '../auth/auth.types';
import { ScopeService } from '../authz/scope.service';
import { AuditService } from '../audit/audit.service';
import { CommentAddedEvent, IssueEvents } from '../events/issue-events';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

const ALL_STAFF_ROLES: Role[] = [Role.FOCAL_POINT, Role.DEVELOPER, Role.ADMIN];

@Injectable()
export class CommentsService {
  constructor(
    @InjectRepository(Comment) private readonly comments: Repository<Comment>,
    @InjectRepository(Issue) private readonly issues: Repository<Issue>,
    @InjectRepository(UserPlatformRole) private readonly roles: Repository<UserPlatformRole>,
    private readonly scope: ScopeService,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly events: EventEmitter2,
  ) {}

  // Which of `staffIds` actually hold a role on `platformId` (or a global grant).
  // Used to drop cross-tenant @mentions before they reach notifications/SSE.
  private async platformMemberIds(staffIds: string[], platformId: string): Promise<Set<string>> {
    if (staffIds.length === 0) return new Set();
    const grants = await this.roles.find({
      where: [
        { staffUser: { id: In(staffIds) }, platform: { id: platformId } },
        { staffUser: { id: In(staffIds) }, platform: IsNull() },
      ],
      relations: { staffUser: true },
    });
    return new Set(grants.map((g) => g.staffUser?.id).filter(Boolean) as string[]);
  }

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

    // Drop @mentions that aren't the author AND aren't members of this issue's
    // platform, so a client-supplied id for another tenant's staff can never
    // leak the issue (via the bell) or stream it (via SSE targetStaffIds).
    const requested = [...new Set(dto.mentionStaffIds ?? [])].filter((id) => id !== staff.id);
    const members = await this.platformMemberIds(requested, issue.platform.id);
    const mentionStaffIds = requested.filter((id) => members.has(id));

    this.events.emit(IssueEvents.COMMENT_ADDED, {
      issueId,
      platformId: issue.platform.id,
      commentId,
      reporterVisible,
      actorStaffId: staff.id,
      mentionStaffIds,
    } satisfies CommentAddedEvent);

    return this.getOne(commentId);
  }

  async editComment(staff: AuthenticatedStaff, commentId: string, dto: UpdateCommentDto) {
    const comment = await this.comments.findOne({
      where: { id: commentId },
      relations: { author: true, issue: { platform: true } },
    });
    if (!comment) throw new NotFoundException('Comment not found');
    if (comment.author?.id !== staff.id) {
      throw new ForbiddenException('You can only edit your own comments.');
    }
    // Authorship alone is not enough: the author may have lost access to the
    // comment's platform since writing it (grant revoked/moved). This route
    // carries a comment id, so PlatformAccessGuard's issue branch never runs.
    const platformId = comment.issue?.platform?.id;
    if (platformId && !this.scope.canAccessPlatform(staff, platformId, ALL_STAFF_ROLES)) {
      throw new ForbiddenException('You no longer have access to this platform.');
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
