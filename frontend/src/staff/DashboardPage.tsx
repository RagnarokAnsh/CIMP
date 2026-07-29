import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, CheckCircle2, CircleDot, Clock, FolderKanban, Gauge, Inbox,
  ListTodo, Megaphone, Minus, ShieldCheck, ThumbsUp, TrendingDown, TrendingUp,
} from 'lucide-react';
import { staffApi } from '@/api/client';
import type { DashboardSummary, PlatformItem, PlatformReport } from '@/api/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { AnimatedNumber } from '@/components/AnimatedNumber';
import { Reveal } from '@/components/Reveal';
import { StatusBadge } from '@/components/StatusBadge';
import { TrendChart } from './TrendChart';
import {
  Breakdown, HeroStat, KpiCard, SlaHealth, TrendChip,
} from './dashboard-widgets';
import { METER_TONE, meterTone } from '@/lib/issue-meta';
import { hoursFmt, pct, relativeTime } from '@/lib/format';
import { useDocumentTitle } from '@/lib/use-document-title';

// Sentinel for "no platform filter". Radix Select rejects an empty-string value,
// so the all-platforms case needs a real token rather than ''.
const ALL = '__all__';

/**
 * One dashboard, scoped by a platform selector.
 *
 * This used to be two nav items — Dashboard (everything in your scope) and
 * Reports (one platform) — built from the same widgets and sharing seven of
 * their eight KPI cards. The only real difference was a filter, so people were
 * left diffing two near-identical screens to work out which one they wanted.
 * Now the filter is the page: "All platforms" is the old dashboard, picking a
 * platform is the old report.
 *
 * The two endpoints already had compatible shapes — `PlatformReport extends
 * DashboardSummary` — so one render path serves both, with the platform-only
 * extras (published known issues) shown when a platform is selected and the
 * cross-platform extras (by platform, by assignee) shown when it is not.
 */
export function DashboardPage() {
  useDocumentTitle('Dashboard');
  const [platformId, setPlatformId] = useState<string>(ALL);
  const allPlatforms = platformId === ALL;

  const { data: platforms } = useQuery({
    queryKey: ['staff', 'platforms'],
    queryFn: async () => (await staffApi.get<PlatformItem[]>('/staff/platforms')).data,
    staleTime: 5 * 60 * 1000,
  });

  // platformId is part of the key: without it the cached cross-scope numbers
  // would be served for a single platform (and vice versa).
  const { data, isLoading, isError } = useQuery({
    queryKey: ['staff', 'dashboard', platformId],
    queryFn: async () => (await staffApi.get<DashboardSummary | PlatformReport>(
      allPlatforms ? '/staff/dashboard' : `/staff/platforms/${platformId}/report`,
    )).data,
  });

  // The selector must stay usable while the panel below is loading or broken —
  // otherwise a failed platform traps you on it with no way back to "all".
  const selector = (platforms?.length ?? 0) > 1 ? (
    <Select value={platformId} onValueChange={setPlatformId}>
      <SelectTrigger className="w-56" aria-label="Filter dashboard by platform">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>All platforms</SelectItem>
        {(platforms ?? []).map((p) => (
          <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  ) : null;

  if (isLoading) return <DashboardSkeleton />;
  if (isError || !data) {
    return (
      <div className="space-y-4">
        {selector}
        <Alert variant="destructive">
          <AlertDescription>
            {allPlatforms
              ? 'Could not load the dashboard.'
              : 'Could not load this platform. Switch back to all platforms, or retry.'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  // Present only on the single-platform payload.
  const report = 'platform' in data ? (data as PlatformReport) : null;

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
              <p className="mt-1 text-sm text-white">
                {report
                  ? <>{report.platform.name} · <span className="font-mono">{report.platform.key}</span></>
                  : 'An overview of issues across your scope.'}
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium text-white ring-1 ring-white/25">
              {/* Flat is its own case: `net === 0` fell into the "down" branch
                  and rendered "Backlog down 0 over 14 days" under a downward
                  arrow — a movement claim and a direction, for no movement. */}
              {net === 0 && <><Minus className="h-3.5 w-3.5" /> Backlog unchanged over 14 days</>}
              {net > 0 && <><TrendingUp className="h-3.5 w-3.5" /> Backlog up {net} over 14 days</>}
              {net < 0 && <><TrendingDown className="h-3.5 w-3.5" /> Backlog down {Math.abs(net)} over 14 days</>}
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

      {selector && (
        <div className="flex flex-wrap items-center gap-3">
          {selector}
          <p className="text-sm text-muted-foreground">
            {report
              ? 'Showing one platform. Published known issues appear at the bottom.'
              : 'Showing every platform in your scope.'}
          </p>
        </div>
      )}

      {/* Two rows of four.
          Eight cards divide cleanly at every breakpoint (4/4 at xl, 2/2/2/2 at
          sm) and both rows share a column count with each other.

          There is deliberately no "SLA on track" card, even though the old
          Reports page had one: the SLA health panel below breaks the same
          number into on-track / due-soon / overdue, so the card only restated
          a figure the reader gets in more detail two rows down. That is the
          same reason it was dropped from the dashboard originally.

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

      {/* Breakdowns. Two when a single platform is selected ("by platform"
          would be one bar, and "by assignee" was never on the report), four
          across the whole scope — so the grid stays even either way. */}
      <Reveal className="grid gap-4 md:grid-cols-2">
        <Breakdown title="By status" rows={data.byStatus} kind="status" />
        <Breakdown title="By priority" rows={data.byPriority} kind="priority" />
        {allPlatforms && <Breakdown title="By platform" rows={data.byPlatform} />}
        {allPlatforms && (
          <Breakdown
            title="By assignee"
            rows={data.byAssignee.map((a) => ({ key: a.name, count: a.count }))}
            kind="assignee"
          />
        )}
      </Reveal>

      {/* Platform-only: what this platform's users can currently see advertised
          on the public status page. Meaningless across a mixed scope. */}
      {report && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Megaphone className="h-4 w-4 text-muted-foreground" /> Published known issues
              <span className="ml-1 text-xs font-normal text-muted-foreground">
                visible to this platform&apos;s users
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {report.knownIssues.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Nothing published right now — no known issues are being advertised to users.
              </p>
            ) : (
              <ul className="space-y-2">
                {report.knownIssues.map((k) => (
                  <li key={k.id} className="flex flex-wrap items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-sm">
                    <StatusBadge status={k.status} />
                    <Link to={`/staff/issues/${k.id}`} className="min-w-0 flex-1 truncate font-medium hover:underline">
                      {k.title ?? k.referenceNo}
                    </Link>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      updated {relativeTime(k.updatedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// Mirrors the real page exactly: hero, selector row, two KPI rows of four, the
// chart pair, four breakdowns. It was missing a whole KPI row, so the layout
// jumped downward as soon as the data landed — the shift a skeleton exists to
// prevent.
function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-44 rounded-2xl sm:h-40" />
      <Skeleton className="h-9 w-56" />
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
