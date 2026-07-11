import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ActivitySquare, ChevronLeft, ChevronRight, Inbox, Keyboard, UserCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { staffApi } from '@/api/client';
import type {
  AssigneeOption, IssueStatus, Paginated, Priority, StaffIssueDetail, StaffIssueSummary, StaffMe,
} from '@/api/types';
import { StatusBadge, PriorityBadge } from '@/components/StatusBadge';
import { STATUS_META, PRIORITY_META } from '@/lib/issue-meta';
import { STATUS_TRANSITIONS } from '@/lib/issue-status';
import { canWriteOn } from '@/lib/permissions';
import { useHotkeys } from '@/lib/use-hotkeys';
import { relativeTime } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle,
} from '@/components/ui/empty';
import { MergeIssueButton } from './IssueExtras';

const PRIORITIES: Priority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

// Keyboard-first triage: the untriaged (NEW) queue, oldest first, one issue at
// a time. Every triage-completing action advances to the next issue.
export function TriagePage() {
  const queryClient = useQueryClient();
  const [index, setIndex] = useState(0);
  const [showKeys, setShowKeys] = useState(false);

  const { data: queue, isLoading } = useQuery({
    queryKey: ['staff', 'triage', 'queue'],
    queryFn: async () =>
      (await staffApi.get<Paginated<StaffIssueSummary>>(
        '/staff/issues?status=NEW&sort=createdAt&order=ASC&pageSize=50',
      )).data,
  });
  const items = queue?.data ?? [];
  const current = items[Math.min(index, Math.max(items.length - 1, 0))];

  const { data: detail } = useQuery({
    queryKey: ['staff', 'issue', current?.id],
    queryFn: async () => (await staffApi.get<StaffIssueDetail>(`/staff/issues/${current!.id}`)).data,
    enabled: Boolean(current),
  });
  const { data: me } = useQuery({
    queryKey: ['staff', 'me'],
    queryFn: async () => (await staffApi.get<StaffMe>('/staff/me')).data,
    staleTime: 5 * 60 * 1000,
  });
  const canWrite = canWriteOn(me, detail?.platform?.id);
  const { data: assignees } = useQuery({
    queryKey: ['staff', 'issue', current?.id, 'assignees'],
    queryFn: async () => (await staffApi.get<AssigneeOption[]>(`/staff/issues/${current!.id}/assignees`)).data,
    enabled: Boolean(current) && canWrite,
  });

  const advance = () => {
    queryClient.invalidateQueries({ queryKey: ['staff', 'triage', 'queue'] });
    queryClient.invalidateQueries({ queryKey: ['staff', 'issues'] });
    // The completed item leaves the NEW queue on refetch; keep the same index
    // so the next untriaged issue slides into place.
  };
  const onError = (e: any) => {
    const msg = e?.response?.data?.message ?? 'Action failed.';
    toast.error(Array.isArray(msg) ? msg.join(' ') : msg);
    queryClient.invalidateQueries({ queryKey: ['staff', 'issue', current?.id] });
  };

  const setPriority = useMutation({
    mutationFn: (priority: Priority) =>
      staffApi.patch(`/staff/issues/${current!.id}/priority`, { priority, version: detail!.version }),
    onSuccess: () => { toast.success('Priority set.'); queryClient.invalidateQueries({ queryKey: ['staff', 'issue', current?.id] }); },
    onError,
  });
  const setStatus = useMutation({
    mutationFn: (status: IssueStatus) =>
      staffApi.patch(`/staff/issues/${current!.id}/status`, { status, version: detail!.version }),
    onSuccess: () => { toast.success('Status updated.'); advance(); },
    onError,
  });
  const assignToMe = useMutation({
    mutationFn: () =>
      staffApi.patch(`/staff/issues/${current!.id}/assignment`, { assigneeId: me!.id, version: detail!.version }),
    onSuccess: () => { toast.success('Assigned to you.'); queryClient.invalidateQueries({ queryKey: ['staff', 'issue', current?.id] }); },
    onError,
  });

  const canAssignToMe = Boolean(me && assignees?.some((a) => a.id === me.id) && detail?.assignee?.id !== me?.id);
  const busy = setPriority.isPending || setStatus.isPending || assignToMe.isPending;
  const transitions = detail ? STATUS_TRANSITIONS[detail.status] : [];

  const hotkeys = useMemo(() => {
    if (!current || !detail || !canWrite || busy) return {};
    const map: Record<string, () => void> = {
      j: () => setIndex((i) => Math.min(i + 1, items.length - 1)),
      arrowright: () => setIndex((i) => Math.min(i + 1, items.length - 1)),
      k: () => setIndex((i) => Math.max(i - 1, 0)),
      arrowleft: () => setIndex((i) => Math.max(i - 1, 0)),
      '?': () => setShowKeys((s) => !s),
    };
    PRIORITIES.forEach((p, i) => { map[String(i + 1)] = () => setPriority.mutate(p); });
    if (transitions[0]) map.s = () => setStatus.mutate(transitions[0]);
    if (canAssignToMe) map.a = () => assignToMe.mutate();
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id, detail?.version, canWrite, busy, items.length, canAssignToMe, transitions.join(',')]);
  useHotkeys(hotkeys);

  if (isLoading) return <Skeleton className="h-96 w-full" />;

  if (items.length === 0) {
    return (
      <Empty className="py-24">
        <EmptyHeader>
          <EmptyMedia variant="icon"><Inbox /></EmptyMedia>
          <EmptyTitle>Inbox zero</EmptyTitle>
          <EmptyDescription>No untriaged issues. New reports land here as they arrive.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Triage</h1>
          <p className="text-sm text-muted-foreground">
            {items.length} untriaged · {Math.min(index + 1, items.length)} of {items.length}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon-sm" title="Shortcuts (?)" onClick={() => setShowKeys((s) => !s)}>
            <Keyboard className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" disabled={index === 0} onClick={() => setIndex((i) => i - 1)} title="Previous (k)">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon-sm" disabled={index >= items.length - 1} onClick={() => setIndex((i) => i + 1)} title="Next (j)">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {showKeys && (
        <div className="rounded-md border border-border/60 bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
          <kbd>j</kbd>/<kbd>k</kbd> next/prev · <kbd>1</kbd>–<kbd>4</kbd> priority ·{' '}
          <kbd>s</kbd> {transitions[0] ? STATUS_META[transitions[0]].label : 'status'} ·{' '}
          {canAssignToMe && <><kbd>a</kbd> assign to me · </>}<kbd>?</kbd> hide
        </div>
      )}

      {current && (
        <Card key={current.id} className="animate-in fade-in slide-in-from-right-2 duration-200">
          <CardHeader className="gap-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>{current.platform?.name}</span>
              <span className="text-muted-foreground/40">/</span>
              <Link to={`/staff/issues/${current.id}`} className="font-mono text-primary hover:underline">
                {current.referenceNo}
              </Link>
              <span className="text-muted-foreground/40">·</span>
              <span>{relativeTime(current.createdAt)}</span>
              <span className="text-muted-foreground/40">·</span>
              <span>{current.reporter?.name}</span>
            </div>
            <CardTitle className="leading-snug text-balance">{current.descriptionPreview}</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={detail?.status ?? current.status} />
              <PriorityBadge priority={detail?.priority ?? current.priority} />
              {detail?.context ? (
                <Badge variant="outline" className="border-emerald-500/20 bg-emerald-500/10 text-emerald-500">
                  <ActivitySquare className="mr-1 h-3 w-3" /> Diagnostics
                </Badge>
              ) : null}
              {detail?.assignee && <Badge variant="secondary">→ {detail.assignee.name}</Badge>}
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="max-h-64 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed">
              {detail?.description ?? current.descriptionPreview}
            </p>

            {!canWrite && (
              <p className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                Read-only access — you can browse the queue but not triage it.
              </p>
            )}
            {canWrite && detail && (
              <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-4">
                {canAssignToMe && (
                  <Button size="sm" variant="outline" className="gap-1.5" disabled={busy} onClick={() => assignToMe.mutate()}>
                    <UserCheck className="h-3.5 w-3.5" /> Assign to me
                    <kbd className="text-[10px] text-muted-foreground">a</kbd>
                  </Button>
                )}
                {PRIORITIES.map((p, i) => (
                  <Button
                    key={p}
                    size="sm"
                    variant={detail.priority === p ? 'secondary' : 'ghost'}
                    disabled={busy}
                    onClick={() => setPriority.mutate(p)}
                  >
                    {PRIORITY_META[p].label}
                    <kbd className="ml-1 text-[10px] text-muted-foreground">{i + 1}</kbd>
                  </Button>
                ))}
                <span className="mx-1 h-5 w-px bg-border" />
                {transitions.map((s, i) => (
                  <Button key={s} size="sm" variant="secondary" disabled={busy} onClick={() => setStatus.mutate(s)}>
                    {STATUS_META[s].label}
                    {i === 0 && <kbd className="ml-1 text-[10px] text-muted-foreground">s</kbd>}
                  </Button>
                ))}
                <MergeIssueButton
                  issueId={current.id}
                  platformId={detail.platform?.id}
                  version={detail.version}
                  onMerged={advance}
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
