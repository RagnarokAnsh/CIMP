import { useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AtSign, Lock, MessageSquare, Send, UserCheck, Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { staffApi } from '@/api/client';
import { AttachmentGallery } from '@/components/AttachmentGallery';
import { Spinner } from '@/components/ui/spinner';
import type {
  AssigneeOption, CommentVisibility, IssueStatus, Priority, StaffIssueDetail, StaffMe,
} from '@/api/types';
import { StatusBadge, PriorityBadge } from '@/components/StatusBadge';
import { SlaBadge } from '@/components/SlaBadge';
import { STATUS_META, PRIORITY_META } from '@/lib/issue-meta';
import { STATUS_TRANSITIONS } from '@/lib/issue-status';
import { firstLine } from '@/lib/format';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle,
} from '@/components/ui/empty';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

const PRIORITIES: Priority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const UNASSIGNED = '__unassigned__';

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Renders a comment body with @mentions highlighted (distinct colour for UX).
// Matches against the known platform member names so multi-word names colour fully.
function renderBody(text: string, names: string[]) {
  const known = names.filter(Boolean);
  if (known.length === 0) return text;
  const re = new RegExp(`@(${[...known].sort((a, b) => b.length - a.length).map(escapeRegExp).join('|')})`, 'g');
  const out: React.ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index));
    out.push(
      <span key={m.index} className="rounded bg-primary/10 px-1 font-medium text-primary">
        @{m[1]}
      </span>,
    );
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

