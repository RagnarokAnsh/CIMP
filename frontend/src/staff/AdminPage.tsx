import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Ban, Boxes, CheckCircle2, KeyRound, MoreHorizontal, Pencil, Plus, Search, Timer,
  Trash2, UserCog, UserPlus, Users, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { staffApi } from '@/api/client';
import type { PlatformItem, Role, StaffMe, StaffWithRoles } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle,
} from '@/components/ui/empty';
import { Spinner } from '@/components/ui/spinner';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { SecretOnceDialog } from '@/components/SecretOnce';
import { initials } from '@/lib/format';
import { toastApiError } from '@/lib/toast-error';
import { roleLabel } from '@/lib/issue-meta';
import { IntegrationsTab, WebhooksTab } from './AdminIntegrations';

export function AdminPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Administration</h1>
        <p className="text-sm text-muted-foreground">Manage platforms, staff, and role assignments.</p>
      </div>
      <Tabs defaultValue="platforms">
        <TabsList>
          <TabsTrigger value="platforms">Platforms</TabsTrigger>
          <TabsTrigger value="staff">Staff &amp; roles</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          <TabsTrigger value="webhooks">Webhooks</TabsTrigger>
        </TabsList>
        <TabsContent value="platforms"><PlatformsTab /></TabsContent>
        <TabsContent value="staff"><StaffTab /></TabsContent>
        <TabsContent value="integrations"><IntegrationsTab /></TabsContent>
        <TabsContent value="webhooks"><WebhooksTab /></TabsContent>
      </Tabs>
    </div>
  );
}

// ── Platforms ───────────────────────────────────────────────────────────────

function PlatformsTab() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState('');
  const [name, setName] = useState('');
  const [rotatedSecret, setRotatedSecret] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'platforms'],
    queryFn: async () => (await staffApi.get<PlatformItem[]>('/admin/platforms')).data,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'platforms'] });
  const onError = toastApiError;

  // The key is immutable once issued, so validate its shape before the round
  // trip rather than surfacing a 400 after the fact.
  const keyValid = /^[a-z0-9-]{2,40}$/.test(key);

  const create = useMutation({
    mutationFn: () => staffApi.post('/admin/platforms', { key, name }),
    onSuccess: () => { setOpen(false); setKey(''); setName(''); toast.success('Platform created.'); invalidate(); },
    onError,
  });
  const rotate = useMutation({
    mutationFn: async (id: string) =>
      (await staffApi.post<{ handoffSecret: string }>(`/admin/platforms/${id}/rotate-secret`)).data,
    onSuccess: (res) => setRotatedSecret(res.handoffSecret),
    onError,
  });
  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: string }) =>
      staffApi.patch(`/admin/platforms/${v.id}`, { status: v.status }),
    onSuccess: (_r, v) => {
      toast.success(v.status === 'ACTIVE' ? 'Platform re-enabled.' : 'Platform disabled.');
      invalidate();
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (id: string) => staffApi.delete(`/admin/platforms/${id}`),
    onSuccess: () => { toast.success('Platform deleted.'); invalidate(); },
    onError,
  });

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            Disabling a platform stops new reporter hand-offs and self-support intake while keeping its history.
          </p>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><Plus className="h-4 w-4" /> New platform</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create platform</DialogTitle>
                <DialogDescription>
                  The key is used in hand-off tokens and cannot be changed later.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="key">Key</Label>
                  <Input
                    id="key"
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    placeholder="portal-a"
                    aria-invalid={key.length > 0 && !keyValid}
                  />
                  <p className="text-xs text-muted-foreground">
                    2–40 characters: lowercase letters, digits, hyphens.
                  </p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Portal A" />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => create.mutate()} disabled={!keyValid || !name || create.isPending}>
                  {create.isPending && <Spinner />} Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>

        {isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : data && data.length === 0 ? (
          <Empty className="py-10">
            <EmptyHeader>
              <EmptyMedia variant="icon"><Boxes /></EmptyMedia>
              <EmptyTitle>No platforms yet</EmptyTitle>
              <EmptyDescription>
                Create a platform to start routing its issues. Its key is used in hand-off tokens and can't change later.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Key</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Jira</TableHead>
                <TableHead className="w-px text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.map((p) => (
                <PlatformRow
                  key={p.id}
                  platform={p}
                  onSla={invalidate}
                  onRotate={() => rotate.mutate(p.id)}
                  rotating={rotate.isPending}
                  onSetStatus={(status) => setStatus.mutate({ id: p.id, status })}
                  onDelete={() => remove.mutate(p.id)}
                />
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <SecretOnceDialog
        value={rotatedSecret}
        title="New hand-off signing secret"
        description="Copy this into the portal's backend now — it is never shown again. Hand-off tokens signed with the old secret stop verifying immediately."
        onClose={() => setRotatedSecret(null)}
      />
    </Card>
  );
}

