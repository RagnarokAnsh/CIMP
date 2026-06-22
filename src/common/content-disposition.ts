// RFC 6266 / 5987 Content-Disposition for downloads. Filenames are
// reporter-controlled, so an ASCII fallback (quotes + control chars stripped)
// plus a UTF-8 encoded `filename*` prevents header/quote injection while
// preserving non-ASCII names.
export function contentDisposition(filename: string): string {
  const ascii = filename.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
  const encoded = encodeURIComponent(filename);
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encoded}`;
}
