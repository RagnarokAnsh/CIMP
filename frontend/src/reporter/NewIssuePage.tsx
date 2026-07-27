import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ActivitySquare, Paperclip, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TEXT_TONE } from '@/lib/issue-meta';
import { toast } from 'sonner';
import { reporterApi } from '@/api/client';
import { getHandoffToken } from '@/api/handoff';
import { clearDiagnostics, loadDiagnostics } from '@/api/diagnostics';
import { toastApiError } from '@/lib/toast-error';
import { friendlyError } from '@/lib/api-error';
import { useT, type TFunction } from '@/i18n';
import type { ReporterIssueDetail, SimilarIssue } from '@/api/types';
import { useQuery } from '@tanstack/react-query';
import { StatusBadge } from '@/components/StatusBadge';
import { relativeTime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { DiagnosticsView } from '@/components/DiagnosticsView';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Spinner } from '@/components/ui/spinner';

// The two-field intake: description + attachments (OD-04: ≤5 files, ≤10MB,
// png/jpeg/webp/pdf). Mirrors the backend limits in src/common/constants.ts.
const MAX_FILES = 5;
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'];

// Takes `t` so the message is in the reporter's language (this is pure logic,
// so the translator is passed in rather than the hook being called here).
function validateFiles(files: FileList | null, t: TFunction): string | null {
  if (!files || files.length === 0) return null;
  if (files.length > MAX_FILES) return t('new.error.tooManyFiles', { max: MAX_FILES });
  for (const f of Array.from(files)) {
    // Only reject a type the browser positively identified as unsupported.
    // File.type is '' for plenty of real files, and the server is the authority
    // regardless — it sniffs the actual magic bytes (ReporterService.validateFiles)
    // rather than trusting this header, so blocking an unknown type here would
    // reject valid uploads the server would have accepted.
    if (f.type && !ALLOWED_MIME_TYPES.includes(f.type)) {
      return t('new.error.badType', { name: f.name });
    }
    if (f.size > MAX_FILE_BYTES) {
      return t('new.error.tooLarge', { name: f.name });
    }
  }
  return null;
}

