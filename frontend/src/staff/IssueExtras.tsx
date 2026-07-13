import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, GitMerge, Link2, Plus, Tag, X } from 'lucide-react';
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
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

import { toastApiError as onError } from '@/lib/toast-error';

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

// ── Merge (duplicate flow) ────────────────────────────────────────────────
// Search-and-confirm dialog that merges the current issue into a canonical
// same-platform issue. The server closes this issue, links the pair, copies
// watchers, and notifies this issue's reporter when the canonical resolves.
export function MergeIssueButton({
  issueId, platformId, version, onMerged,
}: {
  issueId: string;
  platformId?: string;
  version: number;
  onMerged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [selected, setSelected] = useState<StaffIssueSummary | null>(null);

  // Debounce the search so we don't hit the list endpoint per keystroke.
  const [debouncedQ, setDebouncedQ] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  const { data: results, isFetching } = useQuery({
    queryKey: ['staff', 'issue', issueId, 'merge-search', debouncedQ, platformId],
    queryFn: async () =>
      (await staffApi.get<Paginated<StaffIssueSummary>>(
        `/staff/issues?q=${encodeURIComponent(debouncedQ)}&pageSize=6${platformId ? `&platformId=${platformId}` : ''}`,
      )).data,
    enabled: open && debouncedQ.length >= 2,
  });
  const candidates = (results?.data ?? []).filter((i) => i.id !== issueId && i.status !== 'CLOSED');

  const merge = useMutation({
    mutationFn: () =>
      staffApi.post(`/staff/issues/${issueId}/merge`, {
        canonicalIssueId: selected!.id,
        version,
      }),
    onSuccess: () => {
      setOpen(false); setQ(''); setSelected(null);
      toast.success('Merged as duplicate.');
      onMerged();
    },
    onError,
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) { setQ(''); setSelected(null); } }}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="gap-1.5">
          <GitMerge className="h-3.5 w-3.5" /> Merge into…
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Merge as duplicate</DialogTitle>
          <DialogDescription>
            This issue will be closed and linked to the issue you pick. Its reporter is
            told it's being tracked centrally and gets notified when that issue resolves.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Input
            value={q}
            onChange={(e) => { setQ(e.target.value); setSelected(null); }}
            placeholder="Search by reference or words in the description…"
            autoFocus
          />
          {debouncedQ.length >= 2 && (
            <div className="max-h-56 space-y-1 overflow-y-auto">
              {isFetching && candidates.length === 0 && <Skeleton className="h-10 w-full" />}
              {!isFetching && candidates.length === 0 && (
                <p className="px-1 py-2 text-sm text-muted-foreground">No matching open issues on this platform.</p>
              )}
              {candidates.map((i) => (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => setSelected(i)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm',
                    selected?.id === i.id
                      ? 'border-primary bg-primary/5'
                      : 'border-border/60 hover:bg-accent/60',
                  )}
                >
                  <span className="shrink-0 font-mono text-xs">{i.referenceNo}</span>
                  <span className="truncate text-muted-foreground">{i.descriptionPreview}</span>
                  <Badge variant="outline" className="ml-auto shrink-0 text-[10px]">{i.status}</Badge>
                </button>
              ))}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="destructive"
            disabled={!selected || merge.isPending}
            onClick={() => merge.mutate()}
          >
            {merge.isPending && <Spinner />}
            Merge into {selected?.referenceNo ?? '…'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
