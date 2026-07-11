import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ActivitySquare, Paperclip, X } from 'lucide-react';
import { toast } from 'sonner';
import { reporterApi } from '@/api/client';
import { getHandoffToken } from '@/api/handoff';
import { clearDiagnostics, loadDiagnostics } from '@/api/diagnostics';
import type { ReporterIssueDetail } from '@/api/types';
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
    if (!ALLOWED_MIME_TYPES.includes(f.type)) {
      return `"${f.name}" is not a supported type (PNG, JPEG, WEBP, PDF).`;
    }
    if (f.size > MAX_FILE_BYTES) {
      return `"${f.name}" is larger than 10 MB.`;
    }
  }
  return null;
}

export function NewIssuePage() {
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<FileList | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  // Diagnostics handed over by the portal's SDK (from the URL fragment) —
  // shown to the reporter, removable, sent only if still attached on submit.
  const [diagnostics, setDiagnostics] = useState<Record<string, unknown> | null>(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    void loadDiagnostics().then(setDiagnostics);
  }, []);

  const mutation = useMutation({
    mutationFn: async () => {
      const form = new FormData();
      form.append('description', description);
      if (diagnostics) form.append('context', JSON.stringify(diagnostics));
      if (files) Array.from(files).forEach((f) => form.append('files', f));
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
              {fileCount > 0 && <span className="text-foreground">· {fileCount} selected</span>}
            </p>
            {fileError && <p className="text-xs text-destructive">{fileError}</p>}
          </div>

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
