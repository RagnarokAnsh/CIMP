import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getStaffToken } from '@/api/client';

interface RealtimeEvent {
  type: string;
  issueId?: string;
  platformId?: string;
}

// Subscribes the staff workspace to the server's SSE stream and invalidates the
// affected TanStack Query caches so the board, lists, detail, and notification
// bell update live (replacing slow polling).
//
// Auth: EventSource can't set headers, so instead of putting the 8h session JWT
// in the URL, we POST for a short-lived SSE ticket (bearer header) and connect
// with that. On any error we fetch a fresh ticket and reconnect, so an expired
// ticket self-heals without ever exposing the session token in a URL/log.
export function useStaffRealtime(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    let es: EventSource | null = null;
    let stopped = false;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let backoff = 3_000; // starts at 3s, doubles on failure, caps at 30s

    const handleMessage = (msg: MessageEvent) => {
      let evt: RealtimeEvent;
      try {
        evt = JSON.parse(msg.data);
      } catch {
        return;
      }
      if (!evt.type || evt.type === 'ping') return;

      queryClient.invalidateQueries({ queryKey: ['staff', 'notifications'] });
      queryClient.invalidateQueries({ queryKey: ['staff', 'issues'] });
      queryClient.invalidateQueries({ queryKey: ['staff', 'board'] });
      queryClient.invalidateQueries({ queryKey: ['staff', 'dashboard'] });
      if (evt.issueId) {
        queryClient.invalidateQueries({ queryKey: ['staff', 'issue', evt.issueId] });
      }
    };

    const scheduleReconnect = () => {
      if (stopped) return;
      retry = setTimeout(connect, backoff);
      backoff = Math.min(backoff * 2, 30_000);
    };

    async function connect() {
      if (stopped) return;
      // Re-read the token on every reconnect so a refreshed session is picked up.
      const token = getStaffToken();
      if (!token) {
        // No session token — user signed out or token was cleared. Stop retrying.
        return;
      }
      try {
        const res = await fetch('/api/staff/events/ticket', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
          if (res.status === 401) {
            // Session expired — stop retrying; the auth interceptor will
            // handle sign-out and re-prompt.
            return;
          }
          return scheduleReconnect();
        }
        const { ticket } = (await res.json()) as { ticket: string };
        if (stopped) return;
        es = new EventSource(`/api/staff/events?ticket=${encodeURIComponent(ticket)}`);
        es.onmessage = handleMessage;
        es.onopen = () => {
          // Connection succeeded — reset backoff for the next failure.
          backoff = 3_000;
        };
        es.onerror = () => {
          es?.close();
          es = null;
          scheduleReconnect(); // ticket likely expired / connection dropped
        };
      } catch {
        scheduleReconnect();
      }
    }

    connect();
    return () => {
      stopped = true;
      if (retry) clearTimeout(retry);
      es?.close();
    };
  }, [queryClient]);
}
