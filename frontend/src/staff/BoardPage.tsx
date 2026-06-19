import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, pointerWithin,
  useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { Inbox, MoveRight, UserCheck } from 'lucide-react';
import { toast } from 'sonner';
import { staffApi } from '@/api/client';
import type { IssueStatus, Paginated, StaffIssueSummary, StaffMe } from '@/api/types';
import { BOARD_STATUS_ORDER, STATUS_TRANSITIONS, canTransition } from '@/lib/issue-status';
import { STATUS_META } from '@/lib/issue-meta';
import { relativeTime, initials } from '@/lib/format';
import { PriorityBadge } from '@/components/StatusBadge';
import { SlaBadge } from '@/components/SlaBadge';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle,
} from '@/components/ui/empty';
import { cn } from '@/lib/utils';

const BOARD_PAGE_SIZE = 100; // backend caps pageSize at 100.

export function BoardPage() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const { data, isLoading, isError } = useQuery({
    queryKey: ['staff', 'board'],
    queryFn: async () =>
      (await staffApi.get<Paginated<StaffIssueSummary>>('/staff/issues', {
        params: { pageSize: BOARD_PAGE_SIZE, sort: 'updatedAt', order: 'DESC' },
      })).data,
  });

  const { data: me } = useQuery({
    queryKey: ['staff', 'me'],
    queryFn: async () => (await staffApi.get<StaffMe>('/staff/me')).data,
    staleTime: 5 * 60 * 1000,
  });

  // Local working copy so a drag updates the board instantly; re-synced whenever
  // the server query settles (which also refreshes optimistic-lock versions).
  const [items, setItems] = useState<StaffIssueSummary[]>([]);
  useEffect(() => {
    if (data?.data) setItems(data.data);
  }, [data]);

  const [activeId, setActiveId] = useState<string | null>(null);
  const activeIssue = items.find((i) => i.id === activeId) ?? null;

  const sensors = useSensors(
    // A small distance threshold so a plain click still opens the issue.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor),
  );

  const grouped = useMemo(() => {
    const by: Record<IssueStatus, StaffIssueSummary[]> = {
      NEW: [], REOPENED: [], IN_PROGRESS: [], ON_HOLD: [], RESOLVED: [], CLOSED: [],
    };
    for (const it of items) by[it.status].push(it);
    return by;
  }, [items]);

  const changeStatus = useMutation({
    mutationFn: (v: { id: string; status: IssueStatus; version: number }) =>
      staffApi.patch(`/staff/issues/${v.id}/status`, { status: v.status, version: v.version }),
    onSuccess: () => {
      // Pull fresh rows (and versions) so the next move uses the right version.
      queryClient.invalidateQueries({ queryKey: ['staff', 'board'] });
      queryClient.invalidateQueries({ queryKey: ['staff', 'issues'] });
    },
  });

  // Shared by drag-and-drop and the per-card quick-move menu: optimistically
  // move the card, then persist with the optimistic-lock version.
  function moveIssue(issue: StaffIssueSummary, target: IssueStatus) {
    if (issue.status === target) return;
    if (!canTransition(issue.status, target)) {
      toast.error(
        `Can't move ${issue.referenceNo} from ${STATUS_META[issue.status].label} to ${STATUS_META[target].label}.`,
      );
      return;
    }

    const from = issue.status;
    setItems((prev) => prev.map((i) => (i.id === issue.id ? { ...i, status: target } : i)));
    changeStatus.mutate(
      { id: issue.id, status: target, version: issue.version },
      {
        onSuccess: () => toast.success(`${issue.referenceNo} → ${STATUS_META[target].label}.`),
        onError: (err: any) => {
          // Roll back the optimistic move and explain.
          setItems((prev) => prev.map((i) => (i.id === issue.id ? { ...i, status: from } : i)));
          const msg = err?.response?.status === 409
            ? `${issue.referenceNo} changed elsewhere — refresh and retry.`
            : err?.response?.data?.message ?? 'Move failed.';
          toast.error(Array.isArray(msg) ? msg.join(' ') : msg);
        },
      },
    );
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const id = String(e.active.id);
    const target = e.over ? (String(e.over.id) as IssueStatus) : null;
    const issue = items.find((i) => i.id === id);
    if (!issue || !target) return;
    moveIssue(issue, target);
  }

  // Can the current user take this issue? True only if they hold a DEVELOPER
  // grant globally or for the issue's platform — mirrors the server's check, so
  // we only show the action when it will actually succeed.
  function canAssignToMe(issue: StaffIssueSummary): boolean {
    if (!me || !issue.platform) return false;
    if (issue.assignee?.id === me.id) return false;
    return me.roles.some(
      (r) => r.role === 'DEVELOPER' && (r.platformId === null || r.platformId === issue.platform!.id),
    );
  }

  function assignToMe(issue: StaffIssueSummary) {
    if (!me) return;
    const prev = issue.assignee;
    setItems((list) => list.map((i) => (i.id === issue.id ? { ...i, assignee: { id: me.id, name: me.name } } : i)));
    staffApi
      .patch(`/staff/issues/${issue.id}/assignment`, { assigneeId: me.id, version: issue.version })
      .then(() => {
        toast.success(`${issue.referenceNo} assigned to you.`);
        queryClient.invalidateQueries({ queryKey: ['staff', 'board'] });
        queryClient.invalidateQueries({ queryKey: ['staff', 'issues'] });
      })
      .catch((err: any) => {
        setItems((list) => list.map((i) => (i.id === issue.id ? { ...i, assignee: prev } : i)));
        toast.error(err?.response?.data?.message ?? 'Could not assign.');
      });
  }

  if (isError) {
    return <Alert variant="destructive"><AlertDescription>Could not load the board.</AlertDescription></Alert>;
  }

  const capped = data ? data.total > items.length : false;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Board</h1>
        <p className="text-sm text-muted-foreground">
          {isLoading
            ? 'Loading…'
            : `Drag a card between columns to change its status.${capped ? ` Showing the ${items.length} most recently updated of ${data!.total}.` : ''}`}
        </p>
      </div>

      {!isLoading && items.length === 0 ? (
        <Empty className="rounded-xl border border-dashed border-border py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon"><Inbox /></EmptyMedia>
            <EmptyTitle>No issues to triage</EmptyTitle>
            <EmptyDescription>
              When issues are reported on your platforms they show up here, ready to drag through the workflow.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
      <DndContext
        sensors={sensors}
        collisionDetection={pointerWithin}
        onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveId(null)}
      >
        <div className="flex gap-4 overflow-x-auto pb-4">
          {BOARD_STATUS_ORDER.map((status) => (
            <Column
              key={status}
              status={status}
              issues={grouped[status]}
              loading={isLoading}
              onOpen={(id) => navigate(`/staff/issues/${id}`)}
              onMove={moveIssue}
              onAssignToMe={assignToMe}
              canAssignToMe={canAssignToMe}
              isDropTarget={!!activeIssue && canTransition(activeIssue.status, status)}
              isInvalidTarget={!!activeIssue && activeIssue.status !== status && !canTransition(activeIssue.status, status)}
            />
          ))}
        </div>

        <DragOverlay dropAnimation={null}>
          {activeIssue ? <IssueCard issue={activeIssue} dragging /> : null}
        </DragOverlay>
      </DndContext>
      )}
    </div>
  );
}

