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

function validateFiles(files: FileList | null): string | null {
  if (!files || files.length === 0) return null;
  if (files.length > MAX_FILES) return `At most ${MAX_FILES} files may be attached.`;
  for (const f of Array.from(files)) {
    // Only reject a type the browser positively identified as unsupported.
    // File.type is '' for plenty of real files, and the server is the authority
    // regardless — it sniffs the actual magic bytes (ReporterService.validateFiles)
    // rather than trusting this header, so blocking an unknown type here would
    // reject valid uploads the server would have accepted.
    if (f.type && !ALLOWED_MIME_TYPES.includes(f.type)) {
      return `"${f.name}" is not a supported type (PNG, JPEG, WEBP, PDF).`;
    }
    if (f.size > MAX_FILE_BYTES) {
      return `"${f.name}" is larger than 10 MB.`;
    }
  }
  return null;
}

// "Looks like this is already being tracked" — privacy-safe matches for the
// draft description (status/age/count only), each with a one-click subscribe.
function SimilarIssuesPanel({ description }: { description: string }) {
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
      toast.success("You'll be notified when it's resolved.");
    },
    onError: (e) => toastApiError(e),
  });

  if (dismissed || !matches || matches.length === 0) return null;

  return (
    <Alert>
      <AlertTitle className="flex items-center justify-between">
        This might already be tracked
        <button type="button" className="text-xs font-normal text-muted-foreground hover:underline" onClick={() => setDismissed(true)}>
          dismiss
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
                  {m.title ?? (i === 0 ? 'Closest match' : `Similar report #${i + 1}`)}
                </span>
                <span className="block text-xs text-muted-foreground">
                  first reported {relativeTime(m.firstReportedAt)} · {m.reportCount} report{m.reportCount === 1 ? '' : 's'}
                </span>
              </span>
              {subscribedTokens.has(m.subscribeToken) ? (
                <span className={cn('shrink-0', TEXT_TONE.success)}>✓ You&apos;ll be notified</span>
              ) : (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="shrink-0"
                  disabled={subscribe.isPending}
                  onClick={() => subscribe.mutate(m.subscribeToken)}
                >
                  Notify me instead
                </Button>
              )}
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted-foreground">
          If yours is different, just continue with the form below.
        </p>
      </AlertDescription>
    </Alert>
  );
}

export function NewIssuePage() {
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
          toast.warning('Screenshot not attached — the file limit is already used by your attachments.');
        }
      }
      const { data } = await reporterApi.post<ReporterIssueDetail>('/issues', form);
      return data;
    },
    onSuccess: (issue) => {
      clearDiagnostics();
      queryClient.invalidateQueries({ queryKey: ['reporter', 'issues'] });
      toast.success(`Issue ${issue.referenceNo} submitted.`);
      navigate(`/reporter/issues/${issue.id}`);
    },
  });

  if (!getHandoffToken()) {
    return (
      <Alert variant="destructive">
        <AlertTitle>No portal session</AlertTitle>
        <AlertDescription>Open this page from your portal to raise an issue.</AlertDescription>
      </Alert>
    );
  }

  const fileCount = files?.length ?? 0;
  const errorMessage = (mutation.error as any)?.response?.data?.message;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Raise an issue</CardTitle>
        <CardDescription>
          Tell us what's wrong. Attach screenshots or documents if they help.
        </CardDescription>
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
            <Label htmlFor="desc">What's wrong?</Label>
            <Textarea
              id="desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe the problem in as much detail as you can…"
              className="min-h-36"
              minLength={10}
              maxLength={5000}
              required
            />
            <p className="text-xs text-muted-foreground">
              {description.length}/5000 — at least 10 characters.
            </p>
          </div>

          <SimilarIssuesPanel description={description} />

          <div className="space-y-2">
            <Label htmlFor="files">Attachments (optional)</Label>
            <Input
              id="files"
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp,application/pdf"
              onChange={(e) => {
                setFiles(e.target.files);
                setFileError(validateFiles(e.target.files));
              }}
            />
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Paperclip className="h-3 w-3" />
              Up to 5 files, 10&nbsp;MB each. PNG, JPEG, WEBP, PDF.
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
                  <button type="button" title="View screenshot">
                    <img src={screenshot} alt="Screenshot to attach" className="h-10 rounded border border-border object-cover" />
                  </button>
                </DialogTrigger>
                <DialogContent className="max-w-3xl">
                  <DialogHeader><DialogTitle>Screenshot to be attached</DialogTitle></DialogHeader>
                  <img src={screenshot} alt="Screenshot" className="max-h-[70vh] w-full rounded object-contain" />
                </DialogContent>
              </Dialog>
              <span>A screenshot from your app will be attached.</span>
              <button
                type="button"
                className="ml-auto text-muted-foreground hover:text-destructive"
                title="Remove screenshot"
                onClick={() => setScreenshot(null)}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {diagnostics && (
            <div className="flex items-center gap-2 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-sm">
              <ActivitySquare className="h-4 w-4 shrink-0 text-emerald-500" />
              <span>Technical diagnostics from your app will be included.</span>
              <Dialog>
                <DialogTrigger asChild>
                  <button type="button" className="text-primary hover:underline">view</button>
                </DialogTrigger>
                <DialogContent className="max-h-[80vh] overflow-y-auto">
                  <DialogHeader><DialogTitle>Diagnostics to be sent</DialogTitle></DialogHeader>
                  <DiagnosticsView context={diagnostics} />
                </DialogContent>
              </Dialog>
              <button
                type="button"
                className="ml-auto text-muted-foreground hover:text-destructive"
                title="Remove diagnostics"
                onClick={() => { setDiagnostics(null); clearDiagnostics(); }}
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          )}

          {mutation.isError && (
            <Alert variant="destructive">
              <AlertDescription>{errorMessage ?? 'Submission failed. Please try again.'}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" disabled={mutation.isPending || description.length < 10 || Boolean(fileError)}>
            {mutation.isPending && <Spinner />}
            {mutation.isPending ? 'Submitting…' : 'Submit issue'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
