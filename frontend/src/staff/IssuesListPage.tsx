import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import {
  Bookmark, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, ChevronsUpDown,
  Columns2, Download, List, Maximize2, Search, SearchX, Trash2, UserCheck, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { staffApi } from '@/api/client';
import type {
  BulkResult, IssueStatus, Paginated, PlatformItem, Priority, SavedViewDto,
  StaffIssueSummary, StaffMe,
} from '@/api/types';
import { StatusBadge, PriorityBadge } from '@/components/StatusBadge';
import { STATUS_META, PRIORITY_META } from '@/lib/issue-meta';
import { SlaBadge } from '@/components/SlaBadge';
import { IssueDetailPanel } from './IssueDetailPanel';
import { relativeTime, initials } from '@/lib/format';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

const STATUSES: IssueStatus[] = ['NEW', 'IN_PROGRESS', 'ON_HOLD', 'RESOLVED', 'CLOSED', 'REOPENED'];
const PRIORITIES: Priority[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
const ALL = '__all__';

type ViewMode = 'list' | 'split';
type SortField = 'createdAt' | 'updatedAt' | 'priority' | 'status';
type Order = 'ASC' | 'DESC';
const VIEW_KEY = 'cimp_issue_view';

interface Filters {
  status: string;
  priority: string;
  q: string;
  assignedToMe: boolean;
  platformId: string;
  from: string;
  to: string;
  sort: SortField;
  order: Order;
}
const DEFAULT_FILTERS: Filters = {
  status: '', priority: '', q: '', assignedToMe: false,
  platformId: '', from: '', to: '', sort: 'createdAt', order: 'DESC',
};

export function IssuesListPage() {
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [qInput, setQInput] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saveOpen, setSaveOpen] = useState(false);
  const [viewName, setViewName] = useState('');
  const [view, setView] = useState<ViewMode>(
    () => (localStorage.getItem(VIEW_KEY) as ViewMode) || 'list',
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => { localStorage.setItem(VIEW_KEY, view); }, [view]);

  // Saved views are persisted server-side so they follow the user across devices.
  const { data: views = [] } = useQuery({
    queryKey: ['staff', 'saved-views'],
    queryFn: async () => (await staffApi.get<SavedViewDto[]>('/staff/saved-views')).data,
    staleTime: 5 * 60 * 1000,
  });
  const saveViewMutation = useMutation({
    mutationFn: (body: { name: string; filters: Filters }) =>
      staffApi.put('/staff/saved-views', body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff', 'saved-views'] }),
  });
  const deleteViewMutation = useMutation({
    mutationFn: (id: string) => staffApi.delete(`/staff/saved-views/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['staff', 'saved-views'] }),
  });

  const patch = (p: Partial<Filters>) => { setFilters((f) => ({ ...f, ...p })); setPage(1); };

  const { data: me } = useQuery({
    queryKey: ['staff', 'me'],
    queryFn: async () => (await staffApi.get<StaffMe>('/staff/me')).data,
    staleTime: 5 * 60 * 1000,
  });
  const { data: platforms } = useQuery({
    queryKey: ['staff', 'platforms'],
    queryFn: async () => (await staffApi.get<PlatformItem[]>('/staff/platforms')).data,
    staleTime: 5 * 60 * 1000,
  });

  const { data, isLoading, isError } = useQuery({
    queryKey: ['staff', 'issues', filters, page, me?.id],
    placeholderData: keepPreviousData,
    queryFn: async () =>
      (await staffApi.get<Paginated<StaffIssueSummary>>('/staff/issues', {
        params: {
          status: filters.status || undefined,
          priority: filters.priority || undefined,
          q: filters.q || undefined,
          assigneeId: filters.assignedToMe ? me?.id : undefined,
          platformId: filters.platformId || undefined,
          from: filters.from ? new Date(filters.from).toISOString() : undefined,
          to: filters.to ? new Date(`${filters.to}T23:59:59`).toISOString() : undefined,
          sort: filters.sort,
          order: filters.order,
          page,
        },
      })).data,
  });

  const rows = data?.data ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));

  // Selection (bulk) only makes sense for the rows currently shown.
  useEffect(() => { setSelected(new Set()); }, [filters, page]);

  // In split view, keep a valid selected issue as the rows change.
  useEffect(() => {
    if (view !== 'split') return;
    if (rows.length === 0) { setSelectedId(null); return; }
    if (!selectedId || !rows.some((r) => r.id === selectedId)) setSelectedId(rows[0].id);
  }, [view, rows, selectedId]);

  const exportUrl = `/api/staff/issues/export?${new URLSearchParams({
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.priority ? { priority: filters.priority } : {}),
  }).toString()}`;

  const bulk = useMutation({
    mutationFn: (body: { ids: string[]; op: 'status' | 'priority' | 'assignee'; value: string }) =>
      staffApi.patch<BulkResult>('/staff/issues/bulk', body),
    onSuccess: (res) => {
      const r = res.data;
      const skipped = r.skipped.length ? `, ${r.skipped.length} skipped` : '';
      const summary = `Updated ${r.updated} issue${r.updated === 1 ? '' : 's'}${skipped}.`;
      if (r.skipped.length) {
        // Surface *why* issues were skipped (out of scope, invalid transition,
        // version conflict…) rather than a bare count.
        const reasons = [...new Set(r.skipped.map((s) => s.reason))];
        toast.warning(summary, {
          description: reasons.join(' · '),
        });
      } else {
        toast.success(summary);
      }
      setSelected(new Set());
      queryClient.invalidateQueries({ queryKey: ['staff', 'issues'] });
      queryClient.invalidateQueries({ queryKey: ['staff', 'board'] });
    },
    onError: (e: any) => toast.error(e?.response?.data?.message ?? 'Bulk update failed.'),
  });

  const ids = [...selected];
  const runBulk = (op: 'status' | 'priority' | 'assignee', value: string) =>
    bulk.mutate({ ids, op, value });

  function toggleRow(id: string) {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toggleAll() {
    setSelected(allOnPageSelected ? new Set() : new Set(rows.map((r) => r.id)));
  }

  function applyView(v: SavedViewDto) {
    const f = v.filters as unknown as Filters;
    setFilters(f); setQInput(f.q ?? ''); setPage(1);
  }
  function saveView() {
    const name = viewName.trim();
    if (!name) return;
    saveViewMutation.mutate(
      { name, filters },
      {
        onSuccess: () => {
          setViewName(''); setSaveOpen(false);
          toast.success(`Saved view “${name}”.`);
        },
        onError: () => toast.error('Could not save the view.'),
      },
    );
  }

  const activeFilterCount =
    (filters.status ? 1 : 0) + (filters.priority ? 1 : 0) + (filters.q ? 1 : 0) +
    (filters.assignedToMe ? 1 : 0) + (filters.platformId ? 1 : 0) + (filters.from || filters.to ? 1 : 0);

  const selectedIdx = rows.findIndex((r) => r.id === selectedId);

  const emptyState = (
    <Empty className="py-12">
      <EmptyHeader>
        <EmptyMedia variant="icon"><SearchX /></EmptyMedia>
        <EmptyTitle>No matching issues</EmptyTitle>
        <EmptyDescription>
          {activeFilterCount > 0
            ? 'Nothing matches these filters. Try clearing the search or widening status, priority, and dates.'
            : 'No issues are in your scope yet. New reports from your platforms will land here.'}
        </EmptyDescription>
      </EmptyHeader>
    </Empty>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Issues</h1>
          <p className="text-sm text-muted-foreground">
            {data ? `${data.total} issue${data.total === 1 ? '' : 's'} in your scope` : 'Loading…'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SavedViewsMenu
            views={views}
            onApply={applyView}
            onDelete={(id) => deleteViewMutation.mutate(id)}
            onSaveClick={() => setSaveOpen(true)}
            canSave={activeFilterCount > 0}
          />
          <ToggleGroup
            type="single"
            value={view}
            onValueChange={(v) => v && setView(v as ViewMode)}
            variant="outline"
            size="sm"
            aria-label="View mode"
          >
            <ToggleGroupItem value="list" aria-label="List view"><List className="h-4 w-4" /></ToggleGroupItem>
            <ToggleGroupItem value="split" aria-label="Detail view"><Columns2 className="h-4 w-4" /></ToggleGroupItem>
          </ToggleGroup>
          <Button asChild variant="outline">
            <a href={exportUrl}><Download className="h-4 w-4" /> Export CSV</a>
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 py-4">
          <form
            className="relative min-w-56 flex-1"
            onSubmit={(e) => { e.preventDefault(); patch({ q: qInput }); }}
          >
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={qInput}
              onChange={(e) => setQInput(e.target.value)}
              placeholder="Search reference, description and comments…"
              className="pl-9"
            />
          </form>

          <Select value={filters.status || ALL} onValueChange={(v) => patch({ status: v === ALL ? '' : v })}>
            <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All statuses</SelectItem>
              {STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>)}
            </SelectContent>
          </Select>

          <Select value={filters.priority || ALL} onValueChange={(v) => patch({ priority: v === ALL ? '' : v })}>
            <SelectTrigger className="w-36"><SelectValue placeholder="Priority" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All priorities</SelectItem>
              {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{PRIORITY_META[p].label}</SelectItem>)}
            </SelectContent>
          </Select>

          {(platforms?.length ?? 0) > 1 && (
            <Select value={filters.platformId || ALL} onValueChange={(v) => patch({ platformId: v === ALL ? '' : v })}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Platform" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={ALL}>All platforms</SelectItem>
                {platforms!.map((p) => <SelectItem key={p.id} value={p.id}>{p.key}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          <div className="flex items-center gap-1.5">
            <Input
              type="date"
              value={filters.from}
              onChange={(e) => patch({ from: e.target.value })}
              className="w-[8.5rem]"
              aria-label="Created from"
            />
            <span className="text-xs text-muted-foreground">→</span>
            <Input
              type="date"
              value={filters.to}
              onChange={(e) => patch({ to: e.target.value })}
              className="w-[8.5rem]"
              aria-label="Created to"
            />
          </div>

          <Button
            variant={filters.assignedToMe ? 'default' : 'outline'}
            size="sm"
            onClick={() => patch({ assignedToMe: !filters.assignedToMe })}
          >
            <UserCheck className="h-4 w-4" /> Assigned to me
          </Button>

          {activeFilterCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground"
              onClick={() => { setFilters(DEFAULT_FILTERS); setQInput(''); setPage(1); }}
            >
              <X className="h-4 w-4" /> Clear
            </Button>
          )}
        </CardContent>
      </Card>

      {view === 'list' && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-primary/30 bg-primary/5 px-4 py-2.5">
          <span className="text-sm font-medium">{selected.size} selected</span>
          <div className="flex flex-wrap items-center gap-2">
            <Select onValueChange={(v) => runBulk('status', v)}>
              <SelectTrigger size="sm" className="w-36"><SelectValue placeholder="Set status…" /></SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select onValueChange={(v) => runBulk('priority', v)}>
              <SelectTrigger size="sm" className="w-36"><SelectValue placeholder="Set priority…" /></SelectTrigger>
              <SelectContent>
                {PRIORITIES.map((p) => <SelectItem key={p} value={p}>{PRIORITY_META[p].label}</SelectItem>)}
              </SelectContent>
            </Select>
            {me && (
              <Button size="sm" variant="outline" disabled={bulk.isPending} onClick={() => runBulk('assignee', me.id)}>
                <UserCheck className="h-4 w-4" /> Assign to me
              </Button>
            )}
          </div>
          <Button size="sm" variant="ghost" className="ml-auto text-muted-foreground" onClick={() => setSelected(new Set())}>
            Clear selection
          </Button>
        </div>
      )}

      {isError && (
        <Alert variant="destructive"><AlertDescription>Could not load issues.</AlertDescription></Alert>
      )}

      {/* LIST VIEW — full-width table */}
      {view === 'list' && (
        <Card>
          <CardContent className="p-0">
            <Table className="[&_td]:py-3">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allOnPageSelected}
                      onCheckedChange={toggleAll}
                      aria-label="Select all on page"
                      disabled={rows.length === 0}
                    />
                  </TableHead>
                  <TableHead>Summary</TableHead>
                  <SortableHead label="Status" field="status" filters={filters} onSort={patch} />
                  <SortableHead label="Priority" field="priority" filters={filters} onSort={patch} />
                  <TableHead>SLA</TableHead>
                  <TableHead>Assignee</TableHead>
                  <SortableHead label="Updated" field="updatedAt" filters={filters} onSort={patch} />
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading &&
                  Array.from({ length: 6 }).map((_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 7 }).map((_, j) => (
                        <TableCell key={j}><Skeleton className="h-5 w-24" /></TableCell>
                      ))}
                    </TableRow>
                  ))}

                {!isLoading && rows.length === 0 && (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={7}>{emptyState}</TableCell>
                  </TableRow>
                )}

                {!isLoading && rows.map((r) => (
                  <TableRow key={r.id} data-state={selected.has(r.id) ? 'selected' : undefined}>
                    <TableCell>
                      <Checkbox
                        checked={selected.has(r.id)}
                        onCheckedChange={() => toggleRow(r.id)}
                        aria-label={`Select ${r.referenceNo}`}
                      />
                    </TableCell>
                    <TableCell className="max-w-md">
                      <Link to={`/staff/issues/${r.id}`} className="group block">
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {r.referenceNo}{r.platform?.key ? ` · ${r.platform.key}` : ''}
                        </span>
                        <span className="block truncate font-medium text-foreground group-hover:text-primary group-hover:underline">
                          {r.descriptionPreview || '—'}
                        </span>
                      </Link>
                    </TableCell>
                    <TableCell><StatusBadge status={r.status} /></TableCell>
                    <TableCell><PriorityBadge priority={r.priority} /></TableCell>
                    <TableCell><SlaBadge slaState={r.slaState} dueAt={r.dueAt} /></TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2 text-sm">
                        <Avatar className="size-6"><AvatarFallback className="text-[10px]">{initials(r.assignee?.name)}</AvatarFallback></Avatar>
                        <span className="truncate text-muted-foreground">{r.assignee?.name ?? 'Unassigned'}</span>
                      </span>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-sm text-muted-foreground">{relativeTime(r.updatedAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
          {totalPages > 1 && (
            <div className="border-t border-border px-4 py-3">
              <Pager page={page} totalPages={totalPages} onPage={setPage} />
            </div>
          )}
        </Card>
      )}

      {/* SPLIT VIEW — selectable list on the left, full detail on the right */}
      {view === 'split' && (
        <div className="grid items-start gap-4 lg:grid-cols-[clamp(300px,30%,400px)_1fr]">
          <Card className="overflow-hidden">
            <CardContent className="p-0">
              <div className="max-h-[calc(100vh-17rem)] divide-y divide-border/60 overflow-y-auto">
                {isLoading &&
                  Array.from({ length: 8 }).map((_, i) => (
                    <div key={i} className="p-3"><Skeleton className="h-12 w-full" /></div>
                  ))}
                {!isLoading && rows.length === 0 && emptyState}
                {!isLoading && rows.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedId(r.id)}
                    className={cn(
                      'relative flex w-full flex-col gap-2 px-4 py-3 text-left transition-colors',
                      r.id === selectedId ? 'bg-primary/[0.06]' : 'hover:bg-accent/50',
                    )}
                  >
                    {r.id === selectedId && (
                      <span className="absolute inset-y-0 left-0 w-0.5 bg-primary" aria-hidden />
                    )}
                    <div className="flex items-start gap-2">
                      <p className={cn('line-clamp-2 flex-1 text-sm leading-snug', r.id === selectedId ? 'font-semibold' : 'font-medium')}>
                        {r.descriptionPreview || r.referenceNo}
                      </p>
                      <SlaBadge slaState={r.slaState} dueAt={r.dueAt} />
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-mono text-[11px] text-muted-foreground">{r.referenceNo}</span>
                      <StatusBadge status={r.status} />
                      <PriorityBadge priority={r.priority} />
                    </div>
                    <div className="flex items-center justify-between text-xs text-muted-foreground">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <Avatar className="size-5"><AvatarFallback className="text-[9px]">{initials(r.assignee?.name)}</AvatarFallback></Avatar>
                        <span className="truncate">{r.assignee?.name ?? 'Unassigned'}</span>
                      </span>
                      <span className="shrink-0">{relativeTime(r.updatedAt)}</span>
                    </div>
                  </button>
                ))}
              </div>
              {totalPages > 1 && (
                <div className="border-t border-border px-3 py-2.5">
                  <Pager page={page} totalPages={totalPages} onPage={setPage} compact />
                </div>
              )}
            </CardContent>
          </Card>

          <div className="min-w-0">
            {selectedId ? (
              <IssueDetailPanel
                key={selectedId}
                issueId={selectedId}
                toolbar={
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      {selectedIdx >= 0 ? `${selectedIdx + 1} of ${rows.length}` : ''}
                      {data && data.total > rows.length ? ` · page ${page}/${totalPages}` : ''}
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="outline" size="icon-sm" aria-label="Previous issue"
                        disabled={selectedIdx <= 0}
                        onClick={() => setSelectedId(rows[selectedIdx - 1].id)}
                      ><ChevronUp className="h-4 w-4" /></Button>
                      <Button
                        variant="outline" size="icon-sm" aria-label="Next issue"
                        disabled={selectedIdx < 0 || selectedIdx >= rows.length - 1}
                        onClick={() => setSelectedId(rows[selectedIdx + 1].id)}
                      ><ChevronDown className="h-4 w-4" /></Button>
                      <Button asChild variant="ghost" size="icon-sm" aria-label="Open full page">
                        <Link to={`/staff/issues/${selectedId}`}><Maximize2 className="h-4 w-4" /></Link>
                      </Button>
                    </div>
                  </div>
                }
              />
            ) : (
              !isLoading && <Card><CardContent className="py-16 text-center text-sm text-muted-foreground">Select an issue to view its details.</CardContent></Card>
            )}
          </div>
        </div>
      )}

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Save current view</DialogTitle></DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="view-name">View name</Label>
            <Input
              id="view-name"
              value={viewName}
              onChange={(e) => setViewName(e.target.value)}
              placeholder="My open criticals"
              onKeyDown={(e) => { if (e.key === 'Enter') saveView(); }}
            />
          </div>
          <DialogFooter>
            <Button onClick={saveView} disabled={!viewName.trim()}>Save view</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Numbered pager with first/last + current window and ellipses.
function pageRange(page: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const out: (number | '…')[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(total - 1, page + 1);
  if (start > 2) out.push('…');
  for (let p = start; p <= end; p += 1) out.push(p);
  if (end < total - 1) out.push('…');
  out.push(total);
  return out;
}

function Pager({
  page, totalPages, onPage, compact,
}: {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
  compact?: boolean;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-xs text-muted-foreground">Page {page} of {totalPages}</span>
      <div className="flex items-center gap-1">
        <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => onPage(page - 1)} aria-label="Previous page">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        {!compact && pageRange(page, totalPages).map((p, i) =>
          p === '…' ? (
            <span key={`e${i}`} className="px-1 text-xs text-muted-foreground">…</span>
          ) : (
            <Button
              key={p}
              variant={p === page ? 'default' : 'ghost'}
              size="icon-sm"
              className="min-w-8 tabular-nums"
              aria-current={p === page ? 'page' : undefined}
              onClick={() => onPage(p)}
            >
              {p}
            </Button>
          ),
        )}
        <Button variant="outline" size="icon-sm" disabled={page >= totalPages} onClick={() => onPage(page + 1)} aria-label="Next page">
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function SortableHead({
  label, field, filters, onSort,
}: {
  label: string;
  field: SortField;
  filters: Filters;
  onSort: (p: Partial<Filters>) => void;
}) {
  const active = filters.sort === field;
  const Icon = !active ? ChevronsUpDown : filters.order === 'ASC' ? ChevronUp : ChevronDown;
  return (
    <TableHead>
      <button
        type="button"
        className={cn('flex items-center gap-1 transition-colors hover:text-foreground', active && 'text-foreground')}
        onClick={() => onSort({ sort: field, order: active && filters.order === 'DESC' ? 'ASC' : 'DESC' })}
      >
        {label}
        <Icon className="h-3.5 w-3.5 opacity-60" />
      </button>
    </TableHead>
  );
}

function SavedViewsMenu({
  views, onApply, onDelete, onSaveClick, canSave,
}: {
  views: SavedViewDto[];
  onApply: (v: SavedViewDto) => void;
  onDelete: (id: string) => void;
  onSaveClick: () => void;
  canSave: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm"><Bookmark className="h-4 w-4" /> Views</Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-52">
        <DropdownMenuLabel>Saved views</DropdownMenuLabel>
        {views.length === 0 && (
          <p className="px-2 py-1.5 text-xs text-muted-foreground">No saved views yet.</p>
        )}
        {views.map((v) => (
          <DropdownMenuItem
            key={v.id}
            onSelect={() => onApply(v)}
            className="group flex items-center justify-between gap-2"
          >
            <span className="truncate">{v.name}</span>
            <button
              className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
              aria-label={`Delete ${v.name}`}
              onClick={(e) => { e.stopPropagation(); onDelete(v.id); }}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={onSaveClick} disabled={!canSave}>
          <Bookmark className="h-4 w-4" /> Save current view…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
