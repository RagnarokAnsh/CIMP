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

const WINDOW_DAYS = 14;

// `YYYY-MM-DD` arithmetic in UTC so the series never shifts a bucket when the
// viewer's timezone differs from the server's.
function addDays(day: string, delta: number): string {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

// Merges the backend's two day-bucketed series into one dataset keyed by day.
//
// The backend only emits days that had activity. Plotting those directly gave a
// non-linear time axis — a 9-day gap rendered the same width as a 1-day step,
// so the slope misrepresented the actual rate. Densify across the whole window
// instead: every day present, quiet ones as zero.
function mergeTrend(trend: DashboardSummary['trend']) {
  const byDay = new Map<string, { created: number; resolved: number }>();
  const touch = (day: string) => byDay.get(day) ?? { created: 0, resolved: 0 };
  for (const c of trend.created) byDay.set(c.day, { ...touch(c.day), created: c.count });
  for (const r of trend.resolved) byDay.set(r.day, { ...touch(r.day), resolved: r.count });

  const days = [...byDay.keys()].sort();
  if (days.length === 0) return [];

  // Anchor on today so the window still reads correctly when the last few days
  // were quiet; extend back if the data reaches further than the nominal window.
  const end = [days[days.length - 1], todayUtc()].sort().pop()!;
  const nominalStart = addDays(end, -(WINDOW_DAYS - 1));
  const start = [days[0], nominalStart].sort()[0];

  const out: { day: string; created: number; resolved: number }[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) {
    out.push({ day, ...touch(day) });
  }
  return out;
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
