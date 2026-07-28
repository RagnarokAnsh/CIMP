import {
  ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  DataSource, In, IsNull, Repository,
} from 'typeorm';
import { ActorType, CommentVisibility } from '../common/enums';
import { Comment, Issue, UserPlatformRole } from '../entities';
import { AuthenticatedStaff } from '../auth/auth.types';
import { ScopeService } from '../authz/scope.service';
import { STAFF_WRITE_ROLES } from '../authz/role-sets';
import { AuditService } from '../audit/audit.service';
import { CommentAddedEvent, IssueEvents } from '../events/issue-events';
import { CreateCommentDto } from './dto/create-comment.dto';
import { UpdateCommentDto } from './dto/update-comment.dto';

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

  // Which of `staffIds` actually hold a mentionable role on `platformId` (or a
  // global grant). Used to drop cross-tenant @mentions before they reach
  // notifications/SSE. Watcher grants don't count: watchers cannot comment, so
  // they are not mentionable (matching the /members picker).
  private async platformMemberIds(staffIds: string[], platformId: string): Promise<Set<string>> {
    if (staffIds.length === 0) return new Set();
    const mentionable = In(STAFF_WRITE_ROLES);
    const grants = await this.roles.find({
      where: [
        { staffUser: { id: In(staffIds) }, platform: { id: platformId }, role: mentionable },
        { staffUser: { id: In(staffIds) }, platform: IsNull(), role: mentionable },
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
      // from issue.updatedAt vs lastViewedAt, so bump updatedAt.
      //
      // NOTE: this DOES also bump Issue.version. TypeORM's UpdateQueryBuilder
      // appends `version = version + 1` whenever the entity has a @VersionColumn
      // that is not already in the SET clause (see UpdateQueryBuilder, the
      // metadata.versionColumn branch) — there is no way to opt out short of
      // raw SQL. So a staff member holding this issue open gets a 409 on their
      // next edit because somebody commented. That is recoverable (the client
      // refetches on 409) and erring toward a conflict is safer than silently
      // overwriting, so it stays — but the previous comment here claimed the
      // opposite, which is why this note is explicit.
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
    // comment's platform since writing it (grant revoked/moved, or downgraded
    // to read-only watcher). This route carries a comment id, so
    // PlatformAccessGuard's issue branch never runs.
    const platformId = comment.issue?.platform?.id;
    if (platformId && !this.scope.canAccessPlatform(staff, platformId, STAFF_WRITE_ROLES)) {
      throw new ForbiddenException('You no longer have write access to this platform.');
    }

    const oldBody = comment.body;
    comment.body = dto.body;
    comment.editedAt = new Date();
    // Drop the cached machine translations: they were produced from `oldBody`,
    // and the reporter's view prefers a cached translation over the source. Left
    // stale, an edit is invisible to every non-source-locale reporter — they
    // keep reading the text the author just corrected, which is worst exactly
    // when the edit matters (a wrong figure, a reversed decision). A null cache
    // means "show the original", so this degrades to the untranslated body
    // rather than to the wrong one. Re-translation happens on the next
    // COMMENT_ADDED-style pass; there is deliberately no re-emit here, because
    // TranslationListener keys off comment creation.
    comment.translations = null;
    comment.sourceLocale = null;

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
