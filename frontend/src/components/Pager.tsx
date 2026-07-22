import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * The one paginator.
 *
 * Every paged table uses this. It previously lived inside IssuesListPage while
 * the audit log hand-rolled its own — "Page 2 of 3" with text Previous/Next
 * buttons — so the two drifted in both capability and appearance, and neither
 * said how many records existed.
 *
 * `compact` drops the numbered page buttons for narrow columns (the issues
 * split-view list), keeping the range summary and the arrows.
 */
export function Pager({
  page, totalPages, total, pageSize, onPage, compact,
}: {
  page: number;
  totalPages: number;
  /** Row count across all pages — "Page 2 of 3" alone never says how many. */
  total: number;
  pageSize: number;
  onPage: (p: number) => void;
  compact?: boolean;
}) {
  if (totalPages <= 1) return null;
  const first = (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground tabular-nums">
        {compact ? (
          <>{first}–{last} of {total.toLocaleString()}</>
        ) : (
          <>
            Showing <span className="font-medium text-foreground">{first}–{last}</span>
            {' of '}<span className="font-medium text-foreground">{total.toLocaleString()}</span>
            {' · page '}{page} of {totalPages}
          </>
        )}
      </span>
      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="icon-sm"
          disabled={page <= 1}
          onClick={() => onPage(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {!compact && pageRange(page, totalPages).map((p, i) =>
          p === '…' ? (
            <span key={`e${i}`} className="px-1 text-xs text-muted-foreground">…</span>
          ) : (
            <Button
              key={p}
              variant={p === page ? 'default' : 'ghost'}
              size="icon-sm"
              className="min-w-8 tabular-nums"
              aria-current={p === page ? 'page' : undefined}
              aria-label={`Page ${p}`}
              onClick={() => onPage(p)}
            >
              {p}
            </Button>
          ),
        )}
        <Button
          variant="outline"
          size="icon-sm"
          disabled={page >= totalPages}
          onClick={() => onPage(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// First, last, and a window around the current page, elided with ellipses.
function pageRange(page: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | '…')[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(total - 1, page + 1);
  if (start > 2) out.push('…');
  for (let p = start; p <= end; p += 1) out.push(p);
  if (end < total - 1) out.push('…');
  out.push(total);
  return out;
}
