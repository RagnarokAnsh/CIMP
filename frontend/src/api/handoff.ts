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

export function captureHandoffToken(): void {
  const url = new URL(window.location.href);
  const fromQuery = url.searchParams.get('handoff');
  if (fromQuery) {
    sessionStorage.setItem(KEY, fromQuery);
    url.searchParams.delete('handoff');
    window.history.replaceState({}, '', url.toString());
  }

  // Portals may also hand off via postMessage: { type: 'handoff', token }.
  // Only accept it from an allow-listed origin — otherwise any page that embeds
  // or opens this app could inject a token for another organization.
  window.addEventListener('message', (e) => {
    if (!allowedOrigins.has(e.origin)) return;
    if (e.data?.type === 'handoff' && typeof e.data.token === 'string') {
      sessionStorage.setItem(KEY, e.data.token);
    }
  });
}

export function getHandoffToken(): string | null {
  return sessionStorage.getItem(KEY);
}

export function setHandoffToken(token: string): void {
  sessionStorage.setItem(KEY, token);
}

export function clearHandoffToken(): void {
  sessionStorage.removeItem(KEY);
}
