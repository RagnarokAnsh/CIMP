import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JiraSyncStatus, ScanStatus } from '../common/enums';
import { Attachment, Issue } from '../entities';
import {
  IssueCreatedEvent, IssueEvents, IssueStatusChangedEvent,
} from '../events/issue-events';
import { StorageService } from '../storage/storage.service';
import { JiraService } from './jira.service';

const MAX_ATTEMPTS = 3;

// Pushes newly created issues into the mapped Jira project. Never blocks intake
// (it's an async listener); records jiraSyncStatus and retries on failure.
@Injectable()
export class JiraListener {
  private readonly logger = new Logger(JiraListener.name);

  constructor(
    @InjectRepository(Issue) private readonly issues: Repository<Issue>,
    @InjectRepository(Attachment) private readonly attachments: Repository<Attachment>,
    private readonly jira: JiraService,
    private readonly storage: StorageService,
  ) {}

  @OnEvent(IssueEvents.CREATED, { async: true })
  async onIssueCreated(evt: IssueCreatedEvent): Promise<void> {
    const issue = await this.issues.findOne({
      where: { id: evt.issueId },
      relations: { platform: true },
    });
    if (!issue || !issue.platform.jiraEnabled || !issue.platform.jiraProjectKey) return;
    if (!this.jira.isConfigured()) {
      this.logger.warn('Jira enabled for platform but client not configured; skipping.');
      return;
    }
    // Idempotency: never create a second Jira issue if this one is already
    // synced or in flight (a re-delivered event would otherwise duplicate it).
    if (
      issue.jiraIssueKey ||
      issue.jiraSyncStatus === JiraSyncStatus.SYNCED ||
      issue.jiraSyncStatus === JiraSyncStatus.PENDING
    ) {
      return;
    }

    await this.issues.update(issue.id, { jiraSyncStatus: JiraSyncStatus.PENDING });

    try {
      const key = await this.withRetry(() => this.jira.createIssue(issue.platform, issue));
      await this.issues.update(issue.id, {
        jiraIssueKey: key,
        jiraSyncStatus: JiraSyncStatus.SYNCED,
      });
      await this.pushAttachments(evt.issueId, key);
    } catch (err) {
      this.logger.error(`Jira sync failed for ${issue.referenceNo}: ${(err as Error).message}`);
      await this.issues.update(issue.id, { jiraSyncStatus: JiraSyncStatus.FAILED });
    }
  }

  // Outbound status echo: when an issue with a linked Jira key transitions, add
  // a comment to the Jira issue. (Inbound webhook updates do NOT emit this event,
  // so there's no sync loop.)
  @OnEvent(IssueEvents.STATUS_CHANGED, { async: true })
  async onStatusChanged(evt: IssueStatusChangedEvent): Promise<void> {
    const issue = await this.issues.findOne({
      where: { id: evt.issueId },
      relations: { platform: true },
    });
    if (!issue?.jiraIssueKey || !issue.platform.jiraEnabled || !this.jira.isConfigured()) return;
    try {
      await this.withRetry(() =>
        this.jira.addComment(
          issue.jiraIssueKey!,
          `Status changed in the support platform: ${evt.from} → ${evt.to}.`,
        ),
      );
    } catch (err) {
      this.logger.error(`Jira status echo failed for ${issue.referenceNo}: ${(err as Error).message}`);
    }
  }

  private async pushAttachments(issueId: string, jiraKey: string): Promise<void> {
    // Only push files that passed (or skipped) scanning.
    const files = await this.attachments.find({ where: { issue: { id: issueId } } });
    for (const a of files) {
      if (a.scanStatus === ScanStatus.INFECTED || a.scanStatus === ScanStatus.PENDING) continue;
      try {
        const buffer = await this.storage.read(a.storageKey);
        await this.withRetry(() =>
          this.jira.addAttachment(jiraKey, {
            buffer,
            filename: a.filename,
            contentType: a.contentType,
          }),
        );
      } catch (err) {
        this.logger.error(`Jira attachment push failed for ${a.filename}: ${(err as Error).message}`);
      }
    }
  }

  private async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastErr: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastErr = err;
        await this.delay(attempt * 500);
      }
    }
    throw lastErr;
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
