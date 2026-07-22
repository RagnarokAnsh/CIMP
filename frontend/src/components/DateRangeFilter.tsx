import { CalendarDays, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

/** `YYYY-MM-DD` in the viewer's own timezone — these filters read as calendar
 *  days, so UTC would shift the boundary for anyone west of Greenwich. */
function localDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return localDay(d);
}

const PRESETS: { label: string; from: () => string; to: () => string }[] = [
  { label: 'Last 7 days', from: () => daysAgo(6), to: () => localDay(new Date()) },
  { label: 'Last 30 days', from: () => daysAgo(29), to: () => localDay(new Date()) },
  { label: 'Last 90 days', from: () => daysAgo(89), to: () => localDay(new Date()) },
  {
    label: 'This month',
    from: () => { const d = new Date(); return localDay(new Date(d.getFullYear(), d.getMonth(), 1)); },
    to: () => localDay(new Date()),
  },
];

function pretty(day: string): string {
  const d = new Date(`${day}T00:00:00`);
  if (Number.isNaN(d.getTime())) return day;
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

/**
 * Created-date range filter.
 *
 * Replaces two bare `<input type="date">` controls, which rendered the browser's
 * own widget — the one place in the workspace that ignored the design system,
 * and which showed a raw `dd-mm-yyyy` mask that read as an error state. The
 * trigger now summarises the active range, and the common cases are one click
 * instead of two date entries.
 */
export function DateRangeFilter({
  from, to, onChange, className,
}: {
  from: string;
  to: string;
  onChange: (range: { from: string; to: string }) => void;
  className?: string;
}) {
  const active = Boolean(from || to);

  const label = !active ? 'Any date'
    : from && to ? `${pretty(from)} – ${pretty(to)}`
      : from ? `From ${pretty(from)}`
        : `Until ${pretty(to)}`;

  // A preset counts as selected only when both ends match, so a hand-edited
  // range doesn't keep highlighting the preset it started from.
  const activePreset = PRESETS.find((p) => p.from() === from && p.to() === to)?.label;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn('justify-start gap-2 font-normal', active && 'border-ring/50', className)}
        >
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <span className={cn(!active && 'text-muted-foreground')}>{label}</span>
          {active && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Clear date filter"
              className="ml-auto -mr-1 grid size-5 place-items-center rounded text-muted-foreground hover:bg-accent hover:text-foreground"
              onClick={(e) => { e.preventDefault(); e.stopPropagation(); onChange({ from: '', to: '' }); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault(); e.stopPropagation(); onChange({ from: '', to: '' });
                }
              }}
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
        </Button>
      </PopoverTrigger>

      {/* Wide enough that the two native date fields still show their full
          `dd-mm-yyyy` mask plus the picker icon — at w-72 they clipped. */}
      <PopoverContent align="start" className="w-[22rem] space-y-3">
        <div className="grid grid-cols-2 gap-1.5">
          {PRESETS.map((p) => (
            <Button
              key={p.label}
              type="button"
              size="sm"
              variant={activePreset === p.label ? 'secondary' : 'ghost'}
              className="justify-start font-normal"
              onClick={() => onChange({ from: p.from(), to: p.to() })}
            >
              {p.label}
            </Button>
          ))}
        </div>

        <div className="space-y-2 border-t border-border pt-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label htmlFor="range-from" className="text-xs text-muted-foreground">From</Label>
              <Input
                id="range-from"
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => onChange({ from: e.target.value, to })}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="range-to" className="text-xs text-muted-foreground">To</Label>
              <Input
                id="range-to"
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => onChange({ from, to: e.target.value })}
              />
            </div>
          </div>
          {active && (
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="w-full text-muted-foreground"
              onClick={() => onChange({ from: '', to: '' })}
            >
              Clear
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
