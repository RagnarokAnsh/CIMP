// Reporter hand-off token handling. The portal embeds this app and supplies the
// signed token either as a `?handoff=` query param or via postMessage. We keep
// it in sessionStorage and send it as X-Handoff-Token on every reporter request.

const KEY = 'handoff_token';

export function captureHandoffToken(): void {
  const url = new URL(window.location.href);
  const fromQuery = url.searchParams.get('handoff');
  if (fromQuery) {
    sessionStorage.setItem(KEY, fromQuery);
    url.searchParams.delete('handoff');
    window.history.replaceState({}, '', url.toString());
  }

  // Portals may also hand off via postMessage: { type: 'handoff', token }.
  window.addEventListener('message', (e) => {
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
