import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft, Languages, MessageSquare, Send, ThumbsDown, ThumbsUp,
} from 'lucide-react';
import { toast } from 'sonner';
import { reporterApi } from '@/api/client';
import type { ReporterIssueDetail } from '@/api/types';
import { AttachmentGallery } from '@/components/AttachmentGallery';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { StatusBadge, PriorityBadge } from '@/components/StatusBadge';
import { firstLine, relativeTime, dateTime } from '@/lib/format';
import { toastApiError } from '@/lib/toast-error';
import { useT } from '@/i18n';
import { usePriorityLabel, useStatusLabel } from '@/i18n/useStatusLabel';
import { useDocumentTitle } from '@/lib/use-document-title';
import { cn } from '@/lib/utils';

// One-click resolution rating. 👎 invites an optional comment; the rating can
// be changed (latest wins, the server upserts).
function CsatWidget({ issueId, existing }: {
  issueId: string;
  existing: { score: number; comment: string | null } | null;
}) {
  const { t } = useT();
  const queryClient = useQueryClient();
  const [pendingDown, setPendingDown] = useState(false);
  // The server upserts CSAT (latest wins), so a rating is never final. `changing`
  // reopens the picker from the acknowledgement — the widget used to lock forever
  // on first rating, contradicting its own "the rating can be changed" contract.
  const [changing, setChanging] = useState(false);
  const [comment, setComment] = useState('');

  const submit = useMutation({
    mutationFn: async (score: 'up' | 'down') =>
      reporterApi.post(`/issues/${issueId}/csat`, {
        score,
        comment: score === 'down' && comment.trim() ? comment.trim() : undefined,
      }),
    onSuccess: () => {
      setPendingDown(false);
      setChanging(false);
      setComment('');
      toast.success(t('csat.thanks'));
      queryClient.invalidateQueries({ queryKey: ['reporter', 'issue', issueId] });
    },
    onError: (e) => toastApiError(e),
  });

  if (existing && !changing) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-sm">
        {existing.score === 1
          ? <ThumbsUp className="h-4 w-4 text-success" />
          : <ThumbsDown className="h-4 w-4 text-destructive" />}
        <span>{t('csat.thanks')}</span>
        <button
          type="button"
          className="ml-auto text-xs text-muted-foreground hover:text-foreground hover:underline"
          onClick={() => { setChanging(true); setPendingDown(false); }}
        >
          {t('csat.change')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-border/60 bg-muted/40 px-3 py-2.5">
      <div className="flex items-center gap-3 text-sm">
        <span>{t('csat.question')}</span>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          disabled={submit.isPending}
          onClick={() => submit.mutate('up')}
        >
          <ThumbsUp className="h-3.5 w-3.5" /> {t('csat.yes')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          disabled={submit.isPending}
          onClick={() => setPendingDown(true)}
        >
          <ThumbsDown className="h-3.5 w-3.5" /> {t('csat.no')}
        </Button>
      </div>
      {pendingDown && (
        <div className="space-y-2">
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder={t('csat.commentPlaceholder')}
            aria-label={t('csat.commentPlaceholder')}
            className="min-h-16"
            maxLength={500}
          />
          <Button size="sm" disabled={submit.isPending} onClick={() => submit.mutate('down')}>
            {submit.isPending && <Spinner />} {t('csat.sendFeedback')}
          </Button>
        </div>
      )}
    </div>
  );
}

// One message in the conversation. When the server served a machine translation
// it also returns the original — surfaced behind a toggle so a reader who spots
// an odd translation can always check what was actually written.
function UpdateBubble({ update: u }: { update: ReporterIssueDetail['updates'][number] }) {
  const { t } = useT();
  const [showOriginal, setShowOriginal] = useState(false);
  return (
    <li
      className={cn(
        'rounded-md border p-3',
        u.fromReporter ? 'border-primary/20 bg-primary/[0.05]' : 'border-border bg-muted/30',
      )}
    >
      <p className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
        {u.fromReporter ? t('detail.you') : u.author}
        {u.translated && (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-1.5 py-0.5 text-2xs font-normal">
            <Languages className="h-2.5 w-2.5" aria-hidden />
            {t('detail.translated')}
          </span>
        )}
      </p>
      <p className="mt-1 whitespace-pre-wrap text-sm">{u.body}</p>
      {u.translated && u.originalBody && (
        <>
          {showOriginal && (
            <p className="mt-2 whitespace-pre-wrap border-l-2 border-border pl-2 text-sm text-muted-foreground">
              {u.originalBody}
            </p>
          )}
          <button
            type="button"
            className="mt-1 text-xs text-primary hover:underline"
            onClick={() => setShowOriginal((v) => !v)}
          >
            {showOriginal ? t('detail.hideOriginal') : t('detail.showOriginal')}
          </button>
        </>
      )}
      <p className="mt-1 text-xs text-muted-foreground" title={dateTime(u.createdAt)}>
        {relativeTime(u.createdAt)}
      </p>
    </li>
  );
}

export function ReporterIssueDetailPage() {
  const { t } = useT();
  const statusLabel = useStatusLabel();
  const priorityLabel = usePriorityLabel();
  const { id } = useParams<{ id: string }>();
  const queryClient = useQueryClient();
  const [reply, setReply] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['reporter', 'issue', id],
    queryFn: async () => (await reporterApi.get<ReporterIssueDetail>(`/issues/${id}`)).data,
  });
  // The reference number, not the description: it is what the reporter quotes
  // back to support and what makes one open tab tellable from another.
  useDocumentTitle(data?.referenceNo);

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
      toast.success(t('detail.reply.sent'));
      queryClient.invalidateQueries({ queryKey: ['reporter', 'issue', id] });
    },
    onError: (e) => toastApiError(e),
  });

  if (isLoading) return <Skeleton className="h-64 w-full" />;
  if (isError || !data) {
    return <Alert variant="destructive"><AlertDescription>{t('detail.notFound')}</AlertDescription></Alert>;
  }

  return (
    <div className="space-y-4">
      <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
        <Link to="/reporter/issues"><ArrowLeft className="h-4 w-4" /> {t('detail.back')}</Link>
      </Button>

      <Card>
        <CardHeader className="gap-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="font-mono">{data.referenceNo}</span>
            <span aria-hidden className="text-muted-foreground/70">·</span>
            <span>{t('list.raised', { when: relativeTime(data.createdAt) })}</span>
          </div>
          <CardTitle as="h1" className="text-xl leading-snug text-balance">
            {firstLine(data.description, 120) || data.referenceNo}
          </CardTitle>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <StatusBadge status={data.status} label={statusLabel(data.status)} />
            <PriorityBadge priority={data.priority} label={priorityLabel(data.priority)} />
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {(data.status === 'RESOLVED' || data.status === 'CLOSED') && (
            <CsatWidget issueId={id!} existing={data.csat} />
          )}

          <p className="whitespace-pre-wrap text-sm leading-relaxed">{data.description}</p>

          {data.attachments.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">{t('detail.attachments')}</h3>
              <AttachmentGallery
                api={reporterApi}
                urlFor={(a) => `/issues/${id}/attachments/${a.id}`}
                attachments={data.attachments.map((a) => ({
                  id: a.id,
                  filename: a.filename,
                  contentType: a.contentType,
                  sizeBytes: a.sizeBytes,
                  servable: a.downloadable,
                  scanLabel: 'scanning…',
                }))}
              />
            </div>
          )}

          <Separator />

          <div className="space-y-3">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <MessageSquare className="h-4 w-4" /> {t('detail.conversation')}
            </h3>
            {data.updates.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('detail.noUpdates')}</p>
            ) : (
              <ol className="space-y-3">
                {data.updates.map((u, idx) => (
                  <UpdateBubble key={idx} update={u} />
                ))}
              </ol>
            )}

            <div className="space-y-2 pt-1">
              <Textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder={t('detail.reply.placeholder')}
                // A placeholder is not a label: it disappears on first keypress
                // and is not announced as the field's name. This is the reporter
                // portal's primary input.
                aria-label={t('detail.reply.placeholder')}
                className="min-h-20"
                maxLength={5000}
              />
              <div className="flex justify-end">
                <Button
                  size="sm"
                  disabled={!reply.trim() || sendReply.isPending}
                  onClick={() => sendReply.mutate()}
                >
                  {sendReply.isPending ? <Spinner /> : <Send className="h-4 w-4" />}
                  {t('detail.reply.send')}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
