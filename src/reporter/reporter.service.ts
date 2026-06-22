import {
  BadRequestException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, QueryFailedError, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import {
  CommentAddedEvent, IssueCreatedEvent, IssueEvents,
} from '../events/issue-events';
import {
  ALLOWED_MIME_TYPES, MAX_FILES, MAX_FILE_BYTES,
} from '../common/constants';
import {
  ActorType, CommentVisibility, ScanStatus,
} from '../common/enums';
import {
  Attachment, AuditEvent, Comment, Issue, Reporter, ReporterIssueView,
} from '../entities';
import { HandoffContext } from '../handoff/handoff.types';
import { StorageService } from '../storage/storage.service';
import { CreateIssueDto } from './dto/create-issue.dto';
import { ReporterCommentDto } from './dto/reporter-comment.dto';

// Attachments that have cleared (or skipped) scanning may be downloaded.
const SERVABLE_SCAN = new Set([ScanStatus.CLEAN, ScanStatus.SKIPPED]);

@Injectable()
export class ReporterService {
  constructor(
    @InjectRepository(Reporter) private readonly reporters: Repository<Reporter>,
    @InjectRepository(Issue) private readonly issues: Repository<Issue>,
    @InjectRepository(ReporterIssueView) private readonly views: Repository<ReporterIssueView>,
    @InjectRepository(Attachment) private readonly attachments: Repository<Attachment>,
    private readonly storage: StorageService,
    private readonly dataSource: DataSource,
    private readonly events: EventEmitter2,
  ) {}

  // Auto-provision (or refresh) the reporter identity from the verified token.
  private async upsertReporter(ctx: HandoffContext): Promise<Reporter> {
    let reporter = await this.reporters.findOne({
      where: { platform: { id: ctx.platformId }, portalUserId: ctx.reporter.portalUserId },
    });
    if (!reporter) {
      reporter = this.reporters.create({
        platform: { id: ctx.platformId } as any,
        portalUserId: ctx.reporter.portalUserId,
        name: ctx.reporter.name,
        email: ctx.reporter.email,
      });
    } else {
      reporter.name = ctx.reporter.name;
      reporter.email = ctx.reporter.email;
    }
    return this.reporters.save(reporter);
  }

  private validateFiles(files: Express.Multer.File[]): void {
    if (files.length > MAX_FILES) {
      throw new BadRequestException(`At most ${MAX_FILES} files may be attached.`);
    }
    for (const f of files) {
      if (f.size > MAX_FILE_BYTES) {
        throw new BadRequestException(`"${f.originalname}" exceeds the ${MAX_FILE_BYTES / (1024 * 1024)} MB limit.`);
      }
      if (!ALLOWED_MIME_TYPES.includes(f.mimetype)) {
        throw new BadRequestException(`"${f.originalname}" has an unsupported type (${f.mimetype}).`);
      }
    }
  }

  async createIssue(ctx: HandoffContext, dto: CreateIssueDto, files: Express.Multer.File[]) {
    this.validateFiles(files);
    const reporter = await this.upsertReporter(ctx);

    // Persist files to storage first (outside the transaction).
    const stored = await Promise.all(
      files.map(async (f) => ({
        ...(await this.storage.save(f.buffer, f.originalname, f.mimetype)),
        filename: f.originalname,
        contentType: f.mimetype,
        sizeBytes: f.size,
      })),
    );

    const issueId = await this.createIssueWithUniqueReference(ctx, dto, reporter, stored);

    // Notify the platform's focal points (FR-NOT-01) and trigger Jira sync,
    // decoupled from the intake request.
    this.events.emit(IssueEvents.CREATED, {
      issueId,
      platformId: ctx.platformId,
    } satisfies IssueCreatedEvent);

    return this.getIssueForReporter(ctx, issueId);
  }

  // referenceNo is uniquely indexed; on the rare generation collision Postgres
  // raises 23505. Retry with a fresh reference instead of failing intake with a
  // 500. The storage writes already happened outside the transaction, so a retry
  // simply re-inserts the same attachment rows with the same storage keys.
  private async createIssueWithUniqueReference(
    ctx: HandoffContext,
    dto: CreateIssueDto,
    reporter: Reporter,
    stored: Array<{ storageKey: string; filename: string; contentType: string; sizeBytes: number }>,
  ): Promise<string> {
    const MAX_ATTEMPTS = 5;
    for (let attempt = 1; ; attempt += 1) {
      try {
        return await this.persistIssue(ctx, dto, reporter, stored);
      } catch (e) {
        if (this.isUniqueViolation(e) && attempt < MAX_ATTEMPTS) continue;
        throw e;
      }
    }
  }

  private isUniqueViolation(e: unknown): boolean {
    return (
      e instanceof QueryFailedError &&
      (e as QueryFailedError & { driverError?: { code?: string } }).driverError?.code === '23505'
    );
  }

  private async persistIssue(
    ctx: HandoffContext,
    dto: CreateIssueDto,
    reporter: Reporter,
    stored: Array<{ storageKey: string; filename: string; contentType: string; sizeBytes: number }>,
  ): Promise<string> {
    return this.dataSource.transaction(async (em) => {
      const issue = em.create(Issue, {
        referenceNo: this.generateReference(),
        platform: { id: ctx.platformId } as any,
        reporter: { id: reporter.id } as any,
        description: dto.description,
      });
      const saved = await em.save(issue);

      if (stored.length) {
        await em.save(
          stored.map((s) =>
            em.create(Attachment, {
              issue: { id: saved.id } as any,
              storageKey: s.storageKey,
              filename: s.filename,
              contentType: s.contentType,
              sizeBytes: s.sizeBytes,
              scanStatus: ScanStatus.PENDING, // AV scan wired in Phase 2
            }),
          ),
        );
      }

      await em.save(
        em.create(AuditEvent, {
          issue: { id: saved.id } as any,
          actorType: ActorType.REPORTER,
          actorId: reporter.id,
          action: 'ISSUE_CREATED',
        }),
      );
      return saved.id;
    });
  }

  async listForReporter(ctx: HandoffContext) {
    const reporter = await this.findReporter(ctx);
    if (!reporter) return [];

    // Join only this reporter's view row per issue (the unique (reporter, issue)
    // row). The previous in-memory `find` compared `v.reporter?.id`, but the
    // reporter relation wasn't loaded — so it never matched and "new updates"
    // was always shown.
    const issues = await this.issues
      .createQueryBuilder('issue')
      .leftJoinAndSelect('issue.views', 'view', 'view.reporter_id = :reporterId', {
        reporterId: reporter.id,
      })
      .where('issue.reporter_id = :reporterId', { reporterId: reporter.id })
      .orderBy('issue.created_at', 'DESC')
      .getMany();

    return issues.map((i) => {
      const view = i.views?.[0];
      const lastViewed = view?.lastViewedAt ?? null;
      return {
        id: i.id,
        referenceNo: i.referenceNo,
        status: i.status,
        priority: i.priority,
        createdAt: i.createdAt,
        updatedAt: i.updatedAt,
        hasUpdates: !lastViewed || lastViewed < i.updatedAt,
      };
    });
  }

  async getIssueForReporter(ctx: HandoffContext, issueId: string) {
    const reporter = await this.findReporter(ctx);
    if (!reporter) throw new NotFoundException('Issue not found');

    const issue = await this.issues.findOne({
      where: { id: issueId, reporter: { id: reporter.id } },
      relations: { attachments: true, comments: true },
    });
    if (!issue) throw new NotFoundException('Issue not found');

    // Only reporter-visible comments are exposed; internal notes stay hidden.
    // The reporter's own replies are labelled "You"; staff replies "Support".
    const visibleComments = (issue.comments ?? [])
      .filter((c) => c.visibility === CommentVisibility.REPORTER_VISIBLE)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((c) => ({
        body: c.body,
        createdAt: c.createdAt,
        fromReporter: c.authorType === ActorType.REPORTER,
        author: c.authorType === ActorType.REPORTER ? (c.authorName ?? 'You') : 'Support',
      }));

    return {
      id: issue.id,
      referenceNo: issue.referenceNo,
      status: issue.status,
      priority: issue.priority,
      description: issue.description,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
      attachments: (issue.attachments ?? []).map((a) => ({
        id: a.id,
        filename: a.filename,
        contentType: a.contentType,
        sizeBytes: a.sizeBytes,
        downloadable: SERVABLE_SCAN.has(a.scanStatus),
      })),
      updates: visibleComments,
    };
  }

  // A reporter's reply: always a reporter-visible comment, authored by the
  // reporter (no StaffUser). Bumps updatedAt and notifies staff via the same
  // comment.added event the staff path uses.
  async addComment(ctx: HandoffContext, issueId: string, dto: ReporterCommentDto) {
    const reporter = await this.findReporter(ctx);
    if (!reporter) throw new NotFoundException('Issue not found');

    const issue = await this.issues.findOne({
      where: { id: issueId, reporter: { id: reporter.id } },
      relations: { platform: true },
    });
    if (!issue) throw new NotFoundException('Issue not found');

    const commentId = await this.dataSource.transaction(async (em) => {
      const comment = await em.save(
        em.create(Comment, {
          issue: { id: issueId } as any,
          author: null,
          authorType: ActorType.REPORTER,
          authorName: reporter.name,
          body: dto.body,
          visibility: CommentVisibility.REPORTER_VISIBLE,
        }),
      );
      // Bump updatedAt (without touching version) so staff see it as activity.
      await em
        .createQueryBuilder()
        .update(Issue)
        .set({ updatedAt: () => 'now()' })
        .where('id = :id', { id: issueId })
        .execute();
      await em.save(
        em.create(AuditEvent, {
          issue: { id: issueId } as any,
          actorType: ActorType.REPORTER,
          actorId: reporter.id,
          action: 'COMMENT_ADDED',
          field: 'visibility',
          newValue: CommentVisibility.REPORTER_VISIBLE,
          metadata: { commentId: comment.id, fromReporter: true },
        }),
      );
      return comment.id;
    });

    this.events.emit(IssueEvents.COMMENT_ADDED, {
      issueId,
      platformId: issue.platform.id,
      commentId,
      reporterVisible: true,
      actorStaffId: '', // authored by the reporter, not a staff member
      mentionStaffIds: [],
    } satisfies CommentAddedEvent);

    return { ok: true };
  }

  // Scoped, scan-gated attachment download for the reporter that raised the issue.
  async getAttachmentForReporter(ctx: HandoffContext, issueId: string, attachmentId: string) {
    const reporter = await this.findReporter(ctx);
    if (!reporter) throw new NotFoundException('Attachment not found');

    const attachment = await this.attachments.findOne({
      where: { id: attachmentId, issue: { id: issueId, reporter: { id: reporter.id } } },
    });
    if (!attachment) throw new NotFoundException('Attachment not found');
    if (!SERVABLE_SCAN.has(attachment.scanStatus)) {
      throw new ForbiddenException(
        `Attachment is not available (scan status: ${attachment.scanStatus}).`,
      );
    }

    return {
      buffer: await this.storage.read(attachment.storageKey),
      filename: attachment.filename,
      contentType: attachment.contentType,
    };
  }

  // Records that the reporter has seen the current state of an issue.
  async markSeen(ctx: HandoffContext, issueId: string) {
    const reporter = await this.findReporter(ctx);
    if (!reporter) throw new NotFoundException('Issue not found');

    const issue = await this.issues.findOne({
      where: { id: issueId, reporter: { id: reporter.id } },
    });
    if (!issue) throw new NotFoundException('Issue not found');

    let view = await this.views.findOne({
      where: { reporter: { id: reporter.id }, issue: { id: issue.id } },
    });
    if (!view) {
      view = this.views.create({
        reporter: { id: reporter.id } as any,
        issue: { id: issue.id } as any,
        lastViewedAt: new Date(),
      });
    } else {
      view.lastViewedAt = new Date();
    }
    await this.views.save(view);
    return { ok: true };
  }

  private async findReporter(ctx: HandoffContext): Promise<Reporter | null> {
    return this.reporters.findOne({
      where: { platform: { id: ctx.platformId }, portalUserId: ctx.reporter.portalUserId },
    });
  }

  private generateReference(): string {
    return `SUP-${randomUUID().split('-')[0].toUpperCase()}`;
  }
}