// "Looks like this is already being tracked" — privacy-safe matches for the
// draft description (status/age/count only), each with a one-click subscribe.
function SimilarIssuesPanel({ description }: { description: string }) {
  const { t } = useT();
  const [debounced, setDebounced] = useState('');
  const [dismissed, setDismissed] = useState(false);
  const [subscribedTokens, setSubscribedTokens] = useState<Set<string>>(new Set());

  useEffect(() => {
    const t = setTimeout(() => setDebounced(description.trim()), 600);
    return () => clearTimeout(t);
  }, [description]);

  const { data: matches } = useQuery({
    queryKey: ['reporter', 'similar', debounced],
    queryFn: async () =>
      (await reporterApi.get<SimilarIssue[]>(`/similar-issues?q=${encodeURIComponent(debounced.slice(0, 500))}`)).data,
    enabled: debounced.length >= 15 && !dismissed,
    staleTime: 30_000,
  });

  const subscribe = useMutation({
    mutationFn: async (token: string) => {
      await reporterApi.post('/subscriptions', { token });
      return token;
    },
    onSuccess: (token) => {
      setSubscribedTokens((prev) => new Set(prev).add(token));
      toast.success(t('similar.subscribeToast'));
    },
    onError: (e) => toastApiError(e),
  });

  if (dismissed || !matches || matches.length === 0) return null;

  return (
    <Alert>
      <AlertTitle className="flex items-center justify-between">
        {t('similar.title')}
        <button type="button" className="text-xs font-normal text-muted-foreground hover:underline" onClick={() => setDismissed(true)}>
          {t('similar.dismiss')}
        </button>
      </AlertTitle>
      <AlertDescription>
        {/* Each row must be identifiable on its own — otherwise you are asking
            someone to subscribe to an unnamed thing. Published issues carry a
            staff-written title; the rest stay deliberately anonymous, so rank
            them ("Closest match") instead of repeating one identical line. */}
        <ul className="mt-2 space-y-2">
          {matches.map((m, i) => (
            <li
              key={m.subscribeToken}
              className="flex flex-wrap items-center gap-x-2 gap-y-1.5 rounded-md border border-border/60 bg-background/40 px-2.5 py-2 text-sm"
            >
              <StatusBadge status={m.status} />
              <span className="min-w-0 flex-1 basis-40">
                <span className="block truncate font-medium text-foreground">
                  {m.title ?? (i === 0 ? t('similar.closest') : t('similar.other', { n: i + 1 }))}
                </span>
                <span className="block text-xs text-muted-foreground">
                  {t('similar.meta', {
                    when: relativeTime(m.firstReportedAt),
                    count: m.reportCount,
                  })}
                </span>
              </span>
              {subscribedTokens.has(m.subscribeToken) ? (
                <span className={cn('shrink-0', TEXT_TONE.success)}>{t('similar.subscribed')}</span>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  disabled={subscribe.isPending}
                  onClick={() => subscribe.mutate(m.subscribeToken)}
                >
                  {t('similar.subscribe')}
                </Button>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          {t('similar.footer')}
        </p>
      </AlertDescription>
    </Alert>
  );
}

export function NewIssuePage() {
  const { t } = useT();
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<FileList | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  // Diagnostics handed over by the portal's SDK (from the URL fragment) —
  // shown to the reporter, removable, sent only if still attached on submit.
  // A screenshot travels inside the fragment but is split out here: it is
  // submitted as a NORMAL attachment (scan pipeline applies), never as jsonb.
  const [diagnostics, setDiagnostics] = useState<Record<string, unknown> | null>(null);
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    void loadDiagnostics().then((d) => {
      if (!d) return;
      const { screenshot: shot, ...rest } = d;
      if (typeof shot === 'string' && shot.startsWith('data:image/')) setScreenshot(shot);
      setDiagnostics(Object.keys(rest).length > 0 ? rest : null);
    });
  }, []);

  const mutation = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      form.append('description', description);
      if (diagnostics) form.append('context', JSON.stringify(diagnostics));
      if (files) Array.from(files).forEach((f) => form.append('files', f));
      if (screenshot) {
        if ((files?.length ?? 0) < MAX_FILES) {
          const blob = await (await fetch(screenshot)).blob();
          // Name and type the file from the screenshot's actual mediatype, not a
          // hard-coded JPEG: the server persists the sniffed content type, and the
          // on-disk key's extension is derived from this filename, so a PNG sent as
          // screenshot.jpg would carry a mismatched extension.
          const mediaType = blob.type || 'image/jpeg';
          const ext = mediaType.split('/')[1] || 'jpg';
          form.append('files', new File([blob], `screenshot.${ext}`, { type: mediaType }));
        } else {
          toast.warning(t('new.screenshotDropped'));
        }
      }
      const { data } = await reporterApi.post<ReporterIssueDetail>('/issues', form);
      return data;
    },
    onSuccess: (issue) => {
      clearDiagnostics();
      queryClient.invalidateQueries({ queryKey: ['reporter', 'issues'] });
      toast.success(t('new.submitted', { ref: issue.referenceNo }));
      navigate(`/reporter/issues/${issue.id}`);
    },
  });

  if (!getHandoffToken()) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{t('new.noSession.title')}</AlertTitle>
        <AlertDescription>{t('new.noSession.body')}</AlertDescription>
      </Alert>
    );
  }

  const fileCount = files?.length ?? 0;
  const errorMessage = mutation.isError
    ? friendlyError(mutation.error, t('new.error.generic'))
    : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('new.title')}</CardTitle>
        <CardDescription>{t('new.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="space-y-5"
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="desc">{t('new.field.description')}</Label>
            <Textarea
              id="desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('new.field.descriptionPlaceholder')}
              className="min-h-36"
              minLength={10}
              maxLength={5000}
              required
            />
            <p className="text-xs text-muted-foreground">
              {t('new.field.counter', { count: description.length })}
            </p>
          </div>

          <SimilarIssuesPanel description={description} />

          <div className="space-y-2">
            <Label htmlFor="files">{t('new.attachments')}</Label>
            <Input
              id="files"
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp,application/pdf"
              onChange={(e) => {
                setFiles(e.target.files);
                setFileError(validateFiles(e.target.files, t));
              }}
            />
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Paperclip className="h-3 w-3" />
              {t('new.attachmentsHint')}
            </p>
            {/* The native control only ever names the first file ("3 files"),
                so list them — people need to confirm they picked the right ones. */}
            {fileCount > 0 && (
              <ul className="flex flex-wrap gap-1.5">
                {Array.from(files ?? []).map((f) => (
                  <li
                    key={`${f.name}-${f.size}`}
                    className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2 py-1 text-xs"
                  >
                    <Paperclip className="h-3 w-3 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="truncate">{f.name}</span>
                    <span className="shrink-0 text-muted-foreground tabular-nums">
                      {f.size < 1024 * 1024
                        ? `${Math.max(1, Math.round(f.size / 1024))} KB`
                        : `${(f.size / 1024 / 1024).toFixed(1)} MB`}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {fileError && <p className="text-xs text-destructive">{fileError}</p>}
          </div>

          {screenshot && (
            <div className="flex items-center gap-3 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-sm">
              <Dialog>
                <DialogTrigger asChild>
                  <button type="button" title={t('new.screenshot.dialogTitle')}>
                    <img src={screenshot} alt={t('new.screenshot.dialogTitle')} className="h-10 rounded border border-border object-cover" />
                  </button>
                </DialogTrigger>
                <DialogContent className="max-w-3xl">
                  <DialogHeader><DialogTitle>{t('new.screenshot.dialogTitle')}</DialogTitle></DialogHeader>
                  <img src={screenshot} alt={t('new.screenshot.dialogTitle')} className="max-h-[70vh] w-full rounded object-contain" />
                </DialogContent>
              </Dialog>
              <span>{t('new.screenshot.notice')}</span>
              <button
                type="button"
                className="ml-auto text-muted-foreground hover:text-destructive"
                title={t('new.screenshot.remove')}
                onClick={() => setScreenshot(null)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {diagnostics && (
            <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-sm">
              <ActivitySquare className="h-4 w-4 shrink-0 text-success" />
              <span>{t('new.diagnostics.notice')}</span>
              <Dialog>
                <DialogTrigger asChild>
                  <button type="button" className="text-primary hover:underline">{t('new.diagnostics.view')}</button>
                </DialogTrigger>
                <DialogContent className="max-h-[80vh] overflow-y-auto">
                  <DialogHeader><DialogTitle>{t('new.diagnostics.dialogTitle')}</DialogTitle></DialogHeader>
                  <DiagnosticsView context={diagnostics} />
                </DialogContent>
              </Dialog>
              <button
                type="button"
                className="ml-auto text-muted-foreground hover:text-destructive"
                title={t('new.diagnostics.remove')}
                onClick={() => { setDiagnostics(null); clearDiagnostics(); }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {mutation.isError && (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={mutation.isPending || description.length < 10 || Boolean(fileError)}>
            {mutation.isPending && <Spinner />}
            {mutation.isPending ? t('new.submitting') : t('new.submit')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