// The full issue detail UI, parameterised by issue id so it can render both as a
// standalone route (StaffIssueDetailPage) and inside the Issues split view. The
// `toolbar` slot holds context-specific controls (a back link, or prev/next nav).
export function IssueDetailPanel({ issueId: id, toolbar }: { issueId: string; toolbar?: React.ReactNode }) {
  const queryClient = useQueryClient();
  const [body, setBody] = useState('');
  const [visibility, setVisibility] = useState<CommentVisibility>('INTERNAL');
  const [mention, setMention] = useState<{ query: string; start: number } | null>(null);
  const [activeIdx, setActiveIdx] = useState(0);
  const [picked, setPicked] = useState<Map<string, string>>(new Map());
  const taRef = useRef<HTMLTextAreaElement>(null);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['staff', 'issue', id],
    queryFn: async () => (await staffApi.get<StaffIssueDetail>(`/staff/issues/${id}`)).data,
  });

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['staff', 'issue', id] });
  const onError = (e: any) => {
    if (e?.response?.status === 409) {
      // Stale optimistic-lock version: refetch so the next action uses the
      // current version instead of looping on the same conflict.
      refresh();
      toast.error('This issue changed elsewhere — reloaded, try again.');
      return;
    }
    const msg = e?.response?.data?.message ?? 'Action failed.';
    toast.error(Array.isArray(msg) ? msg.join(' ') : msg);
  };

  const changeStatus = useMutation({
    mutationFn: (status: IssueStatus) =>
      staffApi.patch(`/staff/issues/${id}/status`, { status, version: data!.version }),
    onSuccess: () => { toast.success('Status updated.'); refresh(); invalidateLists(); },
    onError,
  });
  const changePriority = useMutation({
    mutationFn: (priority: Priority) =>
      staffApi.patch(`/staff/issues/${id}/priority`, { priority, version: data!.version }),
    onSuccess: () => { toast.success('Priority updated.'); refresh(); invalidateLists(); },
    onError,
  });
  const addComment = useMutation({
    mutationFn: () => {
      const mentionStaffIds = [...picked.entries()]
        .filter(([, name]) => body.includes(`@${name}`))
        .map(([sid]) => sid);
      return staffApi.post(`/staff/issues/${id}/comments`, {
        body,
        visibility,
        mentionStaffIds: mentionStaffIds.length ? mentionStaffIds : undefined,
      });
    },
    onSuccess: () => {
      setBody(''); setPicked(new Map()); setMention(null);
      toast.success('Comment posted.'); refresh();
    },
    onError,
  });

  function invalidateLists() {
    queryClient.invalidateQueries({ queryKey: ['staff', 'issues'] });
    queryClient.invalidateQueries({ queryKey: ['staff', 'board'] });
  }

  const { data: me } = useQuery({
    queryKey: ['staff', 'me'],
    queryFn: async () => (await staffApi.get<StaffMe>('/staff/me')).data,
    staleTime: 5 * 60 * 1000,
  });
  const { data: assignees } = useQuery({
    queryKey: ['staff', 'issue', id, 'assignees'],
    queryFn: async () => (await staffApi.get<AssigneeOption[]>(`/staff/issues/${id}/assignees`)).data,
    enabled: Boolean(id),
  });
  const { data: members } = useQuery({
    queryKey: ['staff', 'issue', id, 'members'],
    queryFn: async () => (await staffApi.get<AssigneeOption[]>(`/staff/issues/${id}/members`)).data,
    enabled: Boolean(id),
  });
  const changeAssignment = useMutation({
    mutationFn: (assigneeId: string | null) =>
      staffApi.patch(`/staff/issues/${id}/assignment`, { assigneeId, version: data!.version }),
    onSuccess: () => { toast.success('Assignment updated.'); refresh(); invalidateLists(); },
    onError,
  });

  if (isLoading) return <div className="space-y-4">{toolbar}<Skeleton className="h-96 w-full" /></div>;
  if (isError || !data) {
    return (
      <div className="space-y-4">
        {toolbar}
        <Alert variant="destructive"><AlertDescription>Issue not found.</AlertDescription></Alert>
      </div>
    );
  }

  const busy = changeStatus.isPending || changePriority.isPending || changeAssignment.isPending;
  const isAssignedToMe = Boolean(me && data.assignee && me.id === data.assignee.id);
  const memberNames = (members ?? []).map((m) => m.name);

  const mentionSuggestions = mention
    ? (members ?? [])
        .filter((m) => m.id !== me?.id && m.name.toLowerCase().includes(mention.query))
        .slice(0, 6)
    : [];

  function onBodyChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const value = e.target.value;
    setBody(value);
    const caret = e.target.selectionStart ?? value.length;
    const m = value.slice(0, caret).match(/(?:^|\s)@([\p{L}\p{N}._-]{0,30})$/u);
    if (m) { setMention({ query: m[1].toLowerCase(), start: caret - m[1].length - 1 }); setActiveIdx(0); }
    else setMention(null);
  }

  function applyMention(mb: AssigneeOption) {
    if (!mention) return;
    const caret = taRef.current?.selectionStart ?? body.length;
    const before = body.slice(0, mention.start);
    const after = body.slice(caret);
    const insert = `@${mb.name} `;
    setBody(before + insert + after);
    setPicked((p) => new Map(p).set(mb.id, mb.name));
    setMention(null);
    requestAnimationFrame(() => {
      const pos = (before + insert).length;
      taRef.current?.focus();
      taRef.current?.setSelectionRange(pos, pos);
    });
  }

  function onCommentKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (!mention || mentionSuggestions.length === 0) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIdx((i) => (i + 1) % mentionSuggestions.length); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIdx((i) => (i - 1 + mentionSuggestions.length) % mentionSuggestions.length); }
    else if (e.key === 'Enter') { e.preventDefault(); applyMention(mentionSuggestions[activeIdx]); }
    else if (e.key === 'Escape') { setMention(null); }
  }

  return (
    <div className="space-y-5">
      {toolbar && (
        <div className="sticky top-0 z-10 -mx-1 border-b border-border/60 bg-background/80 px-1 pb-3 pt-1 backdrop-blur">
          {toolbar}
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="truncate">{data.platform?.name ?? 'Unknown platform'}</span>
          <span className="text-muted-foreground/40">/</span>
          <span className="font-mono">{data.referenceNo}</span>
        </div>
        <h1 className="text-xl font-semibold leading-snug tracking-tight text-balance">
          {firstLine(data.description, 120) || data.referenceNo}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={data.status} />
          <PriorityBadge priority={data.priority} />
          <SlaBadge slaState={data.slaState} dueAt={data.dueAt} />
          {data.jiraIssueKey && <Badge variant="secondary">Jira {data.jiraIssueKey}</Badge>}
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_300px]">
        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Description</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{data.description}</p>
              {data.attachments.length > 0 && (
                <AttachmentGallery
                  api={staffApi}
                  urlFor={(a) => `/staff/attachments/${a.id}/download`}
                  attachments={data.attachments.map((a) => ({
                    id: a.id,
                    filename: a.filename,
                    contentType: a.contentType,
                    sizeBytes: a.sizeBytes,
                    servable: a.scanStatus === 'CLEAN' || a.scanStatus === 'SKIPPED',
                    scanLabel: a.scanStatus,
                  }))}
                />
              )}
            </CardContent>
          </Card>

          <Tabs defaultValue="comments">
            <TabsList>
              <TabsTrigger value="comments">Comments ({data.comments.length})</TabsTrigger>
              <TabsTrigger value="history">History ({data.history.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="comments" className="space-y-4">
              <Card>
                <CardContent className="space-y-4 pt-6">
                  {data.comments.length === 0 && (
                    <Empty className="py-8">
                      <EmptyHeader>
                        <EmptyMedia variant="icon"><MessageSquare /></EmptyMedia>
                        <EmptyTitle>No comments yet</EmptyTitle>
                        <EmptyDescription>
                          Add an internal note for your team, or a reporter-visible update to keep them informed.
                        </EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  )}
                  {data.comments.map((c) => (
                    <div key={c.id} className="space-y-1">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="font-medium">{c.author?.name ?? 'Unknown'}</span>
                        {c.authorType === 'REPORTER' && (
                          <Badge variant="outline" className="border-blue-500/20 bg-blue-500/10 text-blue-400">
                            Reporter
                          </Badge>
                        )}
                        {c.visibility === 'REPORTER_VISIBLE' ? (
                          <Badge variant="outline" className="border-emerald-500/20 bg-emerald-500/10 text-emerald-400">
                            <Users className="mr-1 h-3 w-3" /> Reporter-visible
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            <Lock className="mr-1 h-3 w-3" /> Internal
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {new Date(c.createdAt).toLocaleString()}{c.editedAt ? ' (edited)' : ''}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm text-foreground/90">{renderBody(c.body, memberNames)}</p>
                      <Separator className="mt-3" />
                    </div>
                  ))}

                  <div className="space-y-3">
                    <div className="relative">
                      <Textarea
                        ref={taRef}
                        value={body}
                        onChange={onBodyChange}
                        onKeyDown={onCommentKeyDown}
                        placeholder="Add a comment… type @ to mention a teammate"
                        className="min-h-24"
                      />
                      {mention && mentionSuggestions.length > 0 && (
                        <div className="absolute left-2 top-full z-20 mt-1 w-64 overflow-hidden rounded-md border border-border bg-popover py-1 shadow-md">
                          {mentionSuggestions.map((m, i) => (
                            <button
                              key={m.id}
                              type="button"
                              onMouseDown={(e) => { e.preventDefault(); applyMention(m); }}
                              onMouseEnter={() => setActiveIdx(i)}
                              className={cn(
                                'flex w-full items-center gap-2 px-3 py-2 text-left text-sm',
                                i === activeIdx ? 'bg-accent text-accent-foreground' : 'hover:bg-accent/60',
                              )}
                            >
                              <AtSign className="size-3.5 text-muted-foreground" />
                              <span className="truncate">{m.name}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <Select value={visibility} onValueChange={(v) => setVisibility(v as CommentVisibility)}>
                        <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="INTERNAL">Internal note</SelectItem>
                          <SelectItem value="REPORTER_VISIBLE">Reporter-visible</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button onClick={() => addComment.mutate()} disabled={!body.trim() || addComment.isPending}>
                        {addComment.isPending ? <Spinner /> : <Send className="h-4 w-4" />}
                        Post
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="history">
              <Card>
                <CardContent className="pt-6">
                  <ol className="space-y-3">
                    {data.history.map((h, idx) => (
                      <li key={idx} className="flex items-start gap-3 text-sm">
                        <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-primary/60" />
                        <div>
                          <span className="font-medium">{h.action.replace(/_/g, ' ').toLowerCase()}</span>
                          {h.field && (
                            <span className="text-muted-foreground">
                              {' '}— {h.field}: {h.oldValue ?? '∅'} → {h.newValue ?? '∅'}
                            </span>
                          )}
                          <div className="text-xs text-muted-foreground">
                            {new Date(h.createdAt).toLocaleString()}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Field label="Platform" value={data.platform?.name ?? '—'} />
              <Field label="Reporter" value={data.reporter?.name ?? '—'} />
              <Field label="Assignee" value={data.assignee?.name ?? 'Unassigned'} />
              <Field label="Jira sync" value={data.jiraSyncStatus} />
              <Field label="Created" value={new Date(data.createdAt).toLocaleString()} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                Actions
                {busy && <Spinner className="h-3.5 w-3.5 text-muted-foreground" />}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Move status to</p>
                <div className="flex flex-wrap gap-2">
                  {STATUS_TRANSITIONS[data.status].map((s) => (
                    <Button key={s} size="sm" variant="secondary" disabled={busy} onClick={() => changeStatus.mutate(s)}>
                      {STATUS_META[s].label}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground">Priority</p>
                <Select value={data.priority} onValueChange={(v) => changePriority.mutate(v as Priority)} disabled={busy}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{PRIORITY_META[p].label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-medium text-muted-foreground">Assignee</p>
                  {me && assignees?.some((a) => a.id === me.id) && !isAssignedToMe && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 gap-1 text-xs"
                      disabled={busy}
                      onClick={() => changeAssignment.mutate(me.id)}
                    >
                      <UserCheck className="h-3.5 w-3.5" /> Assign to me
                    </Button>
                  )}
                </div>
                <Select
                  value={data.assignee?.id ?? UNASSIGNED}
                  onValueChange={(v) => changeAssignment.mutate(v === UNASSIGNED ? null : v)}
                  disabled={busy}
                >
                  <SelectTrigger><SelectValue placeholder="Unassigned" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={UNASSIGNED}>Unassigned</SelectItem>
                    {assignees?.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
                    {data.assignee && !assignees?.some((a) => a.id === data.assignee!.id) && (
                      <SelectItem value={data.assignee.id}>{data.assignee.name}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
