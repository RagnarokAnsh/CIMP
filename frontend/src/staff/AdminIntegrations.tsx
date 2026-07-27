import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  KeyRound, MessageSquareText, Pencil, Plus, Trash2, Webhook, Zap,
} from 'lucide-react';
import { toast } from 'sonner';
import { staffApi } from '@/api/client';
import type {
  ApiTokenView, AutomationRuleView, CannedResponseView, IssueStatus, LabelView,
  PlatformItem, Priority, WebhookView,
} from '@/api/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { SecretOnce } from '@/components/SecretOnce';
import { STATUS_META, PRIORITY_META } from '@/lib/issue-meta';
import { shortDate } from '@/lib/format';

import { toastApiError as onError } from '@/lib/toast-error';

// Shared trigger styling for the row-level destructive icon buttons below.
// `aria-label` is set per use — `title` alone leaves them unnamed to a screen
// reader, and the bare icon gave no hit target worth aiming at.
const DESTRUCTIVE_ICON =
  'grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors '
  + 'hover:bg-destructive/10 hover:text-destructive focus-ring';

// Neutral sibling of DESTRUCTIVE_ICON for non-destructive row actions (edit).
const NEUTRAL_ICON =
  'grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors '
  + 'hover:bg-accent hover:text-foreground focus-ring';

/**
 * Compact empty state for the small cards on this screen.
 *
 * Every other list surface uses the shared `Empty` component; these three used
 * a bare `<p>` (and the API-tokens list had no empty state at all, rendering a
 * blank area). `Empty`'s full medallion is too heavy inside a half-width card,
 * so this keeps the same icon + title + explanation shape at a smaller scale.
 */
function CompactEmpty({
  icon, title, children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-md border border-dashed border-border/70 px-4 py-6 text-center">
      <span className="mb-1 rounded-full bg-muted p-2 text-muted-foreground [&_svg]:size-4">{icon}</span>
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground">{children}</p>
    </div>
  );
}

// These cards previously rendered blank while their queries were in flight —
// the only surfaces in the workspace without a loading state.
function ListSkeleton({ rows }: { rows: number }) {
  return (
    <div className="space-y-1.5">
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-11 w-full" />)}
    </div>
  );
}

const EVENT_NAMES = [
  'issue.created', 'issue.status_changed', 'issue.priority_changed', 'issue.assigned',
  'comment.added', 'issue.merged', 'csat.received', 'issue.sla_breached',
];

const STATUSES: IssueStatus[] = ['NEW', 'IN_PROGRESS', 'ON_HOLD', 'RESOLVED', 'CLOSED', 'REOPENED'];
const PRIORITIES: Priority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];

function usePlatforms() {
  return useQuery({
    queryKey: ['admin', 'platforms'],
    queryFn: async () => (await staffApi.get<PlatformItem[]>('/admin/platforms')).data,
  });
}

// ── Integrations tab: platform-scoped automation rules + API tokens ─────────
export function IntegrationsTab() {
  const { data: platforms } = usePlatforms();
  const [platformId, setPlatformId] = useState('');
  const active = platformId || platforms?.[0]?.id || '';

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex items-end gap-3 pt-6">
          <div className="space-y-1.5">
            <Label>Platform</Label>
            <Select value={active} onValueChange={setPlatformId}>
              <SelectTrigger className="w-64"><SelectValue placeholder="Select platform" /></SelectTrigger>
              <SelectContent>
                {platforms?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.key})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {active && (
        <div className="grid gap-4 xl:grid-cols-2">
          <AutomationRulesCard platformId={active} />
          <ApiTokensCard platformId={active} />
          <CannedResponsesCard platformId={active} />
        </div>
      )}
    </div>
  );
}

