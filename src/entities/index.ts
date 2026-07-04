export { Platform } from './platform.entity';
export { StaffUser } from './staff-user.entity';
export { UserPlatformRole } from './user-platform-role.entity';
export { Reporter } from './reporter.entity';
export { Issue } from './issue.entity';
export { Attachment } from './attachment.entity';
export { Comment } from './comment.entity';
export { AuditEvent } from './audit-event.entity';
export { NotificationLog } from './notification-log.entity';
export { ReporterIssueView } from './reporter-issue-view.entity';
export { SavedView } from './saved-view.entity';
export { IssueLink } from './issue-link.entity';
export { Label } from './label.entity';
export { IssueLabel } from './issue-label.entity';
export { IssueWatcher } from './issue-watcher.entity';

import { Platform } from './platform.entity';
import { StaffUser } from './staff-user.entity';
import { UserPlatformRole } from './user-platform-role.entity';
import { Reporter } from './reporter.entity';
import { Issue } from './issue.entity';
import { Attachment } from './attachment.entity';
import { Comment } from './comment.entity';
import { AuditEvent } from './audit-event.entity';
import { NotificationLog } from './notification-log.entity';
import { ReporterIssueView } from './reporter-issue-view.entity';
import { SavedView } from './saved-view.entity';
import { IssueLink } from './issue-link.entity';
import { Label } from './label.entity';
import { IssueLabel } from './issue-label.entity';
import { IssueWatcher } from './issue-watcher.entity';

export const ALL_ENTITIES = [
  Platform, StaffUser, UserPlatformRole, Reporter, Issue,
  Attachment, Comment, AuditEvent, NotificationLog, ReporterIssueView,
  SavedView, IssueLink, Label, IssueLabel, IssueWatcher,
];
