import { AlertTriangle, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { BADGE_TONE } from '@/lib/issue-meta';
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

  // Shared tones rather than a hand-copied recipe: this badge previously
  // duplicated PRIORITY_META.CRITICAL's exact classes, so the two could drift.
  if (slaState === 'breached') {
    return (
      <Badge variant="outline" title={title} className={cn('gap-1 font-medium', BADGE_TONE.danger, className)}>
        <AlertTriangle className="size-3" aria-hidden /> Overdue
      </Badge>
    );
  }

  return (
    <Badge variant="outline" title={title} className={cn('gap-1 font-medium', BADGE_TONE.warning, className)}>
      <Clock className="size-3" aria-hidden /> Due soon
    </Badge>
  );
}
