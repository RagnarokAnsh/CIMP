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

// Staff API: authenticated by an OIDC bearer token. The token getter is set
// once the auth provider is ready (see staff/auth.tsx).
let staffTokenGetter: () => string | undefined = () => undefined;
export function setStaffTokenGetter(fn: () => string | undefined): void {
  staffTokenGetter = fn;
}
// The current staff token (used by the SSE client, which can't send headers).
export function getStaffToken(): string | undefined {
  return staffTokenGetter();
}

// Called when a staff request comes back 401 (expired/invalid session). The auth
// provider (OIDC or dev shim) registers a handler that signs the user out so the
// gate re-prompts instead of leaving the UI in a broken, silently-failing state.
let staffUnauthorizedHandler: () => void = () => {};
export function setStaffUnauthorizedHandler(fn: () => void): void {
  staffUnauthorizedHandler = fn;
}

export const staffApi = axios.create({ baseURL: '/api' });
staffApi.interceptors.request.use((config) => {
  const token = staffTokenGetter();
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
    }
    return Promise.reject(error);
  },
);
