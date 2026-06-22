import { useEffect, useState } from 'react';
import type { AxiosInstance } from 'axios';
import { Download } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { downloadFile } from '@/lib/download';

// Inline preview for an access-controlled attachment. Fetches the bytes through
// the authenticated axios instance (so the bearer/hand-off token is attached),
// then renders images inline and PDFs in an iframe; anything else falls back to a
// download button. The blob URL is revoked when the dialog closes.
export function AttachmentPreview({
  open, onOpenChange, api, url, filename, contentType,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  api: AxiosInstance;
  url: string;
  filename: string;
  contentType: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isImage = contentType.startsWith('image/');
  const isPdf = contentType === 'application/pdf';

  useEffect(() => {
    if (!open) return;
    let objectUrl: string | null = null;
    setLoading(true);
    setError(null);
    setSrc(null);
    api
      .get(url, { responseType: 'blob' })
      .then((res) => {
        objectUrl = URL.createObjectURL(res.data as Blob);
        setSrc(objectUrl);
      })
      .catch(() => setError('Could not load this attachment.'))
      .finally(() => setLoading(false));
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [open, url, api]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle className="truncate pr-8">{filename}</DialogTitle>
        </DialogHeader>
        <div className="flex min-h-[300px] items-center justify-center">
          {loading && <Spinner className="h-6 w-6 text-muted-foreground" />}
          {error && <p className="text-sm text-destructive">{error}</p>}
          {src && isImage && (
            <img src={src} alt={filename} className="max-h-[70vh] max-w-full rounded-md" />
          )}
          {src && isPdf && (
            <iframe src={src} title={filename} className="h-[70vh] w-full rounded-md border border-border" />
          )}
          {src && !isImage && !isPdf && (
            <div className="space-y-3 text-center">
              <p className="text-sm text-muted-foreground">No inline preview for this file type.</p>
              <Button onClick={() => downloadFile(api, url, filename)}>
                <Download className="h-4 w-4" /> Download
              </Button>
            </div>
          )}
        </div>
        {src && (isImage || isPdf) && (
          <div className="flex justify-end">
            <Button variant="outline" size="sm" onClick={() => downloadFile(api, url, filename)}>
              <Download className="h-4 w-4" /> Download
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
