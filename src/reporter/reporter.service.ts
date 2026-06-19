import {
  BadRequestException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { DataSource, Repository } from 'typeorm';
import { randomUUID } from 'crypto';
import { IssueCreatedEvent, IssueEvents } from '../events/issue-events';
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

@Injectable()
export class ReporterService {
  constructor(
    @InjectRepository(Reporter) private readonly reporters: Repository<Reporter>,
    @InjectRepository(Issue) private readonly issues: Repository<Issue>,
    @InjectRepository(ReporterIssueView) private readonly views: Repository<ReporterIssueView>,
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

    const issueId = await this.dataSource.transaction(async (em) => {
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

    // Notify the platform's focal points (FR-NOT-01) and trigger Jira sync,
    // decoupled from the intake request.
    this.events.emit(IssueEvents.CREATED, {
      issueId,
      platformId: ctx.platformId,
    } satisfies IssueCreatedEvent);

    return this.getIssueForReporter(ctx, issueId);
  }

  async listForReporter(ctx: HandoffContext) {
    const reporter = await this.findReporter(ctx);
    if (!reporter) return [];

    const issues = await this.issues.find({
      where: { reporter: { id: reporter.id } },
      relations: { views: true },
      order: { createdAt: 'DESC' },
    });

    return issues.map((i) => {
      const view = i.views?.find((v) => v.reporter?.id === reporter.id);
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
    const visibleComments = (issue.comments ?? [])
      .filter((c) => c.visibility === CommentVisibility.REPORTER_VISIBLE)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
      .map((c) => ({ body: c.body, createdAt: c.createdAt }));

    return {
      id: issue.id,
      referenceNo: issue.referenceNo,
      status: issue.status,
      priority: issue.priority,
      description: issue.description,
      createdAt: issue.createdAt,
      updatedAt: issue.updatedAt,
      attachments: (issue.attachments ?? []).map((a) => ({
        filename: a.filename,
        contentType: a.contentType,
        sizeBytes: a.sizeBytes,
      })),
      updates: visibleComments,
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
