import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Download, FileText, Loader2, MessageSquare, Send } from 'lucide-react';
import { toast } from 'sonner';
import { reporterApi } from '@/api/client';
import type { ReporterIssueDetail } from '@/api/types';
import { downloadFile } from '@/lib/download';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { StatusBadge, PriorityBadge } from '@/components/StatusBadge';
import { firstLine, relativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';

export function ReporterIssueDetailPage() {
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [reply, setReply] = useState('');

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

  const sendReply = useMutation({
    mutationFn: async () => reporterApi.post(`/issues/${id}/comments`, { body: reply.trim() }),
    onSuccess: () => {
      setReply('');
      toast.success('Reply sent to support.');
      queryClient.invalidateQueries({ queryKey: ['reporter', 'issue', id] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Could not send your reply.'),
  });

  async function download(attachmentId: string, filename: string) {
    try {
      await downloadFile(reporterApi, `/issues/${id}/attachments/${attachmentId}`, filename);
    } catch {
      toast.error('Could not download that file.');
    }
  }

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
                {data.attachments.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <FileText className="h-4 w-4 shrink-0" />
                    <span className="truncate">{a.filename}</span>
                    <span className="text-xs">({Math.round(a.sizeBytes / 1024)} KB)</span>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="ml-auto"
                      disabled={!a.downloadable}
                      title={a.downloadable ? 'Download' : 'Not available yet (being scanned)'}
                      aria-label={`Download ${a.filename}`}
                      onClick={() => download(a.id, a.filename)}
                    >
                      <Download className="h-4 w-4" />
                    </Button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Separator />

          <div className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <MessageSquare className="h-4 w-4" /> Conversation
            </h3>
            {data.updates.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No updates yet. We'll post here as your issue progresses — and you can reply below.
              </p>
            ) : (
              <ol className="space-y-3">
                {data.updates.map((u, idx) => (
                  <li
                    key={idx}
                    className={cn(
                      'rounded-md border p-3',
                      u.fromReporter
                        ? 'border-primary/20 bg-primary/[0.05]'
                        : 'border-border bg-muted/30',
                    )}
                  >
                    <p className="text-xs font-medium text-muted-foreground">
                      {u.fromReporter ? 'You' : u.author}
                    </p>
                    <p className="mt-1 whitespace-pre-wrap text-sm">{u.body}</p>
                    <p className="mt-1 text-xs text-muted-foreground" title={new Date(u.createdAt).toLocaleString()}>
                      {relativeTime(u.createdAt)}
                    </p>
                  </li>
                ))}
              </ol>
            )}

            <div className="space-y-2 pt-1">
              <Textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Reply to support…"
                className="min-h-20"
                maxLength={5000}
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  disabled={!reply.trim() || sendReply.isPending}
                  onClick={() => sendReply.mutate()}
                >
                  {sendReply.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                  Send reply
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
