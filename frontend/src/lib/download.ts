import type { AxiosInstance } from 'axios';

// Downloads a file through an axios instance so the auth interceptor attaches the
// staff bearer / reporter hand-off token (a plain <a href> download cannot send
// those headers). Falls back to the server-provided filename when present.
export async function downloadFile(
  api: AxiosInstance,
  url: string,
  fallbackName: string,
): Promise<void> {
  const res = await api.get(url, { responseType: 'blob' });
  const blob = res.data as Blob;

  const disp = res.headers['content-disposition'] as string | undefined;
  const name = filenameFromDisposition(disp) ?? fallbackName;

  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(href);
}

// The backend emits `attachment; filename="ascii"; filename*=UTF-8''pct` (see
// src/common/content-disposition.ts). Matching both forms in one alternation was
// broken: plain `filename=` comes FIRST in the header, so it always won and the
// RFC-5987 group was never populated — "rapport-café.pdf" arrived as the mangled
// ASCII fallback "rapport-cafe_.pdf". Try the UTF-8 parameter on its own first,
// and only fall back to the ASCII one.
function filenameFromDisposition(disp: string | undefined): string | undefined {
  if (!disp) return undefined;
  const utf8 = disp.match(/filename\*=UTF-8''([^;]+)/i);
  if (utf8) return decodeFilename(utf8[1].trim());
  // RFC 6266: the plain parameter is a literal name, never percent-encoded, so
  // decoding it would corrupt a filename that genuinely contains "%20".
  const plain = disp.match(/filename="([^"]+)"/i);
  return plain ? plain[1] : undefined;
}

// Filenames are reporter-controlled. A name carrying a literal '%' ("50%off.png")
// reaches decodeURIComponent as an invalid escape and throws URIError, which used
// to reject out of downloadFile and kill the download button with no message at
// all. An undecodable value simply wasn't encoded — use it verbatim.
function decodeFilename(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
