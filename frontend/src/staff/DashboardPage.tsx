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
import { useDocumentTitle } from '@/lib/use-document-title';

export function DashboardPage() {
  useDocumentTitle('Dashboard');
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

      {/* Two rows of four.
          This was four cards above five, so the card edges of two stacked rows
          never lined up, and below xl the five-card row left an orphan alone on
          its last line — the exact problem moving CSAT down here was meant to
          fix. Eight cards divide cleanly at every breakpoint (4/4 at xl, 2/2/2/2
          at sm) and both rows now share a column count with each other and with
          the platform report, which already had this shape.

          The ninth card was "SLA on track", and it went rather than being
          rearranged: the SLA health panel below shows the same number broken
          into on-track / due-soon / overdue, so the KPI restated a figure the
          reader gets in more detail two rows down.

          Row one is 14-day volume, row two is 30-day quality. */}
      <Reveal className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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
        <KpiCard
          label="Resolution rate"
          icon={<CheckCircle2 className="h-5 w-5" />}
          value={`${pct(resolvedOrClosed, all)}%`}
          sub={`${resolvedOrClosed} of ${all} closed out`}
          progress={pct(resolvedOrClosed, all)}
          progressClass={METER_TONE.good}
        />
        <KpiCard
          label="Deflected"
          icon={<ShieldCheck className="h-5 w-5" />}
          value={<AnimatedNumber value={data.ops.deflected} className="tabular-nums" />}
          sub={data.ops.deflectionRate !== null
            ? `${data.ops.deflectionRate}% of would-be reports subscribed instead`
            : 'duplicate reports avoided (30d)'}
        />
      </Reveal>

      <Reveal className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
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

// Mirrors the real page exactly: hero, two KPI rows of four, the chart pair,
// four breakdowns. It was missing a whole KPI row, so the layout jumped
// downward as soon as the data landed — the shift a skeleton exists to prevent.
function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-44 rounded-2xl sm:h-40" />
      {Array.from({ length: 2 }).map((_, row) => (
        <div key={row} className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
        </div>
      ))}
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
