import { AlertTriangle, Check, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { BADGE_TONE } from '@/lib/issue-meta';
import { dateTime } from '@/lib/format';
import type { SlaState } from '@/api/types';

// Surfaces SLA state for live issues. Only at-risk and breached render — on-track
// and terminal (null) issues show nothing, so the eye goes to what needs action.
// Always pairs an icon + label with color (never color alone).
export function SlaBadge({
  slaState, dueAt, className, showOnTrack = false,
}: {
  slaState: SlaState;
  dueAt?: string;
  className?: string;
  /**
   * Render a quiet marker when the issue is on track.
   *
   * Off by default (cards and lists want the eye drawn only to what needs
   * action), but ON in the issues table: under a column headed "SLA", a blank
   * cell was being asked to mean both "on track" and "no SLA policy applies",
   * which are not the same thing.
   */
  showOnTrack?: boolean;
}) {
  const title = dueAt ? `Due ${dateTime(dueAt)}` : undefined;

  if (slaState !== 'at_risk' && slaState !== 'breached') {
    if (!showOnTrack || !slaState) return null;
    return (
      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" title={title}>
        <Check className="size-3" aria-hidden /> On track
      </span>
    );
  }

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
