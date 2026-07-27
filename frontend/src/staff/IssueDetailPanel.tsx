import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ActivitySquare, AtSign, ChevronDown, Copy, Lock, Megaphone, MessageSquare, MessageSquareText, Send,
  ThumbsDown, ThumbsUp, UserCheck, Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { staffApi } from '@/api/client';
import { AttachmentGallery } from '@/components/AttachmentGallery';
import { Spinner } from '@/components/ui/spinner';
import type {
  AssigneeOption, CannedResponseView, CommentVisibility, IssueStatus, Priority, StaffIssueDetail,
} from '@/api/types';
import { StatusBadge, PriorityBadge } from '@/components/StatusBadge';
import { SlaBadge } from '@/components/SlaBadge';
import { STATUS_META, PRIORITY_META, BADGE_TONE } from '@/lib/issue-meta';
import { STATUS_TRANSITIONS } from '@/lib/issue-status';
import { canTransitionStatusOn, canWriteOn } from '@/lib/permissions';
import { firstLine, dateTime } from '@/lib/format';
import { toastMutationError } from '@/lib/toast-error';
import { useMe } from '@/lib/use-me';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
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
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { IssueWatch, IssueLabels, IssueLinks, MergeIssueButton } from './IssueExtras';
import { DiagnosticsView } from '@/components/DiagnosticsView';

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
  // Every mutation here carries an optimistic-lock version, so a 409 must refetch
  // before the user retries — otherwise the retry conflicts on the stale version
  // forever. `refresh` is that refetch; the rest falls through to the shared toast.
  const onError = (e: unknown) => toastMutationError(e, refresh);

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

  const { data: me } = useMe();
  // Watchers are read-only: hide mutation UI and skip the write-role-only
  // queries (/assignees and /members 403 for them). Server enforces regardless.
  const canWrite = canWriteOn(me, data?.platform?.id);
  // Status transitions are a narrower grant than write: a FOCAL_POINT may set
  // priority and assignee but only change status when the server's OD-09 policy
  // (FOCAL_POINT_CAN_TRANSITION) is on, exposed via me.policy. Gating the buttons
  // on this stops us offering a move that would reliably 403.
  const canTransition = canTransitionStatusOn(me, data?.platform?.id);
  const { data: assignees } = useQuery({
    queryKey: ['staff', 'issue', id, 'assignees'],
    queryFn: async () => (await staffApi.get<AssigneeOption[]>(`/staff/issues/${id}/assignees`)).data,
    enabled: Boolean(id) && canWrite,
  });
  const { data: members } = useQuery({
    queryKey: ['staff', 'issue', id, 'members'],
    queryFn: async () => (await staffApi.get<AssigneeOption[]>(`/staff/issues/${id}/members`)).data,
    enabled: Boolean(id) && canWrite,
  });
  // Reply templates for this issue's platform, inserted into the composer. Write
  // roles only (watchers can't comment), so it rides the same canWrite gate as
  // /members — the endpoint 403s for read-only roles.
  const { data: cannedResponses } = useQuery({
    queryKey: ['staff', 'canned-responses', data?.platform?.id],
    queryFn: async () =>
      (await staffApi.get<CannedResponseView[]>(`/staff/platforms/${data!.platform!.id}/canned-responses`)).data,
    enabled: Boolean(data?.platform?.id) && canWrite,
    staleTime: 5 * 60 * 1000,
  });
  const changeAssignment = useMutation({
    mutationFn: (assigneeId: string | null) =>
      staffApi.patch(`/staff/issues/${id}/assignment`, { assigneeId, version: data!.version }),
    onSuccess: () => { toast.success('Assignment updated.'); refresh(); invalidateLists(); },
    onError,
  });
  const [publishTitle, setPublishTitle] = useState('');
  const publish = useMutation({
    mutationFn: (publiclyVisible: boolean) =>
      staffApi.patch(`/staff/issues/${id}/publish`, {
        publiclyVisible,
        ...(publiclyVisible && publishTitle.trim() ? { publicTitle: publishTitle.trim() } : {}),
      }),
    onSuccess: (_, published) => {
      toast.success(published ? 'Published as a known issue.' : 'Removed from known issues.');
      refresh();
    },
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

  // Fill a template's {{placeholders}} from this issue (data is narrowed to
  // defined past the early return above). Matches the backend DTO's documented set.
  function fillTemplate(templateBody: string): string {
    if (!data) return templateBody; // narrowing is lost inside this closure
    return templateBody
      .replace(/\{\{\s*reporter\s*\}\}/gi, data.reporter?.name ?? 'there')
      .replace(/\{\{\s*reference\s*\}\}/gi, data.referenceNo)
      .replace(/\{\{\s*assignee\s*\}\}/gi, data.assignee?.name ?? 'the team')
      .replace(/\{\{\s*platform\s*\}\}/gi, data.platform?.name ?? '');
  }

  // Insert a filled template at the caret (or append), then restore focus.
  function insertCanned(templateBody: string) {
    const filled = fillTemplate(templateBody);
    const ta = taRef.current;
    const caret = ta?.selectionStart ?? body.length;
    const before = body.slice(0, caret);
    const after = body.slice(caret);
    // Start on a fresh line unless we're already at one, so the template reads cleanly.
    const sep = before && !before.endsWith('\n') ? '\n' : '';
    setBody(before + sep + filled + after);
    setMention(null);
    requestAnimationFrame(() => {
      const pos = (before + sep + filled).length;
      ta?.focus();
      ta?.setSelectionRange(pos, pos);
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
    // @container: this panel renders both full-page (~1470px of room) and inside
    // the split view (~1050px). Viewport breakpoints can't tell those apart, so
    // the extras sidebar used to sit alongside a short main column in split
    // view, leaving a tall void beside it once you scrolled. The layout now
    // keys off the panel's OWN width.
    <div className="@container space-y-5">
      {toolbar && (
        // bg-background/95: at /80 the status buttons scrolling underneath
        // showed through as ghosts behind the toolbar text.
        <div className="sticky top-0 z-10 -mx-1 border-b border-border/60 bg-background/95 px-1 pb-3 pt-1 backdrop-blur">
          {toolbar}
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <span className="truncate">{data.platform?.name ?? 'Unknown platform'}</span>
          <span aria-hidden className="text-muted-foreground/70">/</span>
          <span className="font-mono">{data.referenceNo}</span>
        </div>
        {data.duplicateOf && (
          <Alert>
            <AlertDescription>
              Duplicate of{' '}
              <Link to={`/staff/issues/${data.duplicateOf.id}`} className="font-mono text-primary hover:underline">
                {data.duplicateOf.referenceNo}
              </Link>
              {' '}— closed here; the reporter is notified when that issue resolves.
            </AlertDescription>
          </Alert>
        )}
        <h1 className="text-xl font-semibold leading-snug tracking-tight text-balance">
          {firstLine(data.description, 120) || data.referenceNo}
        </h1>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={data.status} />
          <PriorityBadge priority={data.priority} />
          <SlaBadge slaState={data.slaState} dueAt={data.dueAt} />
          {data.jiraIssueKey && <Badge variant="secondary">Jira {data.jiraIssueKey}</Badge>}
          {data.csat && (
            <Badge
              variant="outline"
              title={data.csat.comment ?? undefined}
              className={data.csat.score === 1 ? BADGE_TONE.success : BADGE_TONE.danger}
            >
              {data.csat.score === 1 ? <ThumbsUp className="mr-1 h-3 w-3" /> : <ThumbsDown className="mr-1 h-3 w-3" />}
              CSAT
            </Badge>
          )}
          {data.publiclyVisible && (
            <Badge variant="outline" className={BADGE_TONE.info}>
              <Megaphone className="mr-1 h-3 w-3" /> Published
            </Badge>
          )}
          <div className="ml-auto"><IssueWatch issueId={id} /></div>
        </div>
      </div>

      {/* Sidebar only once the panel itself is comfortably wide (@6xl = 72rem);
          below that the extras stack under the main column instead. */}
      <div className="grid gap-6 @6xl:grid-cols-[1fr_300px]">
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

          {data.context && (
            <details className="group rounded-lg border border-border/60">
              <summary className="flex cursor-pointer select-none items-center gap-2 px-4 py-3 text-sm font-medium">
                <ActivitySquare className="h-4 w-4 text-success" />
                Diagnostics
                <span className="text-xs font-normal text-muted-foreground">
                  auto-captured by the reporting app
                </span>
                <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <div className="space-y-3 border-t border-border/60 px-4 py-3">
                <DiagnosticsView context={data.context} />
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    void navigator.clipboard.writeText(JSON.stringify(data.context, null, 2));
                    toast.success('Diagnostics copied as JSON.');
                  }}
                >
                  <Copy className="h-3.5 w-3.5" /> Copy JSON
                </Button>
              </div>
            </details>
          )}

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
                        <span className="font-medium">
                          {c.author?.name ?? (c.authorType === 'REPORTER' ? 'Reporter' : 'System')}
                        </span>
                        {c.authorType === 'REPORTER' && (
                          <Badge variant="outline" className={BADGE_TONE.info}>
                            Reporter
                          </Badge>
                        )}
                        {c.visibility === 'REPORTER_VISIBLE' ? (
                          <Badge variant="outline" className={BADGE_TONE.success}>
                            <Users className="mr-1 h-3 w-3" /> Reporter-visible
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-muted-foreground">
                            <Lock className="mr-1 h-3 w-3" /> Internal
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          {dateTime(c.createdAt)}{c.editedAt ? ' (edited)' : ''}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap text-sm text-foreground/90">{renderBody(c.body, memberNames)}</p>
                      <Separator className="mt-3" />
                    </div>
                  ))}

                  {!canWrite && (
                    <p className="rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
                      You have read-only access to this issue.
                    </p>
                  )}
                  {canWrite && (
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
                      <div className="flex items-center gap-2">
                        <Select value={visibility} onValueChange={(v) => setVisibility(v as CommentVisibility)}>
                          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="INTERNAL">Internal note</SelectItem>
                            <SelectItem value="REPORTER_VISIBLE">Reporter-visible</SelectItem>
                          </SelectContent>
                        </Select>
                        {(cannedResponses?.length ?? 0) > 0 && (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button type="button" variant="outline" size="sm" className="gap-1.5" title="Insert a canned response">
                                <MessageSquareText className="h-4 w-4" /> Templates
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="max-h-80 w-72 overflow-y-auto">
                              <DropdownMenuLabel>Insert a canned response</DropdownMenuLabel>
                              <DropdownMenuSeparator />
                              {cannedResponses!.map((r) => (
                                <DropdownMenuItem
                                  key={r.id}
                                  onSelect={() => insertCanned(r.body)}
                                  className="flex-col items-start gap-0.5"
                                >
                                  <span className="font-medium">{r.title}</span>
                                  <span className="line-clamp-1 text-xs text-muted-foreground">{fillTemplate(r.body)}</span>
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        )}
                      </div>
                      <Button onClick={() => addComment.mutate()} disabled={!body.trim() || addComment.isPending}>
                        {addComment.isPending ? <Spinner /> : <Send className="h-4 w-4" />}
                        Post
                      </Button>
                    </div>
                  </div>
                  )}
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
                            {dateTime(h.createdAt)}
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>

          {/* Labels and links sit under the discussion rather than in the
              sidebar. They are issue *content*, not controls, and moving them
              here balances the two columns — the sidebar was running ~630px
              longer than the main column, leaving a long dead gap beside it.
              Side by side once the panel is wide enough (container query, since
              this renders both full-page and in the narrower split view). */}
          <div className="grid gap-6 @3xl:grid-cols-2">
            <IssueLabels issueId={id} platformId={data.platform?.id} readOnly={!canWrite} />
            <IssueLinks issueId={id} readOnly={!canWrite} />
          </div>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
            <CardContent className="space-y-3 text-sm">
              <Field label="Platform" value={data.platform?.name ?? '—'} />
              <Field label="Reporter" value={data.reporter?.name ?? '—'} />
              <Field label="Assignee" value={data.assignee?.name ?? 'Unassigned'} />
              <Field label="Jira sync" value={data.jiraSyncStatus} />
              <Field label="Created" value={dateTime(data.createdAt)} />
              {data.duplicates.length > 0 && (
                <div className="space-y-1.5 border-t border-border/60 pt-3">
                  <span className="text-muted-foreground">Duplicates ({data.duplicates.length})</span>
                  <div className="flex flex-wrap gap-1.5">
                    {data.duplicates.map((d) => (
                      <Link key={d.id} to={`/staff/issues/${d.id}`} className="font-mono text-xs text-primary hover:underline">
                        {d.referenceNo}
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {canWrite && (
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
                {/* Merge stays available whether or not status transitions do —
                    it's an administrative write a focal point legitimately holds,
                    not a state-machine move. */}
                <div className="flex flex-wrap items-center gap-2">
                  {canTransition ? (
                    STATUS_TRANSITIONS[data.status].map((s) => (
                      <Button key={s} size="sm" variant="secondary" disabled={busy} onClick={() => changeStatus.mutate(s)}>
                        {STATUS_META[s].label}
                      </Button>
                    ))
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      Changing status isn’t available to your role on this platform.
                    </p>
                  )}
                  {!data.duplicateOf && data.status !== 'CLOSED' && (
                    <MergeIssueButton
                      issueId={id}
                      platformId={data.platform?.id}
                      version={data.version}
                      onMerged={() => { refresh(); invalidateLists(); }}
                    />
                  )}
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
          )}

          {/* Collapsed unless the issue is actually published. Expanded it is a
              ~250px block of explanation for an action taken on a small minority
              of issues, and with four other cards below it that padding is what
              left a long dead gap beside the main column. Same <details> pattern
              as Diagnostics above. */}
          {canWrite && (
          // py-0: Card supplies its own py-6, which sat *outside* the summary and
          // left the collapsed row floating with ~24px of dead space above and
          // below it — and double-counted with the expanded body's pb-6. The
          // <details> owns all of its padding instead.
          <Card className="py-0">
            <details open={data.publiclyVisible} className="group">
              <summary className="flex cursor-pointer select-none items-center gap-2 px-6 py-4 text-base font-semibold">
                <Megaphone className="h-4 w-4" /> Known issue
                {data.publiclyVisible && (
                  <Badge variant="outline" className={cn('text-[10px]', BADGE_TONE.info)}>Published</Badge>
                )}
                <ChevronDown className="ml-auto h-4 w-4 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>
              <div className="space-y-2 px-6 pb-6">
                {data.publiclyVisible ? (
                  <>
                    <p className="text-sm text-muted-foreground">
                      Published as “{data.publicTitle}” — visible in connected apps.
                    </p>
                    <Button size="sm" variant="outline" disabled={publish.isPending} onClick={() => publish.mutate(false)}>
                      Unpublish
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="text-xs text-muted-foreground">
                      Publish a curated title to the platform's public known-issues feed (deflects duplicate reports).
                    </p>
                    {/* Shared Input, not a hand-rolled <input> — the local copy
                        missed the focus ring and dark-mode field background. */}
                    <Input
                      value={publishTitle}
                      onChange={(e) => setPublishTitle(e.target.value)}
                      placeholder={data.publicTitle ?? 'Public title (e.g. "Login is degraded")'}
                      maxLength={140}
                      className="h-8"
                    />
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled={publish.isPending || (!publishTitle.trim() && !data.publicTitle)}
                      onClick={() => publish.mutate(true)}
                    >
                      {publish.isPending && <Spinner />} Publish
                    </Button>
                  </>
                )}
              </div>
            </details>
          </Card>
          )}

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
