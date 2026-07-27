import { AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { AnimatedNumber } from '@/components/AnimatedNumber';
import { STATUS_META } from '@/lib/issue-meta';
import { initials, pct } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { IssueStatus } from '@/api/types';

// The presentational vocabulary of the analytics surfaces, shared by the
// cross-scope DashboardPage and the single-platform PlatformReportPage. Both
// render the same metric payload shape, so these live here rather than being
// re-invented per page (the drift that STATUS_META/format.ts already fixed for
// badges and dates). Pure helpers (pct, hoursFmt) live in lib/format.ts — this
// file exports components only, so Fast Refresh keeps working.

export function HeroStat({
  label, value, icon, context,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  context?: string;
}) {
  return (
    // Solid white, not white/80 and white/70. Over the brand gradient those
    // measured 3.20-3.84 against a 4.5 requirement in both themes — the
    // translucency was buying a softness the gradient already provided while
    // quietly failing the label and the supporting figure.
    <div className="flex items-center justify-between rounded-xl border border-white/20 bg-white/10 p-4 backdrop-blur-sm">
      <div className="min-w-0">
        <p className="text-sm text-white">{label}</p>
        <AnimatedNumber value={value} className="mt-1 block text-3xl font-semibold tabular-nums" />
        {context && <p className="mt-1 truncate text-xs text-white">{context}</p>}
      </div>
      <div className="rounded-md bg-white/15 p-2.5">{icon}</div>
    </div>
  );
}

export function KpiCard({
  label, icon, value, sub, progress, progressClass, chip,
}: {
  label: string;
  icon: React.ReactNode;
  value: React.ReactNode;
  sub: string;
  progress?: number;
  progressClass?: string;
  chip?: React.ReactNode;
}) {
  return (
    <Card className="transition-shadow hover:shadow-md">
      <CardContent className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <div className="rounded-md bg-muted p-2 text-muted-foreground">{icon}</div>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-semibold tabular-nums">{value}</span>
          {chip}
        </div>
        {progress !== undefined ? (
          <div className="space-y-1.5">
            <div
              className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
              role="progressbar"
              aria-valuenow={progress}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${label}: ${progress}%`}
            >
              <div
                className={cn('h-full rounded-full transition-[width] duration-500', progressClass)}
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground">{sub}</p>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">{sub}</p>
        )}
      </CardContent>
    </Card>
  );
}

export function SlaHealth({
  open, onTrack, atRisk, overdue,
}: {
  open: number;
  onTrack: number;
  atRisk: number;
  overdue: number;
}) {
  if (open === 0) {
    return (
      <div className="flex h-[200px] flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
        <CheckCircle2 className="h-6 w-6 text-success" />
        No open issues — nothing at risk.
      </div>
    );
  }
  const segs = [
    { label: 'On track', value: onTrack, bar: 'bg-success', icon: <CheckCircle2 className="h-4 w-4 text-success" /> },
    { label: 'Due soon', value: atRisk, bar: 'bg-warning', icon: <Clock className="h-4 w-4 text-warning" /> },
    { label: 'Overdue', value: overdue, bar: 'bg-danger', icon: <AlertTriangle className="h-4 w-4 text-danger" /> },
  ];
  return (
    <div className="space-y-4">
      {/* Segmented meter. The <ul> below is the accessible representation — it
          carries the same three numbers as text — so the bar itself is decorative
          and hidden rather than given a role it can't satisfy (a single
          progressbar can't express three segments). It also no longer relies on
          `title` for the values, which never appeared on touch or keyboard. */}
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
        {segs.map((s) => s.value > 0 && (
          <div key={s.label} className={s.bar} style={{ width: `${pct(s.value, open)}%` }} />
        ))}
      </div>
      <ul className="space-y-2.5">
        {segs.map((s) => (
          <li key={s.label} className="flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-2">{s.icon}{s.label}</span>
            <span className="text-muted-foreground tabular-nums">
              <span className="font-medium text-foreground">{s.value}</span> · {pct(s.value, open)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export type BreakdownKind = 'status' | 'priority' | 'assignee' | 'plain';

const PRIORITY_BAR: Record<string, string> = {
  LOW: 'bg-slate-400', MEDIUM: 'bg-blue-500', HIGH: 'bg-orange-500', CRITICAL: 'bg-red-500',
};

// The API returns breakdown rows in whatever order the GROUP BY produced, which
// rendered priority as "Critical, Low, Medium, High" — a severity chart in
// arbitrary order actively misleads. Status and priority get their domain order;
// free-form dimensions (platform, assignee) rank by size.
const STATUS_ORDER: IssueStatus[] = [
  'NEW', 'REOPENED', 'IN_PROGRESS', 'ON_HOLD', 'RESOLVED', 'CLOSED',
];
const PRIORITY_ORDER = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'];

function orderRows(
  rows: { key: string; count: number }[],
  kind: BreakdownKind,
): { key: string; count: number }[] {
  const domain = kind === 'status' ? (STATUS_ORDER as string[])
    : kind === 'priority' ? PRIORITY_ORDER
      : null;
  if (!domain) return [...rows].sort((a, b) => b.count - a.count);
  return [...rows].sort((a, b) => {
    const ai = domain.indexOf(a.key);
    const bi = domain.indexOf(b.key);
    // Unknown keys keep a stable place at the end rather than jumping to front.
    return (ai === -1 ? domain.length : ai) - (bi === -1 ? domain.length : bi);
  });
}

export function Breakdown({
  title, rows: rawRows, kind = 'plain',
}: {
  title: string;
  rows: { key: string; count: number }[];
  kind?: BreakdownKind;
}) {
  const rows = orderRows(rawRows, kind);
  const total = rows.reduce((s, r) => s + r.count, 0);
  const labelFor = (key: string) => {
    if (!key) return '—';
    if (kind === 'status') return STATUS_META[key as IssueStatus]?.label ?? key;
    if (kind === 'priority') return key.charAt(0) + key.slice(1).toLowerCase();
    return key;
  };
  const barFor = (key: string) => {
    if (kind === 'status') return STATUS_META[key as IssueStatus]?.dot ?? 'bg-primary/70';
    if (kind === 'priority') return PRIORITY_BAR[key] ?? 'bg-primary/70';
    return 'bg-primary/70';
  };
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="text-base">{title}</CardTitle>
        <span className="text-xs text-muted-foreground tabular-nums">{total} total</span>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data.</p>
        ) : (
          <ul className="space-y-2.5">
            {rows.map((r) => (
              <li key={r.key || '—'} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="flex min-w-0 items-center gap-2">
                    {kind === 'assignee' && (
                      <Avatar className="size-5"><AvatarFallback className="text-[9px]">{initials(r.key)}</AvatarFallback></Avatar>
                    )}
                    <span className="truncate">{labelFor(r.key)}</span>
                  </span>
                  <span className="shrink-0 text-muted-foreground tabular-nums">
                    <span className="font-medium text-foreground">{r.count}</span> · {pct(r.count, total)}%
                  </span>
                </div>
                {/* Bar length and the label beside it must share ONE
                    denominator. The bar used to be count/max (proportion of the
                    biggest row) while the label read count/total (proportion of
                    all rows) — so the top row was always a full-width bar next
                    to a label saying 38%, and every breakdown read as more
                    concentrated than it was. Part-to-whole is the honest
                    reading here, so both are count/total. */}
                <div
                  className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
                  role="progressbar"
                  aria-valuenow={pct(r.count, total)}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${labelFor(r.key)}: ${r.count} of ${total}`}
                >
                  <div
                    className={cn('h-full rounded-full transition-[width] duration-500', barFor(r.key))}
                    style={{ width: `${pct(r.count, total)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
