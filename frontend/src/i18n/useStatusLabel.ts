import type { IssueStatus } from '@/api/types';
import { useT } from './index';

// Localized issue-status label for the reporter portal. Pairs with
// StatusBadge's `label` prop so the portal reuses the shared badge (and its
// contrast-checked colours) rather than forking it just to change the words.
export function useStatusLabel(): (status: IssueStatus) => string {
  const { t } = useT();
  return (status) => t(`status.${status}` as const);
}
