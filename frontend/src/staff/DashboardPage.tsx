import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, CheckCircle2, CircleDot, Clock, FolderKanban, Gauge, Inbox,
  ListTodo, ShieldCheck, ThumbsUp, TrendingDown, TrendingUp,
} from 'lucide-react';
import { staffApi } from '@/api/client';
import type { DashboardSummary } from '@/api/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AnimatedNumber } from '@/components/AnimatedNumber';
import { Reveal } from '@/components/Reveal';
import { TrendChart } from './TrendChart';
import {
  Breakdown, HeroStat, KpiCard, SlaHealth, TrendChip,
} from './dashboard-widgets';
import { METER_TONE, meterTone } from '@/lib/issue-meta';
import { hoursFmt, pct } from '@/lib/format';

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
              <p className="mt-1 text-sm text-white">An overview of issues across your scope.</p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white ring-1 ring-white/25">
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
          progressClass={METER_TONE.good}
        />
        <KpiCard
          label="SLA on track"
          icon={<ShieldCheck className="h-5 w-5" />}
          value={`${pct(onTrack, open)}%`}
          sub={`${onTrack} of ${open} open within target`}
          progress={pct(onTrack, open)}
          progressClass={meterTone(overdue > 0)}
        />
        <KpiCard
          label="Created"
          icon={<Inbox className="h-5 w-5" />}
          value={<AnimatedNumber value={created14} className="tabular-nums" />}
          sub="new in the last 14 days"
          chip={<TrendChip net={net} />}
        />
        <KpiCard
          label="Resolved"
          icon={<Gauge className="h-5 w-5" />}
          value={<AnimatedNumber value={resolved14} className="tabular-nums" />}
          sub="closed out in the last 14 days"
        />
      </Reveal>

      {/* Operational quality (last 30 days). CSAT lives here rather than in the
          volume row above: it is a 30-day quality measure like the rest, and as
          a 5th card up there it sat alone on its own line. */}
      <Reveal className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          label="First response"
          icon={<Clock className="h-5 w-5" />}
          value={hoursFmt(data.ops.ttfrHours.p50)}
          sub={data.ops.ttfrHours.p90 !== null ? `median · p90 ${hoursFmt(data.ops.ttfrHours.p90)}` : 'median, last 30 days'}
        />
        <KpiCard
          label="Resolution time"
          icon={<CheckCircle2 className="h-5 w-5" />}
          value={hoursFmt(data.ops.resolutionHours.p50)}
          sub={data.ops.resolutionHours.p90 !== null ? `median · p90 ${hoursFmt(data.ops.resolutionHours.p90)}` : 'median, last 30 days'}
        />
        <KpiCard
          label="Reopen rate"
          icon={<AlertTriangle className="h-5 w-5" />}
          value={data.ops.reopenRate === null ? '—' : `${data.ops.reopenRate}%`}
          sub="of resolutions reopened (30d)"
          progress={data.ops.reopenRate ?? 0}
          progressClass={meterTone(data.ops.reopenRate !== null && data.ops.reopenRate > 20)}
        />
        <KpiCard
          label="Deflected"
          icon={<ShieldCheck className="h-5 w-5" />}
          value={<AnimatedNumber value={data.ops.deflected} className="tabular-nums" />}
          sub={data.ops.deflectionRate !== null
            ? `${data.ops.deflectionRate}% of would-be reports subscribed instead`
            : 'duplicate reports avoided (30d)'}
        />
        <KpiCard
          label="CSAT (30d)"
          icon={<ThumbsUp className="h-5 w-5" />}
          value={data.csat.positiveRate === null ? '—' : `${data.csat.positiveRate}%`}
          sub={data.csat.count > 0
            ? `${data.csat.count} rating${data.csat.count === 1 ? '' : 's'} from reporters`
            : 'no reporter ratings yet'}
          progress={data.csat.positiveRate ?? 0}
          progressClass={meterTone(data.csat.positiveRate !== null && data.csat.positiveRate < 60)}
        />
      </Reveal>

      {/* Trend + SLA health.
          min-w-0: grid items default to min-width:auto, so the recharts
          container refused to shrink below its intrinsic width and pushed the
          whole page into horizontal scroll on a phone (477px card in a 390px
          viewport). */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="min-w-0 lg:col-span-2">
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

        <Card className="min-w-0">
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