function Column({
  status, issues, loading, onOpen, onMove, onAssignToMe, canAssignToMe, isDropTarget, isInvalidTarget,
}: {
  status: IssueStatus;
  issues: StaffIssueSummary[];
  loading: boolean;
  onOpen: (id: string) => void;
  onMove: (issue: StaffIssueSummary, target: IssueStatus) => void;
  onAssignToMe: (issue: StaffIssueSummary) => void;
  canAssignToMe: (issue: StaffIssueSummary) => boolean;
  isDropTarget: boolean;
  isInvalidTarget: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: status });
  const meta = STATUS_META[status];

  return (
    <div className="flex w-72 shrink-0 flex-col self-start rounded-xl border border-border bg-sidebar/40">
      <div className="sticky top-0 flex items-center gap-2 rounded-t-xl border-b border-border bg-sidebar/80 px-3 py-2.5 backdrop-blur">
        <span className={cn('size-2 rounded-full', meta.dot)} aria-hidden />
        <span className="text-sm font-semibold">{meta.label}</span>
        <Badge variant="secondary" className="ml-auto tabular-nums">{issues.length}</Badge>
      </div>

      <div
        ref={setNodeRef}
        className={cn(
          'flex min-h-72 flex-col gap-2 rounded-b-xl p-2 transition-colors',
          isOver && isDropTarget && 'bg-primary/5 ring-2 ring-inset ring-primary/40',
          isOver && isInvalidTarget && 'bg-destructive/5 ring-2 ring-inset ring-destructive/40',
        )}
      >
        {loading &&
          Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20 w-full rounded-lg" />)}

        {!loading && issues.length === 0 && (
          <div className="flex min-h-20 flex-1 items-center justify-center rounded-lg border border-dashed border-border/60 px-2 py-6 text-center text-xs text-muted-foreground">
            {isOver && isDropTarget ? 'Release to move here' : 'No issues'}
          </div>
        )}

        {!loading && issues.map((issue) => (
          <DraggableCard
            key={issue.id}
            issue={issue}
            onOpen={onOpen}
            onMove={onMove}
            onAssignToMe={onAssignToMe}
            canAssignToMe={canAssignToMe(issue)}
          />
        ))}
      </div>
    </div>
  );
}

