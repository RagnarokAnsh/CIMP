import { toast } from 'sonner';
import { friendlyError, httpStatus, GLOBALLY_TOASTED } from './api-error';

// The one way we surface API mutation failures: a human-readable line derived
// from the status + server message (see api-error.ts). Deliberately
// single-parameter so it can be passed directly as a TanStack `onError` without
// its extra params polluting the mutation's variables inference.
export function toastApiError(e?: unknown): void {
  // 401/403/429 are already surfaced once (deduped) by the global interceptor in
  // api/client.ts — don't stack a second toast on top of them.
  if (GLOBALLY_TOASTED.has(httpStatus(e) ?? -1)) return;
  toast.error(friendlyError(e, 'Action failed.'));
}

// The 409 dance, previously written out identically in IssueDetailPanel, BoardPage
// and TriagePage: a 409 means our optimistic-lock version is stale, so we have to
// refetch before the user retries or the retry conflicts on the same version
// forever. Pass the refetch; everything else falls through to toastApiError.
// Curry-free and single-purpose so it drops straight into a TanStack `onError`:
//   onError: (e) => toastMutationError(e, refresh)
export function toastMutationError(e: unknown, onConflict?: () => void): void {
  if (httpStatus(e) === 409) {
    onConflict?.();
    toast.error('This changed elsewhere — reloaded, try again.');
    return;
  }
  toastApiError(e);
}
