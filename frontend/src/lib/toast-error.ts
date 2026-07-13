import { toast } from 'sonner';

// The one way we surface API mutation failures: the server's message (which
// may be a class-validator string array), or a generic fallback. Deliberately
// single-parameter so it can be passed directly as a TanStack `onError`
// without its extra params polluting the mutation's variables inference.
export function toastApiError(e?: unknown): void {
  const msg = (e as any)?.response?.data?.message ?? 'Action failed.';
  toast.error(Array.isArray(msg) ? msg.join(' ') : msg);
}
