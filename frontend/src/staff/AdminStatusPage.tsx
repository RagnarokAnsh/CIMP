import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ExternalLink, Megaphone, Plus, Server, Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { staffApi } from '@/api/client';
import type {
  ComponentStatus, IncidentStatus, IncidentView, PlatformItem, StatusComponentView,
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
import { toastApiError as onError } from '@/lib/toast-error';
import {
  COMPONENT_STATUS_META, COMPONENT_STATUSES, INCIDENT_IMPACTS, INCIDENT_IMPACT_META,
  INCIDENT_STATUSES, INCIDENT_STATUS_META,
} from '@/lib/status-meta';
import { dateTime } from '@/lib/format';
import { cn } from '@/lib/utils';

const DESTRUCTIVE_ICON =
  'grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors '
  + 'hover:bg-destructive/10 hover:text-destructive focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none';

// Status-page management: components and incidents for one platform. Both write
// to /staff/platforms/:id/status/* (write-role enforced server-side) and are
// immediately visible on the public page at /status/:key.
export function StatusPageTab() {
  const { data: platforms } = useQuery({
    queryKey: ['admin', 'platforms'],
    queryFn: async () => (await staffApi.get<PlatformItem[]>('/admin/platforms')).data,
  });
  const [selected, setSelected] = useState('');
  const active = selected || platforms?.[0]?.id || '';
  const activePlatform = platforms?.find((p) => p.id === active);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex flex-wrap items-end gap-3 pt-6">
          <div className="space-y-1.5">
            <Label>Platform</Label>
            <Select value={active} onValueChange={setSelected}>
              <SelectTrigger className="w-64"><SelectValue placeholder="Select platform" /></SelectTrigger>
              <SelectContent>
                {platforms?.map((p) => <SelectItem key={p.id} value={p.id}>{p.name} ({p.key})</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {activePlatform && (
            <Button asChild variant="outline" size="sm" className="mb-0.5 gap-1.5">
              <a href={`/status/${activePlatform.key}`} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5" /> View public page
              </a>
            </Button>
          )}
        </CardContent>
      </Card>

      {active && (
        <div className="grid gap-4 xl:grid-cols-2">
          <ComponentsCard platformId={active} />
          <IncidentsCard platformId={active} />
        </div>
      )}
    </div>
  );
}

function ComponentsCard({ platformId }: { platformId: string }) {
  const qc = useQueryClient();
  const key = ['staff', 'status-components', platformId];
  const { data: items, isLoading } = useQuery({
    queryKey: key,
    queryFn: async () =>
      (await staffApi.get<StatusComponentView[]>(`/staff/platforms/${platformId}/status/components`)).data,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: key });

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const create = useMutation({
    mutationFn: () =>
      staffApi.post(`/staff/platforms/${platformId}/status/components`, {
        name,
        ...(description.trim() ? { description } : {}),
      }),
    onSuccess: () => {
      setOpen(false); setName(''); setDescription('');
      toast.success('Component added.'); refresh();
    },
    onError,
  });
  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: ComponentStatus }) =>
      staffApi.patch(`/staff/platforms/${platformId}/status/components/${v.id}`, { status: v.status }),
    onSuccess: () => { toast.success('Status updated.'); refresh(); },
    onError,
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      staffApi.delete(`/staff/platforms/${platformId}/status/components/${id}`),
    onSuccess: () => { toast.success('Component removed.'); refresh(); },
    onError,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Server className="h-4 w-4" /> Components
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="ml-auto"><Plus className="h-4 w-4" /> Add</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add a component</DialogTitle>
                <DialogDescription>
                  A named part of your service, shown publicly with its current health.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Name</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} placeholder="API" />
                </div>
                <div className="space-y-1.5">
                  <Label>Description (optional)</Label>
                  <Input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength={300}
                    placeholder="Public REST API"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button onClick={() => create.mutate()} disabled={!name.trim() || create.isPending}>
                  {create.isPending && <Spinner />} Add component
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && <div className="space-y-1.5">{[0, 1].map((i) => <Skeleton key={i} className="h-11 w-full" />)}</div>}
        {!isLoading && (items ?? []).length === 0 && (
          <div className="flex flex-col items-center gap-1 rounded-md border border-dashed border-border/70 px-4 py-6 text-center">
            <span className="mb-1 rounded-full bg-muted p-2 text-muted-foreground"><Server className="size-4" /></span>
            <p className="text-sm font-medium">No components yet</p>
            <p className="text-xs text-muted-foreground">Add the parts of your service you want to report on.</p>
          </div>
        )}
        {(items ?? []).map((c) => (
          <div key={c.id} className="flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-sm">
            <span className={cn('size-2 shrink-0 rounded-full', COMPONENT_STATUS_META[c.status].dot)} aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{c.name}</p>
              {c.description && <p className="truncate text-xs text-muted-foreground">{c.description}</p>}
            </div>
            <Select
              value={c.status}
              onValueChange={(v) => setStatus.mutate({ id: c.id, status: v as ComponentStatus })}
            >
              <SelectTrigger className="h-7 w-44 text-xs"><SelectValue /></SelectTrigger>
              <SelectContent>
                {COMPONENT_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>{COMPONENT_STATUS_META[s].label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <ConfirmDialog
              title="Delete this component?"
              confirmLabel="Delete"
              onConfirm={() => remove.mutate(c.id)}
              description={<p><strong>{c.name}</strong> disappears from the public status page.</p>}
              trigger={(
                <button type="button" className={DESTRUCTIVE_ICON} aria-label={`Delete ${c.name}`}>
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

function IncidentsCard({ platformId }: { platformId: string }) {
  const qc = useQueryClient();
  const key = ['staff', 'status-incidents', platformId];
  const { data: items, isLoading } = useQuery({
    queryKey: key,
    queryFn: async () =>
      (await staffApi.get<IncidentView[]>(`/staff/platforms/${platformId}/status/incidents`)).data,
  });
  const { data: components } = useQuery({
    queryKey: ['staff', 'status-components', platformId],
    queryFn: async () =>
      (await staffApi.get<StatusComponentView[]>(`/staff/platforms/${platformId}/status/components`)).data,
  });
  const refresh = () => {
    qc.invalidateQueries({ queryKey: key });
    qc.invalidateQueries({ queryKey: ['staff', 'status-components', platformId] });
  };

  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [impact, setImpact] = useState('MINOR');
  const [affected, setAffected] = useState<Set<string>>(new Set());

  // Per-incident "post update" composer state, keyed by incident id.
  const [updating, setUpdating] = useState<string | null>(null);
  const [updateBody, setUpdateBody] = useState('');
  const [updateStatus, setUpdateStatus] = useState<IncidentStatus>('IDENTIFIED');

  const create = useMutation({
    mutationFn: () =>
      staffApi.post(`/staff/platforms/${platformId}/status/incidents`, {
        title,
        body,
        impact,
        ...(affected.size ? { componentIds: [...affected] } : {}),
      }),
    onSuccess: () => {
      setOpen(false); setTitle(''); setBody(''); setAffected(new Set());
      toast.success('Incident published.'); refresh();
    },
    onError,
  });
  const postUpdate = useMutation({
    mutationFn: (incidentId: string) =>
      staffApi.post(`/staff/platforms/${platformId}/status/incidents/${incidentId}/updates`, {
        status: updateStatus,
        body: updateBody,
      }),
    onSuccess: () => {
      setUpdating(null); setUpdateBody('');
      toast.success('Update posted.'); refresh();
    },
    onError,
  });
  const remove = useMutation({
    mutationFn: (id: string) =>
      staffApi.delete(`/staff/platforms/${platformId}/status/incidents/${id}`),
    onSuccess: () => { toast.success('Incident deleted.'); refresh(); },
    onError,
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Megaphone className="h-4 w-4" /> Incidents
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="ml-auto"><Plus className="h-4 w-4" /> New incident</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Publish an incident</DialogTitle>
                <DialogDescription>
                  This appears on the public status page immediately.
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Title</Label>
                  <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} placeholder="Elevated error rates on the API" />
                </div>
                <div className="space-y-1.5">
                  <Label>First update — what you know now</Label>
                  <Textarea
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                    maxLength={5000}
                    className="min-h-24"
                    placeholder="We're investigating reports of slow responses on the API."
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Impact</Label>
                  <Select value={impact} onValueChange={setImpact}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {INCIDENT_IMPACTS.map((i) => (
                        <SelectItem key={i} value={i}>{INCIDENT_IMPACT_META[i].label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {(components ?? []).length > 0 && (
                  <div className="space-y-1.5">
                    <Label>Affected components (optional)</Label>
                    <div className="grid grid-cols-2 gap-1.5">
                      {components!.map((c) => (
                        <label key={c.id} className="flex items-center gap-2 text-xs">
                          <input
                            type="checkbox"
                            checked={affected.has(c.id)}
                            onChange={(e) => {
                              const next = new Set(affected);
                              if (e.target.checked) next.add(c.id); else next.delete(c.id);
                              setAffected(next);
                            }}
                          />
                          {c.name}
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button onClick={() => create.mutate()} disabled={!title.trim() || !body.trim() || create.isPending}>
                  {create.isPending && <Spinner />} Publish
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {isLoading && <div className="space-y-1.5">{[0, 1].map((i) => <Skeleton key={i} className="h-11 w-full" />)}</div>}
        {!isLoading && (items ?? []).length === 0 && (
          <div className="flex flex-col items-center gap-1 rounded-md border border-dashed border-border/70 px-4 py-6 text-center">
            <span className="mb-1 rounded-full bg-muted p-2 text-muted-foreground"><Megaphone className="size-4" /></span>
            <p className="text-sm font-medium">No incidents published</p>
            <p className="text-xs text-muted-foreground">The public page reads &ldquo;all systems operational&rdquo;.</p>
          </div>
        )}
        {(items ?? []).map((i) => (
          <div key={i.id} className="space-y-2 rounded-md border border-border/60 px-3 py-2 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-medium">{i.title}</span>
              <Badge variant="outline" className={INCIDENT_STATUS_META[i.status].className}>
                {INCIDENT_STATUS_META[i.status].label}
              </Badge>
              <ConfirmDialog
                title="Delete this incident?"
                confirmLabel="Delete"
                onConfirm={() => remove.mutate(i.id)}
                description={<p>The incident and its whole public timeline are removed.</p>}
                trigger={(
                  <button type="button" className={DESTRUCTIVE_ICON} aria-label={`Delete ${i.title}`}>
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Started {dateTime(i.startedAt)} · {i.updates.length} update{i.updates.length === 1 ? '' : 's'}
              {i.components.length > 0 && ` · ${i.components.map((c) => c.name).join(', ')}`}
            </p>

            {updating === i.id ? (
              <div className="space-y-2 rounded-md bg-muted/40 p-2">
                <div className="flex items-center gap-2">
                  <Select value={updateStatus} onValueChange={(v) => setUpdateStatus(v as IncidentStatus)}>
                    <SelectTrigger className="h-7 w-40 text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {INCIDENT_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>{INCIDENT_STATUS_META[s].label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setUpdating(null)}>
                    Cancel
                  </Button>
                </div>
                <Textarea
                  value={updateBody}
                  onChange={(e) => setUpdateBody(e.target.value)}
                  maxLength={5000}
                  className="min-h-16 text-sm"
                  placeholder="What changed since the last update?"
                />
                <Button
                  size="sm"
                  disabled={!updateBody.trim() || postUpdate.isPending}
                  onClick={() => postUpdate.mutate(i.id)}
                >
                  {postUpdate.isPending && <Spinner />} Post update
                </Button>
              </div>
            ) : (
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => {
                  setUpdating(i.id);
                  setUpdateBody('');
                  // Default to the next sensible step rather than repeating the
                  // status it already has.
                  setUpdateStatus(i.status === 'INVESTIGATING' ? 'IDENTIFIED'
                    : i.status === 'IDENTIFIED' ? 'MONITORING' : 'RESOLVED');
                }}
              >
                Post update
              </Button>
            )}
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
