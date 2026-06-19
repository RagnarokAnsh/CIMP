import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AtSign, Bell, CheckCheck, UserPlus, Sparkles } from 'lucide-react';
import { staffApi } from '@/api/client';
import type { NotificationFeed, StaffNotification } from '@/api/types';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

const TRIGGER_META: Record<string, { label: string; icon: typeof Bell }> = {
  'issue.created': { label: 'New issue reported', icon: Sparkles },
  'issue.assigned': { label: 'Assigned to you', icon: UserPlus },
  'comment.mention': { label: 'Mentioned you in a comment', icon: AtSign },
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.round(hr / 24)}d ago`;
}

export function NotificationsBell() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data } = useQuery({
    queryKey: ['staff', 'notifications'],
    queryFn: async () => (await staffApi.get<NotificationFeed>('/staff/notifications')).data,
    // Lean idle poll (paused automatically while the tab is hidden), but refetch
    // the moment the user returns to the tab or the network reconnects so the
    // bell feels fresh without hammering the API every minute.
    refetchInterval: 180_000,
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    refetchOnReconnect: true,
    staleTime: 60_000,
  });

  const markRead = useMutation({
    mutationFn: () => staffApi.post('/staff/notifications/read'),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff', 'notifications'] }),
  });

  const unread = data?.unread ?? 0;
  const items = data?.items ?? [];

  function open(n: StaffNotification) {
    if (n.issue) navigate(`/staff/issues/${n.issue.id}`);
  }

  return (
    <DropdownMenu
      onOpenChange={(o) => { if (o && unread > 0) markRead.mutate(); }}
    >
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon-sm" className="relative" aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`}>
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute right-1 top-1 flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary opacity-60" />
              <span className="relative inline-flex size-2 rounded-full bg-primary ring-2 ring-background" />
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>

      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
          <span className="text-sm font-semibold">Notifications</span>
          {items.length > 0 && (
            <button
              type="button"
              onClick={() => markRead.mutate()}
              className="flex items-center gap-1 text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              <CheckCheck className="size-3.5" /> Mark all read
            </button>
          )}
        </div>

        <div className="max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
              <div className="rounded-full bg-muted p-3 text-muted-foreground">
                <Bell className="size-5" />
              </div>
              <p className="text-sm font-medium">You're all caught up</p>
              <p className="text-xs text-muted-foreground">
                New issues and assignments in your scope show up here.
              </p>
            </div>
          ) : (
            items.map((n) => {
              const meta = TRIGGER_META[n.trigger] ?? { label: n.trigger, icon: Bell };
              const Icon = meta.icon;
              return (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => open(n)}
                  className={cn(
                    'flex w-full items-start gap-3 border-b border-border/60 px-3 py-2.5 text-left transition-colors last:border-0 hover:bg-accent',
                    !n.readAt && 'bg-primary/[0.04]',
                  )}
                >
                  <span className="mt-0.5 rounded-md bg-muted p-1.5 text-muted-foreground">
                    <Icon className="size-3.5" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium">{meta.label}</span>
                      {!n.readAt && <span className="size-1.5 shrink-0 rounded-full bg-primary" aria-label="unread" />}
                    </span>
                    <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                      {n.issue && <span className="font-mono">{n.issue.referenceNo}</span>}
                      {n.issue?.platformKey && <span>· {n.issue.platformKey}</span>}
                      <span className="ml-auto">{relativeTime(n.createdAt)}</span>
                    </span>
                  </span>
                </button>
              );
            })
          )}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
