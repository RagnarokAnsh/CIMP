import { IssueStatus } from '../common/enums';

// The allowed status transitions (Section 8 of the build spec). Any transition
// not listed here is rejected with 422 by the issue service.
export const STATUS_TRANSITIONS: Record<IssueStatus, IssueStatus[]> = {
  [IssueStatus.NEW]: [IssueStatus.IN_PROGRESS, IssueStatus.ON_HOLD, IssueStatus.CLOSED],
  [IssueStatus.IN_PROGRESS]: [IssueStatus.ON_HOLD, IssueStatus.RESOLVED],
  [IssueStatus.ON_HOLD]: [IssueStatus.IN_PROGRESS, IssueStatus.CLOSED],
  [IssueStatus.RESOLVED]: [IssueStatus.CLOSED, IssueStatus.REOPENED],
  [IssueStatus.CLOSED]: [IssueStatus.REOPENED],
  [IssueStatus.REOPENED]: [IssueStatus.IN_PROGRESS],
};

export function canTransition(from: IssueStatus, to: IssueStatus): boolean {
  return STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}
