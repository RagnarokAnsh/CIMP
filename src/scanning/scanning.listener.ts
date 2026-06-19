import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ScanStatus } from '../common/enums';
import { Attachment } from '../entities';
import { IssueCreatedEvent, IssueEvents } from '../events/issue-events';
import { StorageService } from '../storage/storage.service';
import { ScanService } from './scan.service';

// Scans an issue's attachments after intake and updates each scanStatus.
// Decoupled from the upload request so a slow scanner never blocks reporters.
@Injectable()
export class ScanningListener {
  private readonly logger = new Logger(ScanningListener.name);

  constructor(
    @InjectRepository(Attachment) private readonly attachments: Repository<Attachment>,
    private readonly storage: StorageService,
    private readonly scanner: ScanService,
  ) {}

  @OnEvent(IssueEvents.CREATED, { async: true })
  async onIssueCreated(evt: IssueCreatedEvent): Promise<void> {
    const pending = await this.attachments.find({
      where: { issue: { id: evt.issueId }, scanStatus: ScanStatus.PENDING },
    });
    for (const a of pending) {
      try {
        const bytes = await this.storage.read(a.storageKey);
        a.scanStatus = await this.scanner.scan(bytes, a.filename);
      } catch (err) {
        this.logger.error(`Scan failed for ${a.storageKey}: ${(err as Error).message}`);
        a.scanStatus = ScanStatus.PENDING; // leave for retry; stays un-servable
      }
      await this.attachments.save(a);
    }
  }
}
