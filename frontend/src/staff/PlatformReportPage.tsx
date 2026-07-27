import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle, CheckCircle2, CircleDot, Clock, FolderKanban, Megaphone,
  ShieldCheck, ThumbsUp, TrendingDown, TrendingUp,
} from 'lucide-react';
import { staffApi } from '@/api/client';
import type { PlatformItem, PlatformReport } from '@/api/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { StatusBadge } from '@/components/StatusBadge';
import { Reveal } from '@/components/Reveal';
import { AnimatedNumber } from '@/components/AnimatedNumber';
import { TrendChart } from './TrendChart';
import {
  Breakdown, HeroStat, KpiCard, SlaHealth,
} from './dashboard-widgets';
import { hoursFmt, pct, relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';

// The per-platform ("tenant owner") report: one platform's support health, for
// the team that owns the platform rather than the support staff who work every
// platform. Renders the same metric vocabulary as DashboardPage via the shared
// dashboard-widgets, so the two surfaces cannot drift apart.
//
// Access is server-enforced: the report endpoint requires a read role on THAT
// platform, and the picker only offers platforms already in the caller's scope
// (GET /staff/platforms is itself scoped).
export function PlatformReportPage() {
  const { data: platforms, isLoading: platformsLoading } = useQuery({
    queryKey: ['staff', 'platforms'],
    queryFn: async () => (await staffApi.get<PlatformItem[]>('/staff/platforms')).data,
    staleTime: 5 * 60 * 1000,
  });
  const [selected, setSelected] = useState('');
  const platformId = selected || platforms?.[0]?.id || '';

  const { data, isLoading, isError } = useQuery({
    queryKey: ['staff', 'platform-report', platformId],
    queryFn: async () =>
      (await staffApi.get<PlatformReport>(`/staff/platforms/${platformId}/report`)).data,
    enabled: Boolean(platformId),
  });

  if (!platformsLoading && (platforms ?? []).length === 0) {
    return (
      <Alert>
        <AlertDescription>
          You don&apos;t have access to any platform yet — ask an administrator for a role grant.
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="space-y-1.5">
            <Label>Platform</Label>
            <Select value={platformId} onValueChange={setSelected}>
              <SelectTrigger className="w-72"><SelectValue placeholder="Select platform" /></SelectTrigger>
              <SelectContent>
                {platforms?.map((p) => (
                  <SelectItem key={p.id} value={p.id}>{p.name} ({p.key})</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="pb-2 text-xs text-muted-foreground">
            Support health for one platform — share this view with the team that owns it.
          </p>
        </CardContent>
      </Card>

      {(isLoading || platformsLoading) && <ReportSkeleton />}
      {isError && (
        <Alert variant="destructive">
          <AlertDescription>Could not load this platform&apos;s report.</AlertDescription>
        </Alert>
      )}
      {!isLoading && !isError && data && <ReportBody data={data} />}
    </div>
  );
}

function ReportBody({ data }: { data: PlatformReport }) {
  const { all, open, resolvedOrClosed } = data.totals;
  const { overdue, atRisk } = data.sla;
  const onTrack = Math.max(0, open - overdue - atRisk);
  const created14 = data.trend.created.reduce((s, d) => s + d.count, 0);
  const resolved14 = data.trend.resolved.reduce((s, d) => s + d.count, 0);
  const net = created14 - resolved14; // > 0 → backlog growing

  return (
    <>
      <section className="relative overflow-hidden rounded-2xl bg-gradient-brand p-6 text-white shadow-lg sm:p-8">
        <div className="relative z-10 flex flex-col gap-6">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">{data.platform.name}</h1>
              <p className="mt-1 text-sm text-white/80">
                Support report · <span className="font-mono">{data.platform.key}</span>
              </p>
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
              icon={<CheckCircle2 className="h-5 w-5" />}
              context={`${pct(resolvedOrClosed, all)}% resolution rate`}
            />
          </Reveal>
        </div>
        <div className="pointer-events-none absolute -right-16 -top-20 size-60 rounded-full bg-white/10 blur-2xl" aria-hidden />
      </section>

      {/* Service quality — what a platform owner actually asks about. */}
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
          label="SLA on track"
          icon={<ShieldCheck className="h-5 w-5" />}
          value={`${pct(onTrack, open)}%`}
          sub={`${onTrack} of ${open} open within target`}
          progress={pct(onTrack, open)}
          progressClass={overdue > 0 ? 'bg-amber-500' : 'bg-emerald-500'}
        />
        <KpiCard
          label="CSAT (30d)"
          icon={<ThumbsUp className="h-5 w-5" />}
          value={data.csat.positiveRate === null ? '—' : `${data.csat.positiveRate}%`}
          sub={data.csat.count > 0
            ? `${data.csat.count} rating${data.csat.count === 1 ? '' : 's'} from reporters`
            : 'no reporter ratings yet'}
          progress={data.csat.positiveRate ?? 0}
          progressClass={data.csat.positiveRate !== null && data.csat.positiveRate < 60 ? 'bg-amber-500' : 'bg-emerald-500'}
        />
      </Reveal>

      <Reveal className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Created"
          icon={<TrendingUp className="h-5 w-5" />}
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
          icon={<CheckCircle2 className="h-5 w-5" />}
          value={<AnimatedNumber value={resolved14} className="tabular-nums" />}
          sub="closed out in the last 14 days"
        />
        <KpiCard
          label="Reopen rate"
          icon={<AlertTriangle className="h-5 w-5" />}
          value={data.ops.reopenRate === null ? '—' : `${data.ops.reopenRate}%`}
          sub="of resolutions reopened (30d)"
          progress={data.ops.reopenRate ?? 0}
          progressClass={data.ops.reopenRate !== null && data.ops.reopenRate > 20 ? 'bg-amber-500' : 'bg-emerald-500'}
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

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="min-w-0 lg:col-span-2">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingUp className="h-4 w-4 text-muted-foreground" />
              Created vs resolved
              <span className="ml-1 text-xs font-normal text-muted-foreground">last 14 days</span>
            </CardTitle>
          </CardHeader>
          <CardContent><TrendChart trend={data.trend} /></CardContent>
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

      {/* No "by platform" breakdown here — this report IS one platform. */}
      <Reveal className="grid gap-4 md:grid-cols-2">
        <Breakdown title="By status" rows={data.byStatus} kind="status" />
        <Breakdown title="By priority" rows={data.byPriority} kind="priority" />
      </Reveal>

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
          {data.knownIssues.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Nothing published right now — no known issues are being advertised to users.
            </p>
          ) : (
            <ul className="space-y-2">
              {data.knownIssues.map((k) => (
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
    </>
  );
}

function ReportSkeleton() {
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
    </div>
  );
}
