import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { PRIORITY_META, STATUS_META } from '@/lib/issue-meta';
import type { IssueStatus, Priority } from '@/api/types';

export function StatusBadge({
  status,
  className,
  label,
}: {
  status: IssueStatus;
  className?: string;
  /**
   * Overrides the English label from STATUS_META. Used by the localized
   * reporter portal so both surfaces keep one badge (and one set of
   * contrast-checked colours) instead of forking the component.
   */
  label?: string;
}) {
  const meta = STATUS_META[status];
  return (
    <Badge variant="outline" className={cn('gap-1.5 font-medium', meta.className, className)}>
      <span className={cn('size-1.5 rounded-full', meta.dot)} aria-hidden />
      {label ?? meta.label}
    </Badge>
  );
}

export function PriorityBadge({
  priority,
  className,
  label,
}: {
  priority: Priority;
  className?: string;
  /**
   * Overrides the English label from PRIORITY_META, exactly as StatusBadge
   * does. StatusBadge was given this so the localized reporter portal could
   * reuse the shared badge; PriorityBadge — sitting in the very next table
   * cell — never got it, so every locale read a translated status beside an
   * English "Critical".
   */
  label?: string;
}) {
  const meta = PRIORITY_META[priority];
  const Icon = meta.icon;
  return (
    <Badge variant="outline" className={cn('gap-1 font-medium', meta.className, className)}>
      <Icon className="size-3" aria-hidden />
      {label ?? meta.label}
    </Badge>
  );
}
