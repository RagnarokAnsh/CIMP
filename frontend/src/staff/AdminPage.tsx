import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Boxes, KeyRound, Plus, Timer, Trash2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { staffApi } from '@/api/client';
import type { PlatformItem, Role } from '@/api/types';
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
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle,
} from '@/components/ui/empty';
import { initials } from '@/lib/format';
import { toastApiError } from '@/lib/toast-error';
import { roleLabel } from '@/lib/issue-meta';
import { Spinner } from '@/components/ui/spinner';
import { IntegrationsTab, WebhooksTab } from './AdminIntegrations';

interface StaffWithRoles {
  id: string;
  name: string;
  email: string;
  status: string;
  roles: { id: string; role: Role; platformId: string | null; platformKey: string | null }[];
}

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

function PlatformsTab() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState('');
  const [name, setName] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'platforms'],
    queryFn: async () => (await staffApi.get<PlatformItem[]>('/admin/platforms')).data,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['admin', 'platforms'] });
  const onError = toastApiError;

  const create = useMutation({
    mutationFn: () => staffApi.post('/admin/platforms', { key, name }),
    onSuccess: () => { setOpen(false); setKey(''); setName(''); toast.success('Platform created.'); invalidate(); },
    onError,
  });
  const rotate = useMutation({
    mutationFn: (id: string) => staffApi.post(`/admin/platforms/${id}/rotate-secret`),
    onSuccess: (res) => toast.success(`New secret: ${(res.data as any).handoffSecret}`, { duration: 12000 }),
    onError,
  });

  return (
    <Card>
      <CardContent className="space-y-4 pt-6">
        <div className="flex justify-end">
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
                  <Input id="key" value={key} onChange={(e) => setKey(e.target.value)} placeholder="portal-a" />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="name">Name</Label>
                  <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Portal A" />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => create.mutate()} disabled={!key || !name || create.isPending}>
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
                <TableHead className="text-right">Secret</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data?.map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-mono text-sm">{p.key}</TableCell>
                  <TableCell>{p.name}</TableCell>
                  <TableCell>
                    <Badge variant={p.status === 'ACTIVE' ? 'secondary' : 'outline'}>{p.status}</Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {p.jiraEnabled ? p.jiraProjectKey ?? 'enabled' : '—'}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1.5">
                      <SlaPolicyDialog platform={p} onSaved={invalidate} />
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={rotate.isPending}
                        onClick={() => rotate.mutate(p.id)}
                      >
                        <KeyRound className="h-4 w-4" /> Rotate
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
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

const ROLES: Role[] = ['FOCAL_POINT', 'DEVELOPER', 'ADMIN', 'WATCHER'];

function StaffTab() {
  const queryClient = useQueryClient();
  const [staffUserId, setStaffUserId] = useState('');
  const [role, setRole] = useState<Role>('DEVELOPER');
  const [platformId, setPlatformId] = useState<string>('');
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');

  const { data: staff, isLoading } = useQuery({
    queryKey: ['admin', 'staff'],
    queryFn: async () => (await staffApi.get<StaffWithRoles[]>('/admin/staff')).data,
  });
  const { data: platforms } = useQuery({
    queryKey: ['admin', 'platforms'],
    queryFn: async () => (await staffApi.get<PlatformItem[]>('/admin/platforms')).data,
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
  const assign = useMutation({
    mutationFn: () =>
      staffApi.post('/admin/roles', {
        staffUserId,
        role,
        platformId: role === 'ADMIN' ? null : platformId || null,
      }),
    onSuccess: () => { toast.success('Role assigned.'); invalidate(); },
    onError,
  });
  const revoke = useMutation({
    mutationFn: (roleId: string) => staffApi.delete(`/admin/roles/${roleId}`),
    onSuccess: () => { toast.success('Role revoked.'); invalidate(); },
    onError,
  });

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button size="sm"><UserPlus className="h-4 w-4" /> Add staff</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create staff account</DialogTitle>
              <DialogDescription>
                They log in with this email and password. New accounts have no roles — assign one below afterwards.
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
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="space-y-1.5">
            <Label>Staff member</Label>
            <Select value={staffUserId} onValueChange={setStaffUserId}>
              <SelectTrigger className="w-56"><SelectValue placeholder="Select staff" /></SelectTrigger>
              <SelectContent>
                {staff?.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={(v) => setRole(v as Role)}>
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ROLES.map((r) => <SelectItem key={r} value={r}>{roleLabel(r)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Platform</Label>
            <Select
              value={platformId || '__global__'}
              onValueChange={(v) => setPlatformId(v === '__global__' ? '' : v)}
              disabled={role === 'ADMIN'}
            >
              <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="__global__">Global</SelectItem>
                {platforms?.map((p) => <SelectItem key={p.id} value={p.id}>{p.key}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={() => assign.mutate()} disabled={!staffUserId || assign.isPending}>
            {assign.isPending && <Spinner />} Assign role
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {isLoading ? (
            <Skeleton className="h-32 w-full" />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Roles</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {staff?.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell>
                      <span className="flex items-center gap-2.5 font-medium">
                        <Avatar className="size-7"><AvatarFallback className="text-[11px]">{initials(s.name)}</AvatarFallback></Avatar>
                        {s.name}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{s.email}</TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1.5">
                        {s.roles.length === 0 && <span className="text-sm text-muted-foreground">None</span>}
                        {s.roles.map((r) => (
                          <Badge key={r.id} variant="secondary" className="gap-1">
                            {roleLabel(r.role)}
                            {r.platformKey ? ` · ${r.platformKey}` : ' · global'}
                            <button
                              className="ml-0.5 text-muted-foreground hover:text-destructive"
                              title="Revoke"
                              onClick={() => revoke.mutate(r.id)}
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