function PlatformRow({
  platform: p, onSla, onRotate, rotating, onSetStatus, onDelete,
}: {
  platform: PlatformItem;
  onSla: () => void;
  onRotate: () => void;
  rotating: boolean;
  onSetStatus: (status: string) => void;
  onDelete: () => void;
}) {
  // The confirm dialogs are rendered as siblings of the menu, not inside it —
  // see ConfirmDialog's controlled mode for why.
  const [confirming, setConfirming] = useState<'disable' | 'delete' | null>(null);
  const disabled = p.status !== 'ACTIVE';

  return (
    <TableRow className={disabled ? 'opacity-60' : undefined}>
      <TableCell className="font-mono text-sm">{p.key}</TableCell>
      <TableCell>{p.name}</TableCell>
      <TableCell>
        <Badge variant={disabled ? 'outline' : 'secondary'}>{p.status}</Badge>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {p.jiraEnabled ? p.jiraProjectKey ?? 'enabled' : '—'}
      </TableCell>
      <TableCell className="text-right">
        <div className="flex justify-end gap-1.5">
          <SlaPolicyDialog platform={p} onSaved={onSla} />
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="icon-sm" aria-label={`Actions for ${p.name}`}>
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-56">
              <DropdownMenuItem className="gap-2" disabled={rotating} onSelect={onRotate}>
                <KeyRound className="h-4 w-4" /> Rotate hand-off secret
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              {disabled ? (
                <DropdownMenuItem className="gap-2" onSelect={() => onSetStatus('ACTIVE')}>
                  <CheckCircle2 className="h-4 w-4" /> Enable
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem className="gap-2" onSelect={() => setConfirming('disable')}>
                  <Ban className="h-4 w-4" /> Disable
                </DropdownMenuItem>
              )}
              <DropdownMenuItem
                className="gap-2 text-destructive focus:text-destructive"
                onSelect={() => setConfirming('delete')}
              >
                <Trash2 className="h-4 w-4" /> Delete…
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </TableCell>

      <ConfirmDialog
        open={confirming === 'disable'}
        onOpenChange={(o) => !o && setConfirming(null)}
        title={`Disable ${p.name}?`}
        confirmLabel="Disable platform"
        onConfirm={() => onSetStatus('DISABLED')}
        description={(
          <>
            <p>
              Reporters on this portal can no longer hand off or submit issues, and its
              self-support and deflection surfaces stop responding.
            </p>
            <p>Existing issues stay visible to staff. You can re-enable at any time.</p>
          </>
        )}
      />
      <ConfirmDialog
        open={confirming === 'delete'}
        onOpenChange={(o) => !o && setConfirming(null)}
        title={`Delete ${p.name} permanently?`}
        confirmLabel="Delete platform"
        confirmPhrase={p.key}
        onConfirm={onDelete}
        description={(
          <>
            <p>
              This removes the platform and everything scoped to it — reporters, role grants,
              labels, API tokens, webhooks and automation rules.
            </p>
            <p>
              Only possible while it holds <strong>no issues</strong>. If it has any, the server
              will refuse — disable it instead.
            </p>
          </>
        )}
      />
    </TableRow>
  );
}

// Per-platform SLA targets (hours). Blank = the deployment's env default.
const SLA_PRIORITIES = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const;