function DraggableCard({
  issue, onOpen, onMove, onAssignToMe, canAssignToMe,
}: {
  issue: StaffIssueSummary;
  onOpen: (id: string) => void;
  onMove: (issue: StaffIssueSummary, target: IssueStatus) => void;
  onAssignToMe: (issue: StaffIssueSummary) => void;
  canAssignToMe: boolean;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: issue.id });
  const targets = STATUS_TRANSITIONS[issue.status];
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      onClick={() => onOpen(issue.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpen(issue.id); }}
      className={cn('cursor-grab touch-none active:cursor-grabbing', isDragging && 'opacity-40')}
    >
      <IssueCard
        issue={issue}
        actions={
          // Keyboard- and click-accessible alternative to dragging.
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                className="size-6 shrink-0 text-muted-foreground"
                aria-label={`Move ${issue.referenceNo} to another status`}
                onClick={stop}
                onPointerDown={stop}
                onKeyDown={stop}
              >
                <MoveRight className="size-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {canAssignToMe && (
                <DropdownMenuItem className="gap-2" onSelect={() => onAssignToMe(issue)}>
                  <UserCheck className="size-3.5" /> Assign to me
                </DropdownMenuItem>
              )}
              <DropdownMenuLabel className="text-xs">Move to</DropdownMenuLabel>
              {targets.map((t) => (
                <DropdownMenuItem key={t} className="gap-2" onSelect={() => onMove(issue, t)}>
                  <span className={cn('size-2 rounded-full', STATUS_META[t].dot)} aria-hidden />
                  {STATUS_META[t].label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        }
      />
    </div>
  );
}

function IssueCard({
  issue, dragging, actions,
}: {
  issue: StaffIssueSummary;
  dragging?: boolean;
  actions?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-card p-3 shadow-xs transition-shadow',
        dragging ? 'rotate-1 cursor-grabbing shadow-lg' : 'hover:shadow-md',
      )}
    >
      <div className="flex items-start gap-2">
        <p className="line-clamp-2 flex-1 text-sm font-medium leading-snug">
          {issue.descriptionPreview || issue.referenceNo}
        </p>
        {actions}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-[11px] text-muted-foreground">
          {issue.referenceNo}{issue.platform?.key ? ` · ${issue.platform.key}` : ''}
        </span>
        <PriorityBadge priority={issue.priority} />
        <SlaBadge slaState={issue.slaState} dueAt={issue.dueAt} />
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span className="flex min-w-0 items-center gap-1.5">
          <Avatar className="size-5"><AvatarFallback className="text-[9px]">{initials(issue.assignee?.name)}</AvatarFallback></Avatar>
          <span className="truncate">{issue.assignee?.name ?? 'Unassigned'}</span>
        </span>
        <span className="shrink-0">{relativeTime(issue.updatedAt)}</span>
      </div>
    </div>
  );
}
