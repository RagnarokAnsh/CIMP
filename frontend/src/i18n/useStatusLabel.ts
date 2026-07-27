import type { IssueStatus, Priority } from '@/api/types';
import { useT } from './index';

// Localized issue-status label for the reporter portal. Pairs with
// StatusBadge's `label` prop so the portal reuses the shared badge (and its
// contrast-checked colours) rather than forking it just to change the words.
export function useStatusLabel(): (status: IssueStatus) => string {
  const { t } = useT();
  return (status) => t(`status.${status}` as const);
}

/**
 * The same for priority.
 *
 * This did not exist, so the reporter's issue list rendered a translated status
 * badge directly beside an English priority badge in the same row — the status
 * half of the pattern was built and the priority half forgotten.
 */
export function usePriorityLabel(): (priority: Priority) => string {
  const { t } = useT();
  return (priority) => t(`priority.${priority}` as const);
}
