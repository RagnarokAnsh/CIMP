import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, CheckCircle2, CircleDot, Clock, FolderKanban, Gauge, Inbox,
  ListTodo, ShieldCheck, TrendingDown, TrendingUp,
} from 'lucide-react';
import { staffApi } from '@/api/client';
import type { DashboardSummary, IssueStatus } from '@/api/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { AnimatedNumber } from '@/components/AnimatedNumber';
import { Reveal } from '@/components/Reveal';
import { TrendChart } from './TrendChart';
import { STATUS_META } from '@/lib/issue-meta';
import { initials } from '@/lib/format';
import { cn } from '@/lib/utils';

type BreakdownKind = 'status' | 'priority' | 'assignee' | 'plain';

const PRIORITY_BAR: Record<string, string> = {
  LOW: 'bg-slate-400', MEDIUM: 'bg-blue-500', HIGH: 'bg-orange-500', CRITICAL: 'bg-red-500',
};

const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0);

export function DashboardPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['staff', 'dashboard'],
    queryFn: async () => (await staffApi.get<DashboardSummary>('/staff/dashboard')).data,
  });

  if (isLoading) return <DashboardSkeleton />;
  if (isError || !data) {
    return <Alert variant="destructive"><AlertDescription>Could not load the dashboard.</AlertDescription></Alert>;
  }

  // Derived operational metrics — all from the existing summary payload.
  const { all, open, resolvedOrClosed } = data.totals;
  const { overdue, atRisk } = data.sla;
  const onTrack = Math.max(0, open - overdue - atRisk);
  const created14 = data.trend.created.reduce((s, d) => s + d.count, 0);
  const resolved14 = data.trend.resolved.reduce((s, d) => s + d.count, 0);
  const net = created14 - resolved14; // > 0 → backlog growing

  return (
    <div className="space-y-6">
      {/* Brand-gradient hero — the one place the indigo→violet gradient carries a
          full surface (DESIGN.md: hero surfaces only). */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-brand p-6 text-white shadow-lg sm:p-8">
        <div className="relative z-10 flex flex-col gap-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
              <p className="mt-1 text-sm text-white/80">An overview of issues across your scope.</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-white/90 ring-1 ring-white/15">
              {net > 0
                ? <><TrendingUp className="h-3.5 w-3.5" /> Backlog up {net} over 14 days</>
                : <><TrendingDown className="h-3.5 w-3.5" /> Backlog down {Math.abs(net)} over 14 days</>}
            </span>
          </div>
          <Reveal className="grid gap-4 sm:grid-cols-3">
            <HeroStat label="All issues" value={all} icon={<FolderKanban className="h-5 w-5" />} />
            <HeroStat
              label="Open"
              value={open}
              icon={<CircleDot className="h-5 w-5" />}
              context={`${pct(open, all)}% of all issues`}
            />
            <HeroStat
              label="Resolved / closed"
              value={resolvedOrClosed}
              icon={<ListTodo className="h-5 w-5" />}
              context={`${pct(resolvedOrClosed, all)}% resolution rate`}
            />
          </Reveal>
        </div>
        <div className="pointer-events-none absolute -right-16 -top-20 size-60 rounded-full bg-white/10 blur-2xl" aria-hidden />
      </section>

      {/* Operational KPIs. */}
      <Reveal className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Resolution rate"
          icon={<CheckCircle2 className="h-5 w-5" />}
          value={`${pct(resolvedOrClosed, all)}%`}
          sub={`${resolvedOrClosed} of ${all} closed out`}
          progress={pct(resolvedOrClosed, all)}
          progressClass="bg-emerald-500"
        />
        <KpiCard
          label="SLA on track"
          icon={<ShieldCheck className="h-5 w-5" />}
          value={`${pct(onTrack, open)}%`}
          sub={`${onTrack} of ${open} open within target`}
          progress={pct(onTrack, open)}
          progressClass={overdue > 0 ? 'bg-amber-500' : 'bg-emerald-500'}
        />
        <KpiCard
          label="Created"
          icon={<Inbox className="h-5 w-5" />}
          value={<AnimatedNumber value={created14} className="tabular-nums" />}
          sub="new in the last 14 days"
          chip={
            <span className={cn(
              'inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium',
              net > 0
                ? 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300'
                : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/15 dark:text-emerald-300',
            )}>
              {net > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {net > 0 ? `+${net}` : net} net
            </span>
          }
        />
        <KpiCard
          label="Resolved"
          icon={<Gauge className="h-5 w-5" />}
          value={<AnimatedNumber value={resolved14} className="tabular-nums" />}
          sub="closed out in the last 14 days"
        />
      </Reveal>

      {/* Trend + SLA health. */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              Created vs resolved
              <span className="ml-1 text-xs font-normal text-muted-foreground">last 14 days</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TrendChart trend={data.trend} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldCheck className="h-4 w-4 text-muted-foreground" /> SLA health
              <span className="ml-1 text-xs font-normal text-muted-foreground">open issues</span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SlaHealth open={open} onTrack={onTrack} atRisk={atRisk} overdue={overdue} />
          </CardContent>
        </Card>
      </div>

      {/* Breakdowns. */}
      <Reveal className="grid gap-4 md:grid-cols-2">
        <Breakdown title="By status" rows={data.byStatus} kind="status" />
        <Breakdown title="By priority" rows={data.byPriority} kind="priority" />
        <Breakdown title="By platform" rows={data.byPlatform} />
        <Breakdown title="By assignee" rows={data.byAssignee.map((a) => ({ key: a.name, count: a.count }))} kind="assignee" />
      </Reveal>
    </div>
  );
}

function HeroStat({
  label, value, icon, context,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  context?: string;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
      <div className="min-w-0">
        <p className="text-sm text-white/80">{label}</p>
        <AnimatedNumber value={value} className="mt-1 block text-3xl font-semibold tabular-nums" />
        {context && <p className="mt-1 truncate text-xs text-white/70">{context}</p>}
      </div>
      <div className="rounded-md bg-white/15 p-2.5">{icon}</div>
    </div>
  );
}

function KpiCard({
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
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
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

function SlaHealth({
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
        <CheckCircle2 className="h-6 w-6 text-emerald-500" />
        No open issues — nothing at risk.
      </div>
    );
  }
  const segs = [
    { label: 'On track', value: onTrack, bar: 'bg-emerald-500', icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" /> },
    { label: 'Due soon', value: atRisk, bar: 'bg-amber-500', icon: <Clock className="h-4 w-4 text-amber-500" /> },
    { label: 'Overdue', value: overdue, bar: 'bg-red-500', icon: <AlertTriangle className="h-4 w-4 text-red-500" /> },
  ];
  return (
    <div className="space-y-4">
      {/* Segmented meter. */}
      <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
        {segs.map((s) => s.value > 0 && (
          <div key={s.label} className={s.bar} style={{ width: `${pct(s.value, open)}%` }} title={`${s.label}: ${s.value}`} />
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

function Breakdown({
  title, rows, kind = 'plain',
}: {
  title: string;
  rows: { key: string; count: number }[];
  kind?: BreakdownKind;
}) {
  const total = rows.reduce((s, r) => s + r.count, 0);
  const max = Math.max(1, ...rows.map((r) => r.count));
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
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={cn('h-full rounded-full transition-[width] duration-500', barFor(r.key))}
                    style={{ width: `${(r.count / max) * 100}%` }}
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

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-44 rounded-2xl sm:h-40" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Skeleton className="h-72 lg:col-span-2" />
        <Skeleton className="h-72" />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-44" />)}
      </div>
    </div>
  );
}
