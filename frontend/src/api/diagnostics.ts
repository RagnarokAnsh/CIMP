// SDK diagnostics hand-off. The cimp-connect buttons append `#cimpctx=<payload>`
// to the reporter URL — a FRAGMENT, so it never reaches any server or log. We
// grab it at boot, stash the raw payload in sessionStorage, and strip the hash;
// the New Issue form decodes it lazily and lets the reporter inspect/remove it
// before it's submitted alongside the report.
//
// Payload format (see cimp-connect src/diagnostics.ts):
//   1.<base64url(gzip(json))>  — normal path
//   0.<base64url(utf8 json)>   — CompressionStream-less browsers

const KEY = 'cimp_diag_ctx';

export function captureDiagnosticsFragment(): void {
  const hash = window.location.hash;
  const m = hash.match(/[#&]cimpctx=([^&]+)/);
  if (!m) return;
  sessionStorage.setItem(KEY, m[1]);
  // Strip only our parameter — '#cimpctx=x&b=2' must keep '#b=2'.
  let stripped = hash.replace(/[#&]cimpctx=[^&]+/, '');
  if (stripped && !stripped.startsWith('#')) stripped = `#${stripped.replace(/^&/, '')}`;
  if (stripped === '#') stripped = '';
  window.history.replaceState({}, '', window.location.pathname + window.location.search + stripped);
}

function base64UrlDecode(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64.padEnd(b64.length + ((4 - (b64.length % 4)) % 4), '='));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function gunzip(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Response(stream).text();
}

/** Decode the stashed diagnostics, or null when absent/undecodable. */
export async function loadDiagnostics(): Promise<Record<string, unknown> | null> {
  const raw = sessionStorage.getItem(KEY);
  if (!raw) return null;
  try {
    const dot = raw.indexOf('.');
    const kind = raw.slice(0, dot);
    const bytes = base64UrlDecode(raw.slice(dot + 1));
    const json = kind === '1' ? await gunzip(bytes) : new TextDecoder().decode(bytes);
    const parsed = JSON.parse(json);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
    return parsed as Record<string, unknown>;
  } catch {
    clearDiagnostics(); // corrupt payloads shouldn't wedge the form forever
    return null;
  }
}

export function clearDiagnostics(): void {
  sessionStorage.removeItem(KEY);
}
