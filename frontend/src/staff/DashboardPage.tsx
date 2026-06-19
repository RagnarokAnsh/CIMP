import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, CircleDot, Clock, FolderKanban, ListTodo, TrendingUp } from 'lucide-react';
import { staffApi } from '@/api/client';
import type { DashboardSummary } from '@/api/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AnimatedNumber } from '@/components/AnimatedNumber';
import { Reveal } from '@/components/Reveal';
import { TrendChart } from './TrendChart';

export function DashboardPage() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ['staff', 'dashboard'],
    queryFn: async () => (await staffApi.get<DashboardSummary>('/staff/dashboard')).data,
  });

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }
  if (isError || !data) {
    return <Alert variant="destructive"><AlertDescription>Could not load the dashboard.</AlertDescription></Alert>;
  }

  return (
    <div className="space-y-6">
      {/* Brand-gradient hero — the one place the indigo→violet gradient carries a
          full surface (DESIGN.md: hero surfaces only). */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-brand p-6 text-white shadow-lg sm:p-8">
        <div className="relative z-10 flex flex-col gap-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
            <p className="mt-1 text-sm text-white/80">An overview of issues across your scope.</p>
          </div>
          <Reveal className="grid gap-4 sm:grid-cols-3">
            <HeroStat label="All issues" value={data.totals.all} icon={<FolderKanban className="h-5 w-5" />} />
            <HeroStat label="Open" value={data.totals.open} icon={<CircleDot className="h-5 w-5" />} />
            <HeroStat label="Resolved / closed" value={data.totals.resolvedOrClosed} icon={<ListTodo className="h-5 w-5" />} />
          </Reveal>
        </div>
        <div className="pointer-events-none absolute -right-16 -top-20 size-60 rounded-full bg-white/10 blur-2xl" aria-hidden />
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <SlaTile
          label="Overdue"
          help="Open issues past their SLA target"
          value={data.sla.overdue}
          icon={<AlertTriangle className="h-5 w-5" />}
          tone="danger"
        />
        <SlaTile
          label="Due soon"
          help="Open issues nearing their SLA target"
          value={data.sla.atRisk}
          icon={<Clock className="h-5 w-5" />}
          tone="warning"
        />
      </div>

      <Card>
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

      <Reveal className="grid gap-4 md:grid-cols-2">
        <Breakdown title="By status" rows={data.byStatus} />
        <Breakdown title="By priority" rows={data.byPriority} />
        <Breakdown title="By platform" rows={data.byPlatform} />
        <Breakdown title="By assignee" rows={data.byAssignee.map((a) => ({ key: a.name, count: a.count }))} />
      </Reveal>
    </div>
  );
}

function HeroStat({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/15 bg-white/10 p-4 backdrop-blur-sm">
      <div>
        <p className="text-sm text-white/80">{label}</p>
        <AnimatedNumber value={value} className="mt-1 block text-3xl font-semibold tabular-nums" />
      </div>
      <div className="rounded-md bg-white/15 p-2.5">{icon}</div>
    </div>
  );
}

function SlaTile({
  label, help, value, icon, tone,
}: {
  label: string;
  help: string;
  value: number;
  icon: React.ReactNode;
  tone: 'danger' | 'warning';
}) {
  const active = value > 0;
  const toneClass = !active
    ? 'bg-muted text-muted-foreground'
    : tone === 'danger'
      ? 'bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300'
      : 'bg-amber-100 text-amber-700 dark:bg-amber-500/15 dark:text-amber-300';
  return (
    <Card>
      <CardContent className="flex items-center justify-between pt-6">
        <div>
          <p className="text-sm font-medium">{label}</p>
          <p className="text-xs text-muted-foreground">{help}</p>
          <AnimatedNumber value={value} className="mt-2 block text-3xl font-semibold tabular-nums" />
        </div>
        <div className={`rounded-md p-2.5 ${toneClass}`}>{icon}</div>
      </CardContent>
    </Card>
  );
}

function Breakdown({ title, rows }: { title: string; rows: { key: string; count: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No data.</p>
        ) : (
          <ul className="space-y-2.5">
            {rows.map((r) => (
              <li key={r.key || '—'} className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span>{r.key || '—'}</span>
                  <span className="font-medium tabular-nums">{r.count}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary/70 transition-[width] duration-500"
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
