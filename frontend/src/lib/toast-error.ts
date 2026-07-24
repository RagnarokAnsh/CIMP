import { toast } from 'sonner';

// The one way we surface API mutation failures: the server's message (which
// may be a class-validator string array), or a generic fallback. Deliberately
// single-parameter so it can be passed directly as a TanStack `onError`
// without its extra params polluting the mutation's variables inference.
export function toastApiError(e?: unknown): void {
  const msg = (e as any)?.response?.data?.message ?? 'Action failed.';
  toast.error(Array.isArray(msg) ? msg.join(' ') : msg);
}

// The 409 dance, previously written out identically in IssueDetailPanel, BoardPage
// and TriagePage: a 409 means our optimistic-lock version is stale, so we have to
// refetch before the user retries or the retry conflicts on the same version
// forever. Pass the refetch; everything else falls through to toastApiError.
// Curry-free and single-purpose so it drops straight into a TanStack `onError`:
//   onError: (e) => toastMutationError(e, refresh)
export function toastMutationError(e: unknown, onConflict?: () => void): void {
  if ((e as any)?.response?.status === 409) {
    onConflict?.();
    toast.error('This changed elsewhere — reloaded, try again.');
    return;
  }
  toastApiError(e);
}