function SlaPolicyDialog({ platform, onSaved }: { platform: PlatformItem; onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [hours, setHours] = useState<Record<string, string>>({});

  const openDialog = (o: boolean) => {
    setOpen(o);
    if (o) {
      setHours(Object.fromEntries(
        SLA_PRIORITIES.map((p) => [p, platform.slaPolicy?.[p]?.toString() ?? '']),
      ));
    }
  };

  const save = useMutation({
    mutationFn: () => {
      const policy: Record<string, number> = {};
      for (const p of SLA_PRIORITIES) {
        const v = hours[p]?.trim();
        if (v) policy[p] = Number(v);
      }
      return staffApi.patch(`/admin/platforms/${platform.id}`, {
        slaPolicy: Object.keys(policy).length ? policy : null,
      });
    },
    onSuccess: () => { setOpen(false); toast.success('SLA policy saved.'); onSaved(); },
    onError: toastApiError,
  });

  const invalid = SLA_PRIORITIES.some((p) => {
    const v = hours[p]?.trim();
    return v && (!Number.isFinite(Number(v)) || Number(v) <= 0 || Number(v) > 8760);
  });

  return (
    <Dialog open={open} onOpenChange={openDialog}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" title="SLA targets">
          <Timer className="h-4 w-4" /> SLA
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>SLA targets — {platform.name}</DialogTitle>
          <DialogDescription>
            Hours from report (or reopen) to resolution, per priority. Blank uses the
            deployment default. Breaches escalate to the assignee, focal points and watchers.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          {SLA_PRIORITIES.map((p) => (
            <div key={p} className="space-y-1.5">
              <Label htmlFor={`sla-${p}`}>{p}</Label>
              <Input
                id={`sla-${p}`}
                type="number"
                min={1}
                max={8760}
                value={hours[p] ?? ''}
                onChange={(e) => setHours((h) => ({ ...h, [p]: e.target.value }))}
                placeholder="default"
              />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button onClick={() => save.mutate()} disabled={invalid || save.isPending}>
            {save.isPending && <Spinner />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Staff & roles ───────────────────────────────────────────────────────────

const ROLES: Role[] = ['FOCAL_POINT', 'DEVELOPER', 'ADMIN', 'WATCHER'];

function StaffTab() {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [filter, setFilter] = useState('');

  const { data: staff, isLoading } = useQuery({
    queryKey: ['admin', 'staff'],
    queryFn: async () => (await staffApi.get<StaffWithRoles[]>('/admin/staff')).data,
  });
  const { data: platforms } = useQuery({
    queryKey: ['admin', 'platforms'],
    queryFn: async () => (await staffApi.get<PlatformItem[]>('/admin/platforms')).data,
  });
  // Used to mark "you" and to hide self-destructive actions the server rejects
  // anyway — better to not offer them than to explain a 400.
  const { data: me } = useQuery({
    queryKey: ['staff', 'me'],
    queryFn: async () => (await staffApi.get<StaffMe>('/staff/me')).data,
    staleTime: 5 * 60 * 1000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'staff'] });
  const onError = toastApiError;

  const createStaff = useMutation({
    mutationFn: () => staffApi.post('/admin/staff', { name: newName, email: newEmail, password: newPassword }),
    onSuccess: () => {
      setCreateOpen(false); setNewName(''); setNewEmail(''); setNewPassword('');
      toast.success('Staff account created. Assign a role so they can see issues.');
      invalidate();
    },
    onError,
  });

  const visible = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return staff ?? [];
    return (staff ?? []).filter(
      (s) => s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q),
    );
  }, [staff, filter]);

  const activeAdmins = (staff ?? []).filter(
    (s) => s.status === 'ACTIVE' && s.roles.some((r) => r.role === 'ADMIN'),
  ).length;

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 pt-6">
          <div className="relative min-w-56 flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter by name or email…"
              aria-label="Filter staff"
              className="pl-8"
            />
            {filter && (
              <button
                type="button"
                aria-label="Clear filter"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:text-foreground"
                onClick={() => setFilter('')}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogTrigger asChild>
              <Button size="sm"><UserPlus className="h-4 w-4" /> Add staff</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create staff account</DialogTitle>
                <DialogDescription>
                  They log in with this email and password. New accounts have no roles — assign one from the row menu afterwards.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="staff-name">Name</Label>
                  <Input id="staff-name" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Jane Doe" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="staff-email">Email</Label>
                  <Input id="staff-email" type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="jane@team.com" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="staff-password">Initial password</Label>
                  <Input id="staff-password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="At least 12 characters" />
                  <p className="text-xs text-muted-foreground">
                    {newPassword.length > 0 && newPassword.length < 12
                      ? `${12 - newPassword.length} more character(s) needed.`
                      : 'Minimum 12 characters.'}
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button
                  onClick={() => createStaff.mutate()}
                  disabled={!newName || !newEmail || newPassword.length < 12 || createStaff.isPending}
                >
                  {createStaff.isPending && <Spinner />} Create account
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : visible.length === 0 ? (
            <Empty className="py-10">
              <EmptyHeader>
                <EmptyMedia variant="icon"><Users /></EmptyMedia>
                <EmptyTitle>{filter ? 'No matching staff' : 'No staff accounts yet'}</EmptyTitle>
                <EmptyDescription>
                  {filter
                    ? 'Try a different name or email.'
                    : 'Create an account, then grant it a role so it can see issues.'}
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Roles</TableHead>
                  <TableHead className="w-px text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.map((s) => (
                  <StaffRow
                    key={s.id}
                    staff={s}
                    platforms={platforms ?? []}
                    isSelf={s.id === me?.id}
                    isLastActiveAdmin={
                      activeAdmins === 1
                      && s.status === 'ACTIVE'
                      && s.roles.some((r) => r.role === 'ADMIN')
                    }
                    onChanged={invalidate}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StaffRow({
  staff, platforms, isSelf, isLastActiveAdmin, onChanged,
}: {
  staff: StaffWithRoles;
  platforms: PlatformItem[];
  isSelf: boolean;
  isLastActiveAdmin: boolean;
  onChanged: () => void;
}) {
  const onError = toastApiError;
  const disabled = staff.status !== 'ACTIVE';
  // Every dialog opened from the row menu is rendered OUTSIDE that menu and
  // driven by this state — see ConfirmDialog's controlled mode for why.
  const [confirming, setConfirming] = useState<'disable' | 'delete' | null>(null);
  const [dialog, setDialog] = useState<'edit' | 'password' | null>(null);

  const setStatus = useMutation({
    mutationFn: (status: string) => staffApi.patch(`/admin/staff/${staff.id}`, { status }),
    onSuccess: (_r, status) => {
      toast.success(status === 'ACTIVE' ? 'Account re-enabled.' : 'Account disabled — sessions revoked.');
      onChanged();
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: () => staffApi.delete(`/admin/staff/${staff.id}`),
    onSuccess: () => { toast.success('Staff account deleted.'); onChanged(); },
    onError,
  });
  const revoke = useMutation({
    mutationFn: (roleId: string) => staffApi.delete(`/admin/roles/${roleId}`),
    onSuccess: () => { toast.success('Role revoked.'); onChanged(); },
    onError,
  });

  // Disabling or deleting the last admin (or yourself) is refused server-side;
  // reflect that in the UI so the option isn't offered at all.
  const lockedOut = isSelf || isLastActiveAdmin;
  const lockoutReason = isSelf
    ? 'You cannot disable or delete your own account.'
    : 'This is the last active administrator.';

  return (
    <TableRow className={disabled ? 'opacity-60' : undefined}>
      <TableCell>
        <span className="flex items-center gap-2.5 font-medium">
          <Avatar className="size-7"><AvatarFallback className="text-[11px]">{initials(staff.name)}</AvatarFallback></Avatar>
          {staff.name}
          {isSelf && <span className="text-xs font-normal text-muted-foreground">(you)</span>}
        </span>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{staff.email}</TableCell>
      <TableCell>
        <Badge variant={disabled ? 'outline' : 'secondary'}>{staff.status}</Badge>
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap items-center gap-1.5">
          {staff.roles.length === 0 && <span className="text-sm text-muted-foreground">None</span>}
          {staff.roles.map((r) => (
            <Badge key={r.id} variant="secondary" className="gap-1 pr-1">
              {roleLabel(r.role)}
              {r.platformKey ? ` · ${r.platformKey}` : ' · global'}
              <ConfirmDialog
                title="Revoke this role?"
                confirmLabel="Revoke"
                onConfirm={() => revoke.mutate(r.id)}
                description={(
                  <p>
                    {staff.name} loses <strong>{roleLabel(r.role)}</strong> on{' '}
                    {r.platformKey ? <code>{r.platformKey}</code> : 'all platforms'}. You can grant it again later.
                  </p>
                )}
                trigger={(
                  <button
                    type="button"
                    aria-label={`Revoke ${roleLabel(r.role)} on ${r.platformKey ?? 'all platforms'} from ${staff.name}`}
                    className="ml-0.5 grid size-5 place-items-center rounded text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              />
            </Badge>
          ))}
          <AssignRoleDialog staff={staff} platforms={platforms} onAssigned={onChanged} />
        </div>
      </TableCell>
      <TableCell className="text-right">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon-sm" aria-label={`Actions for ${staff.name}`}>
              <MoreHorizontal className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-56">
            <DropdownMenuLabel className="truncate font-normal text-muted-foreground">
              {staff.email}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="gap-2" onSelect={() => setDialog('edit')}>
              <Pencil className="h-4 w-4" /> Edit details
            </DropdownMenuItem>
            <DropdownMenuItem className="gap-2" onSelect={() => setDialog('password')}>
              <UserCog className="h-4 w-4" /> Set password
            </DropdownMenuItem>
            <DropdownMenuSeparator />

            {disabled ? (
              <DropdownMenuItem className="gap-2" onSelect={() => setStatus.mutate('ACTIVE')}>
                <CheckCircle2 className="h-4 w-4" /> Re-enable account
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                className="gap-2"
                disabled={lockedOut}
                title={lockedOut ? lockoutReason : undefined}
                onSelect={() => setConfirming('disable')}
              >
                <Ban className="h-4 w-4" /> Disable account
              </DropdownMenuItem>
            )}

            <DropdownMenuItem
              className="gap-2 text-destructive focus:text-destructive"
              disabled={lockedOut}
              title={lockedOut ? lockoutReason : undefined}
              onSelect={() => setConfirming('delete')}
            >
              <Trash2 className="h-4 w-4" /> Delete account
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>

      {/* Mounted only while open so each visit starts from the stored values
          rather than whatever the last cancelled edit left behind. */}
      {dialog === 'edit' && (
        <EditStaffDialog staff={staff} onClose={() => setDialog(null)} onSaved={onChanged} />
      )}
      {dialog === 'password' && (
        <SetPasswordDialog staff={staff} onClose={() => setDialog(null)} />
      )}
      <ConfirmDialog
        open={confirming === 'disable'}
        onOpenChange={(o) => !o && setConfirming(null)}
        title={`Disable ${staff.name}?`}
        confirmLabel="Disable account"
        onConfirm={() => setStatus.mutate('DISABLED')}
        description={(
          <>
            <p>
              They are signed out immediately and cannot log back in. Their comments,
              assignments and history are untouched.
            </p>
            <p>This is the recommended way to offboard someone — it is reversible.</p>
          </>
        )}
      />
      <ConfirmDialog
        open={confirming === 'delete'}
        onOpenChange={(o) => !o && setConfirming(null)}
        title={`Delete ${staff.name} permanently?`}
        confirmLabel="Delete account"
        confirmPhrase={staff.email}
        onConfirm={() => remove.mutate()}
        description={(
          <>
            <p>
              Their role grants, watches and saved views are removed. Issues assigned to them
              become unassigned, and their comments stay but lose the author name.
            </p>
            <p>
              <strong>Disabling is usually what you want</strong> — it ends access just as fast
              and keeps attribution intact.
            </p>
          </>
        )}
      />
    </TableRow>
  );
}

// Grant a role to THIS staff member — anchored to their row, so there is no
// separate "pick a person" step to get wrong.
function AssignRoleDialog({
  staff, platforms, onAssigned,
}: {
  staff: StaffWithRoles;
  platforms: PlatformItem[];
  onAssigned: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [role, setRole] = useState<Role>('DEVELOPER');
  const [platformId, setPlatformId] = useState('');

  const assign = useMutation({
    mutationFn: () =>
      staffApi.post('/admin/roles', {
        staffUserId: staff.id,
        role,
        platformId: role === 'ADMIN' ? null : platformId || null,
      }),
    onSuccess: () => {
      setOpen(false); setRole('DEVELOPER'); setPlatformId('');
      toast.success('Role assigned.');
      onAssigned();
    },
    onError: toastApiError,
  });

  // Mirror the server's scope rules (AdminService.assignRole) so the invalid
  // combinations can't be submitted in the first place.
  const needsPlatform = role === 'FOCAL_POINT';
  const globalOnly = role === 'ADMIN';

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={`Assign a role to ${staff.name}`}
          title="Assign role"
          className="text-muted-foreground hover:text-foreground"
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Assign role — {staff.name}</DialogTitle>
          <DialogDescription>
            Focal points are always scoped to one platform; admins are always global.
            Developers and watchers can be either.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select
              value={role}
              onValueChange={(v) => { setRole(v as Role); setPlatformId(''); }}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => <SelectItem key={r} value={r}>{roleLabel(r)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Platform</Label>
            <Select
              value={globalOnly ? '__global__' : platformId || (needsPlatform ? '' : '__global__')}
              onValueChange={(v) => setPlatformId(v === '__global__' ? '' : v)}
              disabled={globalOnly}
            >
              <SelectTrigger>
                <SelectValue placeholder={needsPlatform ? 'Required' : 'Global'} />
              </SelectTrigger>
              <SelectContent>
                {!needsPlatform && <SelectItem value="__global__">Global (all platforms)</SelectItem>}
                {platforms.map((p) => <SelectItem key={p.id} value={p.id}>{p.key}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button
            onClick={() => assign.mutate()}
            disabled={(needsPlatform && !platformId) || assign.isPending}
          >
            {assign.isPending && <Spinner />} Assign role
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function EditStaffDialog({
  staff, onClose, onSaved,
}: {
  staff: StaffWithRoles;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(staff.name);
  const [email, setEmail] = useState(staff.email);

  const save = useMutation({
    mutationFn: () => staffApi.patch(`/admin/staff/${staff.id}`, {
      ...(name !== staff.name ? { name } : {}),
      ...(email.toLowerCase() !== staff.email ? { email } : {}),
    }),
    onSuccess: () => { onClose(); toast.success('Staff details saved.'); onSaved(); },
    onError: toastApiError,
  });

  const emailChanged = email.toLowerCase() !== staff.email;
  const dirty = name !== staff.name || emailChanged;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit staff — {staff.name}</DialogTitle>
          <DialogDescription>Roles are managed from the row; this changes identity only.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor={`edit-name-${staff.id}`}>Name</Label>
            <Input id={`edit-name-${staff.id}`} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor={`edit-email-${staff.id}`}>Email</Label>
            <Input
              id={`edit-email-${staff.id}`}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            {emailChanged && (
              <p className="text-xs text-amber-600 dark:text-amber-500">
                Changing the email re-keys their login and signs them out of all sessions.
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button onClick={() => save.mutate()} disabled={!dirty || !name.trim() || save.isPending}>
            {save.isPending && <Spinner />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Admin-initiated password reset. The endpoint existed from the start but had
// no UI — it was reachable only through Swagger.
function SetPasswordDialog({ staff, onClose }: { staff: StaffWithRoles; onClose: () => void }) {
  const [password, setPassword] = useState('');

  const save = useMutation({
    mutationFn: () => staffApi.post(`/admin/staff/${staff.id}/password`, { password }),
    onSuccess: () => {
      onClose();
      toast.success('Password set — their existing sessions were revoked.');
    },
    onError: toastApiError,
  });

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Set password — {staff.name}</DialogTitle>
          <DialogDescription>
            Replaces their current password and signs them out everywhere. Share it over a
            channel they already trust.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor={`pw-${staff.id}`}>New password</Label>
          <Input
            id={`pw-${staff.id}`}
            type="password"
            value={password}
            autoComplete="new-password"
            onChange={(e) => setPassword(e.target.value)}
            placeholder="At least 12 characters"
          />
          <p className="text-xs text-muted-foreground">
            {password.length > 0 && password.length < 12
              ? `${12 - password.length} more character(s) needed.`
              : 'Minimum 12 characters.'}
          </p>
        </div>
        <DialogFooter>
          <Button onClick={() => save.mutate()} disabled={password.length < 12 || save.isPending}>
            {save.isPending && <Spinner />} Set password
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
