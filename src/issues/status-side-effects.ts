import { IssueStatus } from '../common/enums';
import { Issue } from '../entities';

// The timestamp/SLA bookkeeping that MUST accompany every status change,
// wherever it originates. Lives outside IssuesService so the inbound Jira
// webhook applies the exact same rules — a second, partial copy of this logic
// is how issues end up resolved-and-closed at once or reopened with a stale
// SLA clock. Mutates the entity in place; the caller saves it.
export function applyStatusSideEffects(issue: Issue, to: IssueStatus): void {
  if (to === IssueStatus.RESOLVED) {
    issue.resolvedAt = new Date();
  } else if (to === IssueStatus.CLOSED) {
    issue.closedAt = issue.closedAt ?? new Date();
  } else if (to === IssueStatus.REOPENED) {
    issue.resolvedAt = null;
    issue.closedAt = null;
    // Reopening a merged duplicate detaches it from its canonical issue —
    // someone judged it NOT the same problem after all.
    issue.duplicateOf = null;
    // L8: the SLA clock restarts on reopen — measuring from the original
    // createdAt would instantly re-breach any old issue. New cycle, new
    // breach marker.
    issue.slaStartedAt = new Date();
    issue.slaBreachedAt = null;
  }
}
