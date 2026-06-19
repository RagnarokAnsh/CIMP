import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from 'recharts';
import {
  ChartConfig, ChartContainer, ChartLegend, ChartLegendContent,
  ChartTooltip, ChartTooltipContent,
} from '@/components/ui/chart';
import type { DashboardSummary } from '@/api/types';

const config = {
  created: { label: 'Created', color: 'var(--chart-1)' },
  resolved: { label: 'Resolved', color: 'var(--chart-3)' },
} satisfies ChartConfig;

// Merges the backend's two day-bucketed series into one dataset keyed by day,
// so created vs resolved overlay on the same time axis (14-day window).
function mergeTrend(trend: DashboardSummary['trend']) {
  const byDay = new Map<string, { day: string; created: number; resolved: number }>();
  for (const c of trend.created) {
    byDay.set(c.day, { day: c.day, created: c.count, resolved: 0 });
  }
  for (const r of trend.resolved) {
    const row = byDay.get(r.day) ?? { day: r.day, created: 0, resolved: 0 };
    row.resolved = r.count;
    byDay.set(r.day, row);
  }
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
}

export function TrendChart({ trend }: { trend: DashboardSummary['trend'] }) {
  const data = mergeTrend(trend);

  if (data.length === 0) {
    return (
      <div className="flex h-[240px] items-center justify-center text-sm text-muted-foreground">
        No activity in the last 14 days.
      </div>
    );
  }

  return (
    <ChartContainer config={config} className="h-[240px] w-full">
      <AreaChart data={data} margin={{ left: -16, right: 8, top: 8 }}>
        <defs>
          <linearGradient id="fillCreated" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-created)" stopOpacity={0.4} />
            <stop offset="95%" stopColor="var(--color-created)" stopOpacity={0.05} />
          </linearGradient>
          <linearGradient id="fillResolved" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor="var(--color-resolved)" stopOpacity={0.4} />
            <stop offset="95%" stopColor="var(--color-resolved)" stopOpacity={0.05} />
          </linearGradient>
        </defs>
        <CartesianGrid vertical={false} strokeDasharray="3 3" className="stroke-border" />
        <XAxis
          dataKey="day"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={24}
          tickFormatter={(v: string) => v.slice(5)}
        />
        <YAxis tickLine={false} axisLine={false} width={32} allowDecimals={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Area
          dataKey="created"
          type="monotone"
          fill="url(#fillCreated)"
          stroke="var(--color-created)"
          strokeWidth={2}
        />
        <Area
          dataKey="resolved"
          type="monotone"
          fill="url(#fillResolved)"
          stroke="var(--color-resolved)"
          strokeWidth={2}
        />
      </AreaChart>
    </ChartContainer>
  );
}
