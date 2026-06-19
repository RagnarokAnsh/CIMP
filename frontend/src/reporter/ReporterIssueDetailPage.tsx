import { useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, FileText, MessageSquare } from 'lucide-react';
import { reporterApi } from '@/api/client';
import type { ReporterIssueDetail } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { StatusBadge, PriorityBadge } from '@/components/StatusBadge';
import { firstLine, relativeTime } from '@/lib/format';

export function ReporterIssueDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['reporter', 'issue', id],
    queryFn: async () => (await reporterApi.get<ReporterIssueDetail>(`/issues/${id}`)).data,
  });

  // Mark the issue seen when opened (drives the unread indicator).
  const markSeen = useMutation({
    mutationFn: async () => reporterApi.post(`/issues/${id}/seen`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['reporter', 'issues'] }),
  });
  useEffect(() => {
    if (data) markSeen.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.id]);

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (isError || !data) {
    return <Alert variant="destructive"><AlertDescription>Issue not found.</AlertDescription></Alert>;
  }

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
        <Link to="/reporter/issues"><ArrowLeft className="h-4 w-4" /> Back to my issues</Link>
      </Button>

      <Card>
        <CardHeader className="gap-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-mono">{data.referenceNo}</span>
            <span className="text-muted-foreground/40">·</span>
            <span>Raised {relativeTime(data.createdAt)}</span>
          </div>
          <CardTitle className="leading-snug text-balance">
            {firstLine(data.description, 120) || data.referenceNo}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <StatusBadge status={data.status} />
            <PriorityBadge priority={data.priority} />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          <p className="whitespace-pre-wrap text-sm leading-relaxed">{data.description}</p>

          {data.attachments.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">Attachments</h3>
              <ul className="space-y-1">
                {data.attachments.map((a, idx) => (
                  <li key={idx} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FileText className="h-4 w-4" />
                    {a.filename}
                    <span className="text-xs">({Math.round(a.sizeBytes / 1024)} KB)</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Separator />

          <div className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <MessageSquare className="h-4 w-4" /> Updates
            </h3>
            {data.updates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No updates yet. We'll post here as your issue progresses.
              </p>
            ) : (
              <ol className="space-y-3">
                {data.updates.map((u, idx) => (
                  <li key={idx} className="rounded-md border border-border bg-muted/30 p-3">
                    <p className="whitespace-pre-wrap text-sm">{u.body}</p>
                    <p className="mt-1 text-xs text-muted-foreground" title={new Date(u.createdAt).toLocaleString()}>
                      {relativeTime(u.createdAt)}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
