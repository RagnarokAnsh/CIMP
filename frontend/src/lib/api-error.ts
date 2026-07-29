import type { AxiosError } from 'axios';

// One place that turns any API failure into text a person can act on.
//
// Two rules:
//  1. For DOMAIN statuses (400/404/409/422) the server's message is specific and
//     user-meaningful ("Cannot transition from RESOLVED to NEW.", validation
//     lists) — prefer it.
//  2. For everything else (429, 5xx, no-response) the raw body is a class name,
//     generic, or absent, so we substitute a friendly, actionable default.
// A class-name-prefixed message ("ThrottlerException: Too Many Requests") is
// never shown: it is either replaced by rule 2 or stripped as defence-in-depth.

// Statuses the global axios interceptors (api/client.ts) already surface once,
// deduped. Per-call handlers consult this so we never stack a second toast.
export const GLOBALLY_TOASTED = new Set([401, 403, 429]);

export function httpStatus(e: unknown): number | undefined {
  return (e as AxiosError | undefined)?.response?.status;
}

// The server's message (class-validator returns a string[]), cleaned up. Drops a
// leading "SomethingException: " that a raw HttpException name can leave behind.
function serverMessage(e: unknown): string | undefined {
  const raw = (e as AxiosError<{ message?: string | string[] }> | undefined)?.response?.data?.message;
  const joined = Array.isArray(raw) ? raw.filter(Boolean).join(' ') : raw;
  if (typeof joined !== 'string') return undefined;
  const cleaned = joined.replace(/^[A-Za-z]*Exception:\s*/, '').trim();
  return cleaned || undefined;
}

// Friendly defaults keyed by status. 0 = the request never got a response
// (offline, DNS, CORS, timeout) — axios leaves `response` undefined.
const STATUS_TEXT: Record<number, string> = {
  0: "Can't reach the server — check your connection and try again.",
  400: 'Something about that request was invalid. Please check and try again.',
  401: 'Your session has expired. Please sign in again.',
  403: "You don't have access to that.",
  404: "That couldn't be found — it may have been moved or deleted.",
  408: 'The request timed out. Please try again.',
  409: 'This was changed elsewhere. Reload and try again.',
  413: 'That upload is too large.',
  422: "That action isn't allowed right now.",
  429: "You're doing that a little too fast — wait a moment and try again.",
  500: 'Something went wrong on our end. Please try again in a moment.',
  502: 'The server is unreachable right now. Please try again shortly.',
  503: 'The service is temporarily unavailable. Please try again shortly.',
  504: 'The server took too long to respond. Please try again.',
};

// Statuses whose server message is worth more than our generic default.
const PREFER_SERVER_MESSAGE = new Set([400, 404, 409, 422]);

/**
 * Best user-facing string for an API error. Pass a `fallback` for the
 * "unknown status, no server message" case (defaults to a generic line).
 */
export function friendlyError(e: unknown, fallback = 'Something went wrong. Please try again.'): string {
  const status = httpStatus(e) ?? 0; // 0 → no response reached us
  const server = serverMessage(e);
  if (PREFER_SERVER_MESSAGE.has(status) && server) return server;
  return STATUS_TEXT[status] ?? server ?? fallback;
}
