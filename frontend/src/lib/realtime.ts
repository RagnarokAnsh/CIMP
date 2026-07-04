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
    const token = getStaffToken();
    if (!token) return;

    let es: EventSource | null = null;
    let stopped = false;
    let retry: ReturnType<typeof setTimeout> | null = null;

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
      retry = setTimeout(connect, 3000);
    };

    async function connect() {
      if (stopped) return;
      try {
        const res = await fetch('/api/staff/events/ticket', {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) return scheduleReconnect();
        const { ticket } = (await res.json()) as { ticket: string };
        if (stopped) return;
        es = new EventSource(`/api/staff/events?ticket=${encodeURIComponent(ticket)}`);
        es.onmessage = handleMessage;
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
