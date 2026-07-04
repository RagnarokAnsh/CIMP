import { Injectable, Logger } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import {
  IssueCreatedEvent, IssueEvents, IssueStatusChangedEvent,
} from '../events/issue-events';
import { AutomationService } from './automation.service';

// Applies automation rules off the domain-event bus, decoupled from the request
// path (like the notifications listener). Failures are swallowed+logged so a bad
// rule never breaks intake or a status change.
@Injectable()
export class AutomationListener {
  private readonly logger = new Logger(AutomationListener.name);

  constructor(private readonly automation: AutomationService) {}

  @OnEvent(IssueEvents.CREATED)
  async onCreated(e: IssueCreatedEvent): Promise<void> {
    try {
      await this.automation.applyForCreated(e.issueId, e.platformId);
    } catch (err) {
      this.logger.error(`automation (created) failed: ${(err as Error).message}`);
    }
  }

  @OnEvent(IssueEvents.STATUS_CHANGED)
  async onStatusChanged(e: IssueStatusChangedEvent): Promise<void> {
    try {
      await this.automation.applyForStatusChanged(e.issueId, e.platformId, e.to);
    } catch (err) {
      this.logger.error(`automation (status_changed) failed: ${(err as Error).message}`);
    }
  }
}
