import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { LifeBuoy } from 'lucide-react';
import type { IncidentView, PublicStatusPage as PublicStatus } from '@/api/types';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { ThemeToggle } from '@/components/ThemeToggle';
import {
  COMPONENT_STATUS_META, INCIDENT_IMPACT_META, INCIDENT_STATUS_META, OVERALL_HEADLINE,
} from '@/lib/status-meta';
import { dateTime, relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';

// The public status page: /status/:key — unauthenticated, no tokens, its own
// axios call (NOT staffApi/reporterApi, which attach credentials this page must
// never send). Everything rendered here is staff-curated and already public.
const publicApi = axios.create({ baseURL: '/api/public' });

export function PublicStatusPage() {
  const { key } = useParams<{ key: string }>();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['public', 'status', key],
    queryFn: async () => (await publicApi.get<PublicStatus>(`/platforms/${key}/status`)).data,
    enabled: Boolean(key),
    // A status page people leave open should keep itself current.
    refetchInterval: 60_000,
    retry: 1,
  });

  return (
    <div className="min-h-screen bg-background">
      <header className="glass sticky top-0 z-10 border-b border-border">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <div className="flex items-center gap-2.5 font-semibold tracking-tight">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-brand text-white shadow-sm">
              <LifeBuoy className="h-[18px] w-[18px]" />
            </div>
            <span>{data?.platform.name ?? 'Service status'}</span>
          </div>
          <ThemeToggle />
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-6 px-4 py-8">
        {isLoading && (
          <div className="space-y-4">
            <Skeleton className="h-28 w-full rounded-xl" />
            <Skeleton className="h-56 w-full" />
          </div>
        )}

        {isError && (
          <Alert variant="destructive">
            <AlertDescription>
              We couldn&apos;t load the status page. Please refresh in a moment.
            </AlertDescription>
          </Alert>
        )}

        {data && (
          <>
            <OverallBanner data={data} />

            {data.activeIncidents.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Active incidents
                </h2>
                {data.activeIncidents.map((i) => <IncidentCard key={i.id} incident={i} />)}
              </section>
            )}

            {data.components.length > 0 && (
              <Card>
                <CardHeader><CardTitle className="text-base">Components</CardTitle></CardHeader>
                <CardContent className="space-y-1">
                  {data.components.map((c) => {
                    const meta = COMPONENT_STATUS_META[c.status];
                    return (
                      <div key={c.id} className="flex items-start justify-between gap-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm font-medium">{c.name}</p>
                          {c.description && (
                            <p className="text-xs text-muted-foreground">{c.description}</p>
                          )}
                        </div>
                        <span className="flex shrink-0 items-center gap-1.5 text-sm">
                          <span className={cn('size-2 rounded-full', meta.dot)} aria-hidden />
                          <span className="text-muted-foreground">{meta.label}</span>
                        </span>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {data.recentIncidents.length > 0 && (
              <section className="space-y-3">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  Past incidents
                </h2>
                {data.recentIncidents.map((i) => <IncidentCard key={i.id} incident={i} />)}
              </section>
            )}

            {data.components.length === 0
              && data.activeIncidents.length === 0
              && data.recentIncidents.length === 0 && (
              <Card>
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  No components or incidents have been published yet.
                </CardContent>
              </Card>
            )}

            <p className="text-center text-xs text-muted-foreground">
              Last updated {relativeTime(data.updatedAt)} · refreshes automatically
            </p>
          </>
        )}
      </main>
    </div>
  );
}

function OverallBanner({ data }: { data: PublicStatus }) {
  const meta = COMPONENT_STATUS_META[data.overall];
  const Icon = meta.icon;
  const ok = data.overall === 'OPERATIONAL';
  return (
    <section
      className={cn(
        'flex items-center gap-4 rounded-xl border p-6',
        ok
          ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/10'
          : 'border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/10',
      )}
    >
      <Icon
        className={cn(
          'h-8 w-8 shrink-0',
          ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400',
        )}
        aria-hidden
      />
      <div className="min-w-0">
        <h1 className="text-lg font-semibold tracking-tight">{OVERALL_HEADLINE[data.overall]}</h1>
        <p className="text-sm text-muted-foreground">{data.platform.name}</p>
      </div>
    </section>
  );
}

function IncidentCard({ incident }: { incident: IncidentView }) {
  const status = INCIDENT_STATUS_META[incident.status];
  const impact = INCIDENT_IMPACT_META[incident.impact];
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="text-base">{incident.title}</CardTitle>
          <Badge variant="outline" className={status.className}>{status.label}</Badge>
          <Badge variant="outline" className={impact.className}>{impact.label}</Badge>
        </div>
        <p className="text-xs text-muted-foreground">
          Started {dateTime(incident.startedAt)}
          {incident.resolvedAt && ` · resolved ${dateTime(incident.resolvedAt)}`}
        </p>
        {incident.components.length > 0 && (
          <p className="text-xs text-muted-foreground">
            Affects: {incident.components.map((c) => c.name).join(', ')}
          </p>
        )}
      </CardHeader>
      <CardContent>
        <ol className="space-y-3">
          {incident.updates.map((u, idx) => (
            <li key={u.id} className="space-y-1">
              {idx > 0 && <Separator className="mb-3" />}
              <div className="flex items-center gap-2 text-sm">
                <span className="font-medium">{INCIDENT_STATUS_META[u.status].label}</span>
                <span className="text-xs text-muted-foreground">{dateTime(u.createdAt)}</span>
              </div>
              <p className="whitespace-pre-wrap text-sm text-foreground/90">{u.body}</p>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
