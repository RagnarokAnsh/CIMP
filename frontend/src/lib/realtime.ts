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
// bell update live (replacing slow polling). EventSource auto-reconnects, so a
// brief drop self-heals; the bell keeps a long poll as a backstop.
export function useStaffRealtime(): void {
  const queryClient = useQueryClient();

  useEffect(() => {
    const token = getStaffToken();
    if (!token) return;

    // EventSource can't set headers, so the token rides as a query param.
    const url = `/api/staff/events?access_token=${encodeURIComponent(token)}`;
    const es = new EventSource(url);

    es.onmessage = (msg) => {
      let evt: RealtimeEvent;
      try {
        evt = JSON.parse(msg.data);
      } catch {
        return;
      }
      if (!evt.type || evt.type === 'ping') return;

      // Any issue/comment event freshens the bell and the list/board views…
      queryClient.invalidateQueries({ queryKey: ['staff', 'notifications'] });
      queryClient.invalidateQueries({ queryKey: ['staff', 'issues'] });
      queryClient.invalidateQueries({ queryKey: ['staff', 'board'] });
      queryClient.invalidateQueries({ queryKey: ['staff', 'dashboard'] });
      // …and the specific issue detail when we know which one.
      if (evt.issueId) {
        queryClient.invalidateQueries({ queryKey: ['staff', 'issue', evt.issueId] });
      }
    };

    return () => es.close();
    // Re-open if the token changes (e.g. sign-in/out).
  }, [queryClient]);
}
