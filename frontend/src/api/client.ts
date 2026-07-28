import axios, { AxiosError } from 'axios';
import { toast } from 'sonner';
import { getHandoffToken, clearHandoffToken } from './handoff';

// Reporter API: authenticated by the portal hand-off token.
export const reporterApi = axios.create({ baseURL: '/api/reporter' });
reporterApi.interceptors.request.use((config) => {
  const token = getHandoffToken();
  if (token) config.headers['X-Handoff-Token'] = token;
  return config;
});

// Staff API: authenticated by the self-issued HS256 JWT from POST /api/auth/login
// (there is no external IdP). The token getter is registered once the staff app
// mounts (see staff/local-auth.tsx).
let staffTokenGetter: () => string | undefined = () => undefined;
export function setStaffTokenGetter(fn: () => string | undefined): void {
  staffTokenGetter = fn;
}

// Where staff/local-auth.tsx persists the session. Exported so there is one
// spelling of the key rather than a literal in each module.
export const STAFF_TOKEN_STORAGE_KEY = 'staff_token';

// Resolve the token, falling back to sessionStorage when the registered getter
// has nothing. The fallback is not belt-and-braces — it is load-bearing: this
// module can end up with TWO instances, because Vite serves a re-transformed
// module under a distinct URL (`client.ts` and `client.ts?t=…` are separate
// registry entries, each with its own `staffTokenGetter`). When that happens the
// components holding the second copy send unauthenticated requests and 401 while
// their siblings succeed in the same tick — which is exactly how `/staff/me` and
// `/staff/notifications` failed while `/staff/issues` worked. sessionStorage is
// shared by construction, so it cannot desync between instances.
function currentStaffToken(): string | undefined {
  const fromGetter = staffTokenGetter();
  if (fromGetter) return fromGetter;
  return sessionStorage.getItem(STAFF_TOKEN_STORAGE_KEY) ?? undefined;
}

// The current staff token (used by the SSE client, which can't send headers).
export function getStaffToken(): string | undefined {
  return currentStaffToken();
}

// Called when a staff request comes back 401 (expired/invalid session). The staff
// app (staff/local-auth.tsx) registers a handler that signs the user out so the
// gate re-prompts instead of leaving the UI in a broken, silently-failing state.
let staffUnauthorizedHandler: () => void = () => {};
export function setStaffUnauthorizedHandler(fn: () => void): void {
  staffUnauthorizedHandler = fn;
}

export const staffApi = axios.create({ baseURL: '/api' });
staffApi.interceptors.request.use((config) => {
  const token = currentStaffToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Dedupe auth toasts: a page typically fires several queries at once, so a single
// expired session would otherwise stack identical toasts.
let lastAuthToastAt = 0;
function authToast(message: string): void {
  const now = Date.now();
  if (now - lastAuthToastAt < 3000) return;
  lastAuthToastAt = now;
  toast.error(message);
}

// 409 (optimistic-lock conflict) is intentionally passed through untouched so the
// per-mutation handlers can refresh and retry. We only globally handle the auth
// failures that components can't meaningfully recover from.
staffApi.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    const status = error.response?.status;
    if (status === 401) {
      authToast('Your session has expired. Please sign in again.');
      staffUnauthorizedHandler();
    } else if (status === 403) {
      authToast("You don't have access to that.");
    } else if (status === 429) {
      authToast("You're doing that a little too fast — wait a moment and try again.");
    }
    return Promise.reject(error);
  },
);

reporterApi.interceptors.response.use(
  (res) => res,
  (error: AxiosError) => {
    const status = error.response?.status;
    if (status === 401) {
      // The portal hand-off token is missing/expired — drop it so a fresh one is
      // required, and tell the reporter to reopen from the portal.
      clearHandoffToken();
      authToast('Your support session has expired. Please reopen support from your portal.');
    } else if (status === 403) {
      authToast("You don't have access to that.");
    } else if (status === 429) {
      authToast("You're sending requests too quickly — wait a moment and try again.");
    }
    return Promise.reject(error);
  },
);
