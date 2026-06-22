import { useEffect, useState } from 'react';
import type { AxiosInstance } from 'axios';
import { Download, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { AttachmentPreview } from '@/components/AttachmentPreview';
import { downloadFile } from '@/lib/download';

export interface GalleryAttachment {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  servable: boolean;
  scanLabel?: string; // shown when not servable (e.g. "PENDING")
}

// Renders attachments inline like Jira: images show as actual thumbnails
// (click to enlarge), PDFs/other files show as a chip with download. Bytes are
// fetched through the authenticated axios client, so a plain <img src> (which
// can't send the auth header) won't work — we fetch a blob and use an object URL.
export function AttachmentGallery({
  attachments, api, urlFor,
}: {
  attachments: GalleryAttachment[];
  api: AxiosInstance;
  urlFor: (a: GalleryAttachment) => string;
}) {
  const [zoom, setZoom] = useState<GalleryAttachment | null>(null);

  if (attachments.length === 0) return null;

  return (
    <>
      {zoom && (
        <AttachmentPreview
          open={Boolean(zoom)}
          onOpenChange={(o) => { if (!o) setZoom(null); }}
          api={api}
          url={urlFor(zoom)}
          filename={zoom.filename}
          contentType={zoom.contentType}
        />
      )}
      <div className="flex flex-wrap gap-3">
        {attachments.map((a) => {
          const isImage = a.contentType.startsWith('image/');
          if (a.servable && isImage) {
            return (
              <InlineImage
                key={a.id}
                api={api}
                url={urlFor(a)}
                alt={a.filename}
                onClick={() => setZoom(a)}
              />
            );
          }
          return (
            <div
              key={a.id}
              className="flex w-56 items-center gap-2 rounded-md border border-border bg-card p-2 text-sm"
            >
              <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1">
                <span className="block truncate" title={a.filename}>{a.filename}</span>
                <span className="text-xs text-muted-foreground">{Math.round(a.sizeBytes / 1024)} KB</span>
              </span>
              {!a.servable ? (
                <Badge variant="outline" className="text-muted-foreground">{a.scanLabel ?? 'pending'}</Badge>
              ) : a.contentType === 'application/pdf' ? (
                <Button variant="ghost" size="icon-sm" aria-label={`Preview ${a.filename}`} onClick={() => setZoom(a)}>
                  <FileText className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label={`Download ${a.filename}`}
                  onClick={() => downloadFile(api, urlFor(a), a.filename)}
                >
                  <Download className="h-4 w-4" />
                </Button>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

// Fetches an image attachment as a blob and renders it inline as a clickable
// thumbnail.
function InlineImage({
  api, url, alt, onClick,
}: {
  api: AxiosInstance;
  url: string;
  alt: string;
  onClick: () => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let objectUrl: string | null = null;
    let active = true;
    api
      .get(url, { responseType: 'blob' })
      .then((res) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(res.data as Blob);
        setSrc(objectUrl);
      })
      .catch(() => active && setFailed(true));
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [url, api]);

  if (failed) {
    return (
      <div className="flex h-32 w-40 items-center justify-center rounded-md border border-border bg-muted text-xs text-muted-foreground">
        Preview unavailable
      </div>
    );
  }
  if (!src) return <Skeleton className="h-32 w-40 rounded-md" />;

  return (
    <button
      type="button"
      onClick={onClick}
      title={`${alt} — click to enlarge`}
      className="group relative h-32 w-40 overflow-hidden rounded-md border border-border bg-muted transition-shadow hover:shadow-md"
    >
      <img src={src} alt={alt} className="h-full w-full object-cover" />
      <span className="absolute inset-x-0 bottom-0 truncate bg-black/55 px-1.5 py-0.5 text-left text-[10px] text-white">
        {alt}
      </span>
    </button>
  );
}
