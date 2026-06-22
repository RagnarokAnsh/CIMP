import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, IsNull, Repository } from 'typeorm';
import {
  AccountStatus, NotificationChannel, NotificationStatus, RecipientType, Role,
} from '../common/enums';
import {
  Issue, NotificationLog, StaffUser, UserPlatformRole,
} from '../entities';
import { MailService } from './mail.service';

// Sends staff emails and records every notification attempt in NotificationLog.
// Reporter-facing notifications are IN_APP only (OD-02) and are never emailed
// here — they are handled by the reporter's hasUpdates flag.
@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectRepository(NotificationLog) private readonly logs: Repository<NotificationLog>,
    @InjectRepository(UserPlatformRole) private readonly roles: Repository<UserPlatformRole>,
    @InjectRepository(StaffUser) private readonly staff: Repository<StaffUser>,
    @InjectRepository(Issue) private readonly issues: Repository<Issue>,
    private readonly mail: MailService,
  ) {}

  // FR-NOT-01: notify the focal points of an issue's platform on creation.
  async notifyFocalPointsOfNewIssue(issueId: string, platformId: string): Promise<void> {
    const issue = await this.loadIssue(issueId);
    if (!issue) return;

    // Focal points scoped to this platform (global focal points don't exist).
    const grants = await this.roles.find({
      where: { role: Role.FOCAL_POINT, platform: { id: platformId } },
      relations: { staffUser: true },
    });
    const recipients = this.activeRecipients(grants.map((g) => g.staffUser));

    const url = `${this.mail.appUrl()}/staff/issues/${issueId}`;
    for (const r of recipients) {
      await this.dispatch(issueId, r, 'issue.created', {
        subject: `[${issue.platform.key}] New issue ${issue.referenceNo}`,
        text:
          `A new issue was reported on ${issue.platform.name}.\n\n` +
          `Reference: ${issue.referenceNo}\nPriority: ${issue.priority}\n\n` +
          `${issue.description.slice(0, 500)}\n\nOpen it: ${url}`,
      });
    }
  }

  // FR-NOT-02: notify the assignee when an issue is assigned to them.
  async notifyAssignee(issueId: string, assigneeId: string | null): Promise<void> {
    if (!assigneeId) return;
    const issue = await this.loadIssue(issueId);
    if (!issue) return;
    const assignee = await this.staff.findOne({ where: { id: assigneeId } });
    const [recipient] = this.activeRecipients(assignee ? [assignee] : []);
    if (!recipient) return;

    const url = `${this.mail.appUrl()}/staff/issues/${issueId}`;
    await this.dispatch(issueId, recipient, 'issue.assigned', {
      subject: `[${issue.platform.key}] Assigned to you: ${issue.referenceNo}`,
      text:
        `Issue ${issue.referenceNo} on ${issue.platform.name} was assigned to you.\n\n` +
        `Priority: ${issue.priority}\nStatus: ${issue.status}\n\nOpen it: ${url}`,
    });
  }

  // Notify the assignee and the platform's focal points when an issue's status
  // changes (e.g. RESOLVED/REOPENED). The actor is never notified of their own
  // action. Email + NotificationLog so it also appears in the bell.
  async notifyStatusChange(
    issueId: string,
    from: string,
    to: string,
    actorStaffId: string,
  ): Promise<void> {
    const issue = await this.issues.findOne({
      where: { id: issueId },
      relations: { platform: true, assignee: true },
    });
    if (!issue) return;

    const focalGrants = await this.roles.find({
      where: { role: Role.FOCAL_POINT, platform: { id: issue.platform.id } },
      relations: { staffUser: true },
    });
    const candidates = [issue.assignee, ...focalGrants.map((g) => g.staffUser)];
    const recipients = this.activeRecipients(candidates).filter((r) => r.id !== actorStaffId);
    if (recipients.length === 0) return;

    const url = `${this.mail.appUrl()}/staff/issues/${issueId}`;
    for (const r of recipients) {
      await this.dispatch(issueId, r, 'issue.status_changed', {
        subject: `[${issue.platform.key}] ${issue.referenceNo} → ${to}`,
        text:
          `Issue ${issue.referenceNo} on ${issue.platform.name} moved from ${from} to ${to}.\n\n` +
          `Open it: ${url}`,
      });
    }
  }

  // Notify the assignee and focal points when a reporter replies on their issue.
  async notifyReporterReply(issueId: string): Promise<void> {
    const issue = await this.issues.findOne({
      where: { id: issueId },
      relations: { platform: true, assignee: true },
    });
    if (!issue) return;

    const focalGrants = await this.roles.find({
      where: { role: Role.FOCAL_POINT, platform: { id: issue.platform.id } },
      relations: { staffUser: true },
    });
    const recipients = this.activeRecipients([issue.assignee, ...focalGrants.map((g) => g.staffUser)]);
    if (recipients.length === 0) return;

    const url = `${this.mail.appUrl()}/staff/issues/${issueId}`;
    for (const r of recipients) {
      await this.dispatch(issueId, r, 'comment.reporter_reply', {
        subject: `[${issue.platform.key}] Reporter replied on ${issue.referenceNo}`,
        text:
          `The reporter added a reply on ${issue.referenceNo} (${issue.platform.name}).\n\n` +
          `Open it: ${url}`,
      });
    }
  }

  // FR-NOT (collaboration): record an in-app notification for each staff member
  // @mentioned in a comment. In-app only — no email — so it surfaces in the bell.
  async notifyMentions(issueId: string, staffIds: string[], actorStaffId: string): Promise<void> {
    const targets = [...new Set(staffIds)].filter((id) => id && id !== actorStaffId);
    if (targets.length === 0) return;

    // Only notify staff that still exist and are active.
    const active = await this.staff.find({ where: { id: In(targets) } });
    const rows = active
      .filter((u) => u.status === AccountStatus.ACTIVE)
      .map((u) =>
        this.logs.create({
          issue: { id: issueId } as any,
          recipientType: RecipientType.STAFF,
          recipientRef: u.id,
          trigger: 'comment.mention',
          channel: NotificationChannel.IN_APP,
          status: NotificationStatus.SENT,
        }),
      );
    if (rows.length) await this.logs.save(rows);
  }

  // The current staff member's recent notifications (most recent first) plus the
  // count still unread — feeds the top-bar bell.
  async listForStaff(staffId: string, limit = 20) {
    const rows = await this.logs.find({
      where: { recipientType: RecipientType.STAFF, recipientRef: staffId },
      relations: { issue: { platform: true } },
      order: { createdAt: 'DESC' },
      take: limit,
    });
    const unread = await this.logs.count({
      where: {
        recipientType: RecipientType.STAFF,
        recipientRef: staffId,
        readAt: IsNull(),
      },
    });
    return {
      unread,
      items: rows.map((r) => ({
        id: r.id,
        trigger: r.trigger,
        createdAt: r.createdAt,
        readAt: r.readAt,
        issue: r.issue
          ? { id: r.issue.id, referenceNo: r.issue.referenceNo, platformKey: r.issue.platform?.key ?? null }
          : null,
      })),
    };
  }

  // Mark all of this staff member's notifications read (clears the unread dot).
  async markAllRead(staffId: string): Promise<{ unread: number }> {
    await this.logs.update(
      { recipientType: RecipientType.STAFF, recipientRef: staffId, readAt: IsNull() },
      { readAt: new Date() },
    );
    return { unread: 0 };
  }

  private async dispatch(
    issueId: string,
    recipient: StaffUser,
    trigger: string,
    msg: { subject: string; text: string },
  ): Promise<void> {
    let status = NotificationStatus.PENDING;
    try {
      await this.mail.send({ to: recipient.email, ...msg });
      status = NotificationStatus.SENT;
    } catch (err) {
      status = NotificationStatus.FAILED;
      this.logger.error(`Failed to email ${recipient.email}: ${(err as Error).message}`);
    }
    await this.logs.save(
      this.logs.create({
        issue: { id: issueId } as any,
        recipientType: RecipientType.STAFF,
        recipientRef: recipient.id,
        trigger,
        channel: NotificationChannel.EMAIL,
        status,
      }),
    );
  }

  private activeRecipients(users: (StaffUser | undefined | null)[]): StaffUser[] {
    const seen = new Set<string>();
    const out: StaffUser[] = [];
    for (const u of users) {
      if (u && u.email && !seen.has(u.id)) {
        seen.add(u.id);
        out.push(u);
      }
    }
    return out;
  }

  private loadIssue(issueId: string): Promise<Issue | null> {
    return this.issues.findOne({ where: { id: issueId }, relations: { platform: true } });
  }
}
