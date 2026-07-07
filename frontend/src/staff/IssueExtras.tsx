import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, Link2, Plus, Tag, X } from 'lucide-react';
import { toast } from 'sonner';
import { staffApi } from '@/api/client';
import type {
  IssueLinkType, IssueLinkView, LabelView, Paginated, StaffIssueSummary, WatchersView,
} from '@/api/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Spinner } from '@/components/ui/spinner';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

const onError = (e: any) => {
  const msg = e?.response?.data?.message ?? 'Action failed.';
  toast.error(Array.isArray(msg) ? msg.join(' ') : msg);
};

// ── Watch toggle ──────────────────────────────────────────────────────────
export function IssueWatch({ issueId }: { issueId: string }) {
  const qc = useQueryClient();
  const key = ['staff', 'issue', issueId, 'watchers'];
  const { data } = useQuery({
    queryKey: key,
    queryFn: async () => (await staffApi.get<WatchersView>(`/staff/issues/${issueId}/watchers`)).data,
  });
  const set = (res: WatchersView) => qc.setQueryData(key, res);
  const watch = useMutation({
    mutationFn: async () => (await staffApi.post<WatchersView>(`/staff/issues/${issueId}/watchers`)).data,
    onSuccess: set, onError,
  });
  const unwatch = useMutation({
    mutationFn: async () => (await staffApi.delete<WatchersView>(`/staff/issues/${issueId}/watchers`)).data,
    onSuccess: set, onError,
  });
  const watching = data?.watching ?? false;
  const busy = watch.isPending || unwatch.isPending;
  const count = data?.watchers.length ?? 0;

  return (
    <Button
      variant={watching ? 'secondary' : 'outline'}
      size="sm"
      className="gap-1.5"
      disabled={busy}
      onClick={() => (watching ? unwatch : watch).mutate()}
      title={data?.watchers.map((w) => w.name).join(', ') || 'No watchers'}
    >
      {busy ? <Spinner className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      {watching ? 'Watching' : 'Watch'}
      {count > 0 && <span className="text-muted-foreground">· {count}</span>}
    </Button>
  );
}

// ── Labels ────────────────────────────────────────────────────────────────
// `readOnly` hides the add/remove/create controls (read-only watchers still
// see applied labels; the server rejects their writes anyway).
export function IssueLabels({ issueId, platformId, readOnly = false }: { issueId: string; platformId?: string; readOnly?: boolean }) {
  const qc = useQueryClient();
  const [newName, setNewName] = useState('');
  const issueKey = ['staff', 'issue', issueId, 'labels'];
  const catalogKey = ['staff', 'platform', platformId, 'labels'];

  const { data: applied } = useQuery({
    queryKey: issueKey,
    queryFn: async () => (await staffApi.get<LabelView[]>(`/staff/issues/${issueId}/labels`)).data,
  });
  const { data: catalog } = useQuery({
    queryKey: catalogKey,
    queryFn: async () => (await staffApi.get<LabelView[]>(`/staff/platforms/${platformId}/labels`)).data,
    enabled: Boolean(platformId),
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: issueKey });
    qc.invalidateQueries({ queryKey: catalogKey });
  };
  const add = useMutation({
    mutationFn: (labelId: string) => staffApi.post(`/staff/issues/${issueId}/labels`, { labelId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: issueKey }),
    onError,
  });
  const remove = useMutation({
    mutationFn: (labelId: string) => staffApi.delete(`/staff/issues/${issueId}/labels/${labelId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: issueKey }),
    onError,
  });
  // Create in the platform catalog, then apply to this issue.
  const create = useMutation({
    mutationFn: async (name: string) => {
      const label = (await staffApi.post<LabelView>(`/staff/platforms/${platformId}/labels`, { name })).data;
      await staffApi.post(`/staff/issues/${issueId}/labels`, { labelId: label.id });
    },
    onSuccess: () => { setNewName(''); refresh(); },
    onError,
  });

  const appliedIds = new Set((applied ?? []).map((l) => l.id));
  const addable = (catalog ?? []).filter((l) => !appliedIds.has(l.id));

  const submitNew = () => {
    const name = newName.trim();
    if (!name) return;
    const existing = (catalog ?? []).find((l) => l.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      if (!appliedIds.has(existing.id)) add.mutate(existing.id);
      setNewName('');
    } else {
      create.mutate(name);
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Tag className="h-4 w-4" /> Labels</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap gap-1.5">
          {(applied ?? []).length === 0 && <span className="text-sm text-muted-foreground">No labels.</span>}
          {(applied ?? []).map((l) => (
            <Badge key={l.id} variant="outline" className={readOnly ? 'gap-1' : 'gap-1 pr-1'} style={{ borderColor: `${l.color}66`, color: l.color }}>
              <span className="h-2 w-2 rounded-full" style={{ background: l.color }} />
              {l.name}
              {!readOnly && (
                <button type="button" className="ml-0.5 text-muted-foreground hover:text-destructive" title="Remove" onClick={() => remove.mutate(l.id)}>
                  <X className="h-3 w-3" />
                </button>
              )}
            </Badge>
          ))}
        </div>

        {!readOnly && addable.length > 0 && (
          <Select value="" onValueChange={(v) => add.mutate(v)}>
            <SelectTrigger className="h-8 text-sm"><SelectValue placeholder="Add existing label…" /></SelectTrigger>
            <SelectContent>
              {addable.map((l) => <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>)}
            </SelectContent>
          </Select>
        )}

        {!readOnly && (
          <div className="flex items-center gap-2">
            <Input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submitNew(); }}
              placeholder="New label…"
              className="h-8 text-sm"
            />
            <Button size="sm" variant="secondary" disabled={!newName.trim() || create.isPending} onClick={submitNew}>
              {create.isPending ? <Spinner className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Links ─────────────────────────────────────────────────────────────────
const LINK_LABEL: Record<IssueLinkType, { outward: string; inward: string }> = {
  BLOCKS: { outward: 'blocks', inward: 'is blocked by' },
  RELATES: { outward: 'relates to', inward: 'relates to' },
  DUPLICATES: { outward: 'duplicates', inward: 'is duplicated by' },
};

export function IssueLinks({ issueId, readOnly = false }: { issueId: string; readOnly?: boolean }) {
  const qc = useQueryClient();
  const key = ['staff', 'issue', issueId, 'links'];
  const [type, setType] = useState<IssueLinkType>('RELATES');
  const [ref, setRef] = useState('');

  const { data: links } = useQuery({
    queryKey: key,
    queryFn: async () => (await staffApi.get<IssueLinkView[]>(`/staff/issues/${issueId}/links`)).data,
  });
  const refresh = () => qc.invalidateQueries({ queryKey: key });
  const remove = useMutation({
    mutationFn: (linkId: string) => staffApi.delete(`/staff/issues/${issueId}/links/${linkId}`),
    onSuccess: refresh, onError,
  });
  // Resolve the typed reference number to an issue id (scoped search), then link.
  const create = useMutation({
    mutationFn: async () => {
      const q = ref.trim();
      const res = (await staffApi.get<Paginated<StaffIssueSummary>>(`/staff/issues?q=${encodeURIComponent(q)}&pageSize=5`)).data;
      const match = res.data.find((i) => i.referenceNo.toLowerCase() === q.toLowerCase());
      if (!match) throw { response: { data: { message: `No issue "${q}" you can access.` } } };
      await staffApi.post(`/staff/issues/${issueId}/links`, { targetIssueId: match.id, type });
    },
    onSuccess: () => { setRef(''); refresh(); },
    onError,
  });

  return (
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2 text-base"><Link2 className="h-4 w-4" /> Linked issues</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-1.5">
          {(links ?? []).length === 0 && <span className="text-sm text-muted-foreground">No links.</span>}
          {(links ?? []).map((l) => (
            <div key={l.id} className="flex items-center gap-2 text-sm">
              <span className="w-24 shrink-0 text-xs text-muted-foreground">{LINK_LABEL[l.type][l.direction]}</span>
              <a href={`/staff/issues/${l.issue.id}`} className="font-mono text-primary hover:underline">{l.issue.referenceNo}</a>
              <Badge variant="outline" className="text-[10px]">{l.issue.status}</Badge>
              {!readOnly && (
                <button type="button" className="ml-auto text-muted-foreground hover:text-destructive" title="Remove" onClick={() => remove.mutate(l.id)}>
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>

        {!readOnly && (
        <div className="flex items-center gap-2">
          <Select value={type} onValueChange={(v) => setType(v as IssueLinkType)}>
            <SelectTrigger className="h-8 w-28 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="BLOCKS">blocks</SelectItem>
              <SelectItem value="RELATES">relates to</SelectItem>
              <SelectItem value="DUPLICATES">duplicates</SelectItem>
            </SelectContent>
          </Select>
          <Input
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') create.mutate(); }}
            placeholder="SUP-XXXXXXXX"
            className="h-8 font-mono text-sm"
          />
          <Button size="sm" variant="secondary" disabled={!ref.trim() || create.isPending} onClick={() => create.mutate()}>
            {create.isPending ? <Spinner className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          </Button>
        </div>
        )}
      </CardContent>
    </Card>
  );
}
