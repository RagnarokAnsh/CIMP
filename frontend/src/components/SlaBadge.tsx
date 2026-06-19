import { AlertTriangle, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import type { SlaState } from '@/api/types';

// Surfaces SLA state for live issues. Only at-risk and breached render — on-track
// and terminal (null) issues show nothing, so the eye goes to what needs action.
// Always pairs an icon + label with color (never color alone).
export function SlaBadge({
  slaState, dueAt, className,
}: {
  slaState: SlaState;
  dueAt?: string;
  className?: string;
}) {
  if (slaState !== 'at_risk' && slaState !== 'breached') return null;

  const due = dueAt ? new Date(dueAt) : null;
  const title = due ? `Due ${due.toLocaleString()}` : undefined;

  if (slaState === 'breached') {
    return (
      <Badge
        variant="outline"
        title={title}
        className={cn(
          'gap-1 font-medium',
          'bg-red-100 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/20',
          className,
        )}
      >
        <AlertTriangle className="size-3" aria-hidden /> Overdue
      </Badge>
    );
  }

  return (
    <Badge
      variant="outline"
      title={title}
      className={cn(
        'gap-1 font-medium',
        'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/20',
        className,
      )}
    >
      <Clock className="size-3" aria-hidden /> Due soon
    </Badge>
  );
}
