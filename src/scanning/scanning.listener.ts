import { Injectable, Logger } from '@nestjs/common';
import { EventEmitter2, OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScanStatus } from '../common/enums';
import { Attachment } from '../entities';
import {
  AttachmentsScannedEvent, IssueCreatedEvent, IssueEvents,
} from '../events/issue-events';
import { StorageService } from '../storage/storage.service';
import { ScanService } from './scan.service';

// Everything one scan needs, passed explicitly so the retry sweep can reuse the
// step below without depending on the listener (or on Nest DI) itself.
export interface ScanDeps {
  storage: StorageService;
  scanner: ScanService;
  attachments: Repository<Attachment>;
  logger: Logger;
}

// Read → scan → persist one attachment's verdict, returning it. Shared with
// ScanRetryService so the intake path and the retry sweep can never drift on
// what a scanner failure means.
export async function scanAndPersist(a: Attachment, deps: ScanDeps): Promise<ScanStatus> {
  try {
    const bytes = await deps.storage.read(a.storageKey);
    a.scanStatus = await deps.scanner.scan(bytes, a.filename);
  } catch (err) {
    deps.logger.error(`Scan failed for ${a.storageKey}: ${(err as Error).message}`);
    // Stays PENDING and un-servable, but ScanRetryService re-scans it once the
    // grace window passes — a clamd blip no longer strands the file forever.
    a.scanStatus = ScanStatus.PENDING;
  }
  await deps.attachments.save(a);
  return a.scanStatus;
}

// Scans an issue's attachments after intake and updates each scanStatus.
// Decoupled from the upload request so a slow scanner never blocks reporters.
@Injectable()
export class ScanningListener {
  private readonly logger = new Logger(ScanningListener.name);

  constructor(
    @InjectRepository(Attachment) private readonly attachments: Repository<Attachment>,
    private readonly storage: StorageService,
    private readonly scanner: ScanService,
    private readonly events: EventEmitter2,
  ) {}

  @OnEvent(IssueEvents.CREATED, { async: true })
  async onIssueCreated(evt: IssueCreatedEvent): Promise<void> {
    const pending = await this.attachments.find({
      where: { issue: { id: evt.issueId }, scanStatus: ScanStatus.PENDING },
    });
    if (pending.length === 0) return;

    const deps: ScanDeps = {
      storage: this.storage,
      scanner: this.scanner,
      attachments: this.attachments,
      logger: this.logger,
    };
    for (const a of pending) {
      await scanAndPersist(a, deps);
    }

    // Tell downstream sync (Jira) the files are now scanned and servable.
    this.events.emit(IssueEvents.ATTACHMENTS_SCANNED, {
      issueId: evt.issueId,
    } satisfies AttachmentsScannedEvent);
  }
}
