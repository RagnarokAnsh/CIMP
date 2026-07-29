import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';
import { ScanStatus } from '../common/enums';
import { Attachment } from '../entities';
import { AttachmentsScannedEvent, IssueEvents } from '../events/issue-events';
import { StorageService } from '../storage/storage.service';
import { ScanService } from './scan.service';
import { ScanDeps, scanAndPersist } from './scanning.listener';
import { envFlag } from '../common/env-flag';

// A just-uploaded file is legitimately PENDING while the intake listener scans
// it — ignore anything younger than this so the sweep never races that first
// scan and double-reads the bytes.
const PENDING_GRACE_MS = 15 * 60 * 1000;

// Bounded per tick: after a long scanner outage the backlog can be big, and
// re-reading all of it in one pass would hold the process (and clamd) hostage.
// The leftovers are picked up by the next tick.
const BATCH_SIZE = 25;

// Retry sweep for attachments stranded at PENDING. A scan that throws (clamd
// blip, restart mid-scan) leaves the row PENDING, which makes the file
// permanently undownloadable for staff *and* the reporter and invisible to the
// Jira push — nothing else ever re-scans it. Every 10 minutes this re-scans a
// bounded batch and re-emits issue.attachments_scanned for whatever became
// servable, so the Jira attachment push finally happens. Disable with
// SCAN_RETRY_ENABLED=false.
@Injectable()
export class ScanRetryService {
  private readonly logger = new Logger(ScanRetryService.name);

  constructor(
    @InjectRepository(Attachment) private readonly attachments: Repository<Attachment>,
    private readonly storage: StorageService,
    private readonly scanner: ScanService,
    private readonly events: EventEmitter2,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async sweep(): Promise<number> {
    if (!envFlag('SCAN_RETRY_ENABLED', true)) return 0;
    try {
      const stuck = await this.attachments.find({
        where: {
          scanStatus: ScanStatus.PENDING,
          createdAt: LessThan(new Date(Date.now() - PENDING_GRACE_MS)),
        },
        relations: { issue: true },
        // Newest first: a fresh failure is the one most likely to be transient
        // (and the one a user is waiting on). Without a per-row attempt counter
        // we cannot park un-scannable files, so oldest-first would let a handful
        // of permanently broken ones fill every batch and starve the rest.
        order: { createdAt: 'DESC' },
        take: BATCH_SIZE,
      });
      if (stuck.length === 0) return 0;

      // Issues that gained a servable file. Jira never received these (the push
      // filters on CLEAN/SKIPPED), so it only happens if we re-emit the same
      // event the intake scan emits.
      const rescanned = new Set<string>();
      const deps: ScanDeps = {
        storage: this.storage,
        scanner: this.scanner,
        attachments: this.attachments,
        logger: this.logger,
      };

      let rescued = 0;
      let stillPending = 0;
      for (const a of stuck) {
        const status = await scanAndPersist(a, deps);
        if (status === ScanStatus.PENDING) {
          stillPending += 1;
        } else if (status !== ScanStatus.INFECTED) {
          rescanned.add(a.issue.id);
          rescued += 1;
        }
      }

      for (const issueId of rescanned) {
        this.events.emit(IssueEvents.ATTACHMENTS_SCANNED, {
          issueId,
        } satisfies AttachmentsScannedEvent);
      }

      if (rescued > 0) this.logger.log(`Scan retry cleared ${rescued} stuck attachment(s)`);
      if (stillPending > 0) {
        // These are re-tried on every tick forever (no attempt counter on the
        // row). A count that never drops means a genuinely un-scannable file —
        // investigate the scanner or delete the attachment.
        this.logger.warn(
          `Scan retry: ${stillPending} attachment(s) still PENDING after re-scan`,
        );
      }
      return rescued;
    } catch (err) {
      this.logger.error(`Scan retry sweep failed: ${(err as Error).message}`);
      return 0;
    }
  }
}