function AutomationRulesCard({ platformId }: { platformId: string }) {
  const qc = useQueryClient();
  const key = ['admin', 'automation', platformId];
  const { data: rules, isLoading: rulesLoading } = useQuery({
    queryKey: key,
    queryFn: async () =>
      (await staffApi.get<AutomationRuleView[]>(`/staff/platforms/${platformId}/automation-rules`)).data,
  });
  const { data: staff } = useQuery({
    queryKey: ['admin', 'staff'],
    queryFn: async () => (await staffApi.get<{ id: string; name: string; roles: { role: string }[] }[]>('/admin/staff')).data,
  });
  const { data: labels } = useQuery({
    queryKey: ['staff', 'platform', platformId, 'labels'],
    queryFn: async () => (await staffApi.get<LabelView[]>(`/staff/platforms/${platformId}/labels`)).data,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [trigger, setTrigger] = useState<'ISSUE_CREATED' | 'STATUS_CHANGED'>('ISSUE_CREATED');
  const [triggerStatus, setTriggerStatus] = useState<string>('__any__');
  const [action, setAction] = useState<'SET_PRIORITY' | 'ASSIGN' | 'ADD_LABEL'>('SET_PRIORITY');
  const [actionValue, setActionValue] = useState('');

  const create = useMutation({
    mutationFn: () =>
      staffApi.post(`/staff/platforms/${platformId}/automation-rules`, {
        name,
        trigger,
        ...(trigger === 'STATUS_CHANGED' && triggerStatus !== '__any__' ? { triggerStatus } : {}),
        action,
        actionValue,
      }),
    onSuccess: () => {
      setOpen(false); setName(''); setActionValue('');
      toast.success('Rule created.'); refresh();
    },
    onError,
  });
  const toggle = useMutation({
    mutationFn: (r: AutomationRuleView) =>
      staffApi.patch(`/staff/platforms/${platformId}/automation-rules/${r.id}`, { enabled: !r.enabled }),
    onSuccess: refresh, onError,
  });
  const remove = useMutation({
    mutationFn: (ruleId: string) =>
      staffApi.delete(`/staff/platforms/${platformId}/automation-rules/${ruleId}`),
    onSuccess: () => { toast.success('Rule deleted.'); refresh(); },
    onError,
  });

  const staffName = (id: string) => staff?.find((s) => s.id === id)?.name ?? id.slice(0, 8);
  const labelName = (id: string) => labels?.find((l) => l.id === id)?.name ?? id.slice(0, 8);
  const describeAction = (r: AutomationRuleView) =>
    r.action === 'SET_PRIORITY' ? `set priority ${PRIORITY_META[r.actionValue as Priority]?.label ?? r.actionValue}`
      : r.action === 'ASSIGN' ? `assign to ${staffName(r.actionValue)}`
        : `add label "${labelName(r.actionValue)}"`;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Zap className="h-4 w-4" /> Automation rules
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="ml-auto"><Plus className="h-4 w-4" /> New rule</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New automation rule</DialogTitle>
                <DialogDescription>When the trigger fires, the action is applied automatically.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Escalate new criticals" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>When</Label>
                    <Select value={trigger} onValueChange={(v) => setTrigger(v as typeof trigger)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ISSUE_CREATED">Issue created</SelectItem>
                        <SelectItem value="STATUS_CHANGED">Status changed</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {trigger === 'STATUS_CHANGED' && (
                    <div className="space-y-1.5">
                      <Label>To status</Label>
                      <Select value={triggerStatus} onValueChange={setTriggerStatus}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__any__">Any</SelectItem>
                          {STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Then</Label>
                    <Select value={action} onValueChange={(v) => { setAction(v as typeof action); setActionValue(''); }}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="SET_PRIORITY">Set priority</SelectItem>
                        <SelectItem value="ASSIGN">Assign to</SelectItem>
                        <SelectItem value="ADD_LABEL">Add label</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label>Value</Label>
                    <Select value={actionValue} onValueChange={setActionValue}>
                      <SelectTrigger><SelectValue placeholder="Pick…" /></SelectTrigger>
                      <SelectContent>
                        {action === 'SET_PRIORITY'
                          && PRIORITIES.map((p) => <SelectItem key={p} value={p}>{PRIORITY_META[p].label}</SelectItem>)}
                        {action === 'ASSIGN'
                          && staff?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                        {action === 'ADD_LABEL'
                          && (labels?.length
                            ? labels.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)
                            : <SelectItem value="__none__" disabled>No labels on this platform</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => create.mutate()} disabled={!name.trim() || !actionValue || create.isPending}>
                  {create.isPending && <Spinner />} Create rule
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rulesLoading && <ListSkeleton rows={2} />}
        {!rulesLoading && (rules ?? []).length === 0 && (
          <CompactEmpty icon={<Zap />} title="No automation rules">
            New issues stay exactly as reported.
          </CompactEmpty>
        )}
        {(rules ?? []).map((r) => (
          <div key={r.id} className="flex items-center gap-3 rounded-md border border-border/60 px-3 py-2 text-sm">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{r.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                When {r.trigger === 'ISSUE_CREATED' ? 'an issue is created' : `status → ${r.triggerStatus ? STATUS_META[r.triggerStatus].label : 'any'}`}
                {' → '}{describeAction(r)}
              </p>
            </div>
            <Button size="sm" variant={r.enabled ? 'secondary' : 'outline'} className="h-7 text-xs" onClick={() => toggle.mutate(r)}>
              {r.enabled ? 'Enabled' : 'Disabled'}
            </Button>
            <ConfirmDialog
              title="Delete this automation rule?"
              confirmLabel="Delete rule"
              onConfirm={() => remove.mutate(r.id)}
              description={(
                <p>
                  <strong>{r.name}</strong> stops applying to new issues. Issues it already
                  changed keep those changes. To pause it instead, toggle it to Disabled.
                </p>
              )}
              trigger={(
                <button type="button" className={DESTRUCTIVE_ICON} aria-label={`Delete rule ${r.name}`}>
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function ApiTokensCard({ platformId }: { platformId: string }) {
  const qc = useQueryClient();
  const key = ['admin', 'api-tokens', platformId];
  const [name, setName] = useState('');
  const [freshToken, setFreshToken] = useState<string | null>(null);

  const { data: tokens, isLoading: tokensLoading } = useQuery({
    queryKey: key,
    queryFn: async () =>
      (await staffApi.get<ApiTokenView[]>(`/staff/platforms/${platformId}/api-tokens`)).data,
  });
  const create = useMutation({
    mutationFn: async () =>
      (await staffApi.post<ApiTokenView>(`/staff/platforms/${platformId}/api-tokens`, { name })).data,
    onSuccess: (t) => {
      setName('');
      setFreshToken(t.token ?? null);
      qc.invalidateQueries({ queryKey: key });
    },
    onError,
  });
  const revoke = useMutation({
    mutationFn: (tokenId: string) =>
      staffApi.delete(`/staff/platforms/${platformId}/api-tokens/${tokenId}`),
    onSuccess: () => { toast.success('Token revoked.'); qc.invalidateQueries({ queryKey: key }); },
    onError,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><KeyRound className="h-4 w-4" /> API tokens</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Read-only issue access for this platform (send as <code>Authorization: Bearer &lt;token&gt;</code> to <code>/api/integrations/issues</code>).
        </p>
        {freshToken && <SecretOnce label="API token" value={freshToken} />}
        <div className="flex items-center gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) create.mutate(); }}
            placeholder="Token name (e.g. status-page)"
            className="h-8 text-sm"
          />
          <Button size="sm" variant="secondary" disabled={!name.trim() || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? <Spinner className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          </Button>
        </div>
        <div className="space-y-1.5">
          {tokensLoading && <ListSkeleton rows={2} />}
          {!tokensLoading && (tokens ?? []).length === 0 && (
            <CompactEmpty icon={<KeyRound />} title="No API tokens">
              Issue one to give a system read-only access to this platform&apos;s issues.
            </CompactEmpty>
          )}
          {(tokens ?? []).map((t) => (
            <div key={t.id} className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-sm">
              <span className="font-medium">{t.name}</span>
              <code className="text-xs text-muted-foreground">…{t.lastFour}</code>
              {t.revoked && <Badge variant="outline" className="text-muted-foreground">revoked</Badge>}
              <span className="ml-auto text-xs text-muted-foreground">
                {t.lastUsedAt ? `used ${shortDate(t.lastUsedAt)}` : 'never used'}
              </span>
              {!t.revoked && (
                <ConfirmDialog
                  title="Revoke this API token?"
                  confirmLabel="Revoke token"
                  onConfirm={() => revoke.mutate(t.id)}
                  description={(
                    <p>
                      Any integration still sending <strong>{t.name}</strong> (…{t.lastFour}) starts
                      getting 401s immediately. This cannot be undone — issue a new token instead.
                    </p>
                  )}
                  trigger={(
                    <button type="button" className={DESTRUCTIVE_ICON} aria-label={`Revoke token ${t.name}`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                />
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

// Per-platform reply templates ("macros"). Staff insert these in the comment
// composer (IssueDetailPanel); the {{placeholders}} are filled there at insert.
function CannedResponsesCard({ platformId }: { platformId: string }) {
  const qc = useQueryClient();
  const key = ['staff', 'canned-responses', platformId];
  const { data: items, isLoading } = useQuery({
    queryKey: key,
    queryFn: async () =>
      (await staffApi.get<CannedResponseView[]>(`/staff/platforms/${platformId}/canned-responses`)).data,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');

  const startCreate = () => { setEditingId(null); setTitle(''); setBody(''); setOpen(true); };
  const startEdit = (r: CannedResponseView) => { setEditingId(r.id); setTitle(r.title); setBody(r.body); setOpen(true); };

  const save = useMutation({
    mutationFn: () => (editingId
      ? staffApi.patch(`/staff/platforms/${platformId}/canned-responses/${editingId}`, { title, body })
      : staffApi.post(`/staff/platforms/${platformId}/canned-responses`, { title, body })),
    onSuccess: () => {
      setOpen(false);
      toast.success(editingId ? 'Template updated.' : 'Template created.');
      refresh();
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (id: string) => staffApi.delete(`/staff/platforms/${platformId}/canned-responses/${id}`),
    onSuccess: () => { toast.success('Template deleted.'); refresh(); },
    onError,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <MessageSquareText className="h-4 w-4" /> Canned responses
          <Button size="sm" className="ml-auto" onClick={startCreate}><Plus className="h-4 w-4" /> New</Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Reply templates staff insert in the comment box. Use{' '}
          <code>{'{{reporter}}'}</code>, <code>{'{{reference}}'}</code>,{' '}
          <code>{'{{assignee}}'}</code>, <code>{'{{platform}}'}</code>.
        </p>
        {isLoading && <ListSkeleton rows={2} />}
        {!isLoading && (items ?? []).length === 0 && (
          <CompactEmpty icon={<MessageSquareText />} title="No canned responses">
            Save a reply you send often to reuse it in one click.
          </CompactEmpty>
        )}
        {(items ?? []).map((r) => (
          <div key={r.id} className="flex items-start gap-2 rounded-md border border-border/60 px-3 py-2 text-sm">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{r.title}</p>
              <p className="line-clamp-2 whitespace-pre-wrap text-xs text-muted-foreground">{r.body}</p>
            </div>
            <button type="button" className={NEUTRAL_ICON} aria-label={`Edit ${r.title}`} onClick={() => startEdit(r)}>
              <Pencil className="h-4 w-4" />
            </button>
            <ConfirmDialog
              title="Delete this canned response?"
              confirmLabel="Delete"
              onConfirm={() => remove.mutate(r.id)}
              description={<p><strong>{r.title}</strong> will no longer be available to insert.</p>}
              trigger={(
                <button type="button" className={DESTRUCTIVE_ICON} aria-label={`Delete ${r.title}`}>
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            />
          </div>
        ))}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Edit canned response' : 'New canned response'}</DialogTitle>
            <DialogDescription>
              Placeholders like <code>{'{{reporter}}'}</code> are filled in when a template is inserted.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>Title</Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder="Ask for logs" />
            </div>
            <div className="space-y-1.5">
              <Label>Body</Label>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={5000}
                className="min-h-32"
                placeholder="Hi {{reporter}}, could you attach the console logs from when this happened? Thanks!"
              />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={() => save.mutate()} disabled={!title.trim() || !body.trim() || save.isPending}>
              {save.isPending && <Spinner />} {editingId ? 'Save changes' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ── Webhooks tab (global, admin-only endpoints) ─────────────────────────────
export function WebhooksTab() {
  const qc = useQueryClient();
  const { data: platforms } = usePlatforms();
  const key = ['admin', 'webhooks'];
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [platformId, setPlatformId] = useState('__all__');
  const [events, setEvents] = useState<Set<string>>(new Set());
  const [freshSecret, setFreshSecret] = useState<string | null>(null);

  const { data: hooks, isLoading: hooksLoading } = useQuery({
    queryKey: key,
    queryFn: async () => (await staffApi.get<WebhookView[]>('/admin/webhooks')).data,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  const create = useMutation({
    mutationFn: async () =>
      (await staffApi.post<WebhookView>('/admin/webhooks', {
        url,
        ...(platformId !== '__all__' ? { platformId } : {}),
        ...(events.size ? { events: [...events] } : {}),
      })).data,
    onSuccess: (w) => {
      setOpen(false); setUrl(''); setEvents(new Set()); setPlatformId('__all__');
      setFreshSecret(w.secret ?? null);
      refresh();
    },
    onError,
  });
  const toggle = useMutation({
    mutationFn: (w: WebhookView) => staffApi.patch(`/admin/webhooks/${w.id}`, { enabled: !w.enabled }),
    onSuccess: refresh, onError,
  });
  const remove = useMutation({
    mutationFn: (id: string) => staffApi.delete(`/admin/webhooks/${id}`),
    onSuccess: () => { toast.success('Webhook deleted.'); refresh(); },
    onError,
  });

  const platformKey = (id: string | null) =>
    id ? platforms?.find((p) => p.id === id)?.key ?? '?' : 'all platforms';

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Signed JSON POSTs on issue events (<code>X-CIMP-Signature</code>, HMAC-SHA256 over the raw body).
          </p>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4" /> New webhook</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create webhook</DialogTitle>
                <DialogDescription>HTTPS only; private/loopback targets are rejected.</DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Endpoint URL</Label>
                  <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://ops.example.com/hooks/cimp" />
                </div>
                <div className="space-y-1.5">
                  <Label>Platform</Label>
                  <Select value={platformId} onValueChange={setPlatformId}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__all__">All platforms</SelectItem>
                      {platforms?.map((p) => <SelectItem key={p.id} value={p.id}>{p.key}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label>Events (none selected = all)</Label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {EVENT_NAMES.map((ev) => (
                      <label key={ev} className="flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={events.has(ev)}
                          onChange={(e) => {
                            const next = new Set(events);
                            if (e.target.checked) next.add(ev); else next.delete(ev);
                            setEvents(next);
                          }}
                        />
                        <code>{ev}</code>
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => create.mutate()} disabled={!url.trim() || create.isPending}>
                  {create.isPending && <Spinner />} Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {freshSecret && <SecretOnce label="Signing secret" value={freshSecret} />}

        <div className="space-y-1.5">
          {hooksLoading && <ListSkeleton rows={2} />}
          {!hooksLoading && (hooks ?? []).length === 0 && (
            <CompactEmpty icon={<Webhook />} title="No webhooks configured">
              Add one to push signed issue events to your own systems.
            </CompactEmpty>
          )}
          {(hooks ?? []).map((w) => (
            <div key={w.id} className="flex items-center gap-3 rounded-md border border-border/60 px-3 py-2 text-sm">
              <Webhook className="h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-xs">{w.url}</p>
                <p className="truncate text-xs text-muted-foreground">
                  {platformKey(w.platformId)} · {w.events.length ? w.events.join(', ') : 'all events'}
                </p>
              </div>
              <Button size="sm" variant={w.enabled ? 'secondary' : 'outline'} className="h-7 text-xs" onClick={() => toggle.mutate(w)}>
                {w.enabled ? 'Enabled' : 'Disabled'}
              </Button>
              <ConfirmDialog
                title="Delete this webhook?"
                confirmLabel="Delete webhook"
                onConfirm={() => remove.mutate(w.id)}
                description={(
                  <>
                    <p>
                      CIMP stops posting events to <code className="break-all">{w.url}</code>.
                    </p>
                    <p>
                      Its signing secret is destroyed — recreating the endpoint later issues a new
                      one you'll have to redeploy. To pause it, toggle it to Disabled instead.
                    </p>
                  </>
                )}
                trigger={(
                  <button type="button" className={DESTRUCTIVE_ICON} aria-label={`Delete webhook ${w.url}`}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              />

            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
