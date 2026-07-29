// Reporter hand-off token handling. The portal embeds this app and supplies the
// signed token either as a `?handoff=` query param or via postMessage. We keep
// it in sessionStorage and send it as X-Handoff-Token on every reporter request.

const KEY = 'handoff_token';

// Origins allowed to deliver a token via postMessage. Configure
// VITE_PORTAL_ORIGINS as a comma-separated list (e.g. the portal's URL). Same
// origin is always trusted. If unset, postMessage hand-off is refused — query
// param hand-off (which is origin-bound to this app) still works.
const allowedOrigins = new Set(
  [
    window.location.origin,
    ...(import.meta.env.VITE_PORTAL_ORIGINS ?? '')
      .split(',')
      .map((o: string) => o.trim())
      .filter(Boolean),
  ],
);

// Notified whenever the stored token is replaced by a *different* one, or
// dropped. Wired to queryClient.clear() in main.tsx.
type IdentityChangeHandler = () => void;
let onIdentityChange: IdentityChangeHandler | null = null;

// Single write path for the token, so every route in (query param, postMessage,
// direct set) reports an identity change the same way. This matters because the
// postMessage hand-off swaps the token in place with no page load: without it,
// the previous reporter's cached issue list stays on screen for the next one.
function storeToken(token: string): void {
  const previous = sessionStorage.getItem(KEY);
  sessionStorage.setItem(KEY, token);
  if (previous !== null && previous !== token) onIdentityChange?.();
}

export function captureHandoffToken(handleIdentityChange?: IdentityChangeHandler): void {
  onIdentityChange = handleIdentityChange ?? null;

  const url = new URL(window.location.href);
  const fromQuery = url.searchParams.get('handoff');
  if (fromQuery) {
    storeToken(fromQuery);
    url.searchParams.delete('handoff');
    window.history.replaceState({}, '', url.toString());
  }

  // Portals may also hand off via postMessage: { type: 'handoff', token }.
  // Only accept it from an allow-listed origin — otherwise any page that embeds
  // or opens this app could inject a token for another organization.
  window.addEventListener('message', (e) => {
    if (!allowedOrigins.has(e.origin)) return;
    if (e.data?.type === 'handoff' && typeof e.data.token === 'string') {
      storeToken(e.data.token);
    }
  });
}

export function getHandoffToken(): string | null {
  return sessionStorage.getItem(KEY);
}

export function setHandoffToken(token: string): void {
  storeToken(token);
}

export function clearHandoffToken(): void {
  const had = sessionStorage.getItem(KEY) !== null;
  sessionStorage.removeItem(KEY);
  // An expired session must not leave the previous reporter's data readable.
  if (had) onIdentityChange?.();
}
