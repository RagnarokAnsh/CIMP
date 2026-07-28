import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, keepPreviousData } from '@tanstack/react-query';
import { ScrollText } from 'lucide-react';
import { staffApi } from '@/api/client';
import type { AuditEntry, Paginated } from '@/api/types';
import { Card, CardContent } from '@/components/ui/card';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { dateTime } from '@/lib/format';
import { Pager } from '@/components/Pager';
import { actionLabel } from '@/lib/issue-meta';
import { useDocumentTitle } from '@/lib/use-document-title';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle,
} from '@/components/ui/empty';
import { Badge } from '@/components/ui/badge';

const ALL = '__all__';
const ACTOR_TYPES = ['STAFF', 'REPORTER', 'SYSTEM'];

export function AuditPage() {
  useDocumentTitle('Audit log');
  const [actorType, setActorType] = useState('');
  const [action, setAction] = useState('');
  const [debouncedAction, setDebouncedAction] = useState('');
  const [page, setPage] = useState(1);

  // Debounced like every other free-text filter in the app (CommandPalette,
  // merge search). Typing "STATUS_CHANGED" here used to fire fourteen requests
  // against the audit log — the heaviest table in the product — one per key.
  useEffect(() => {
    const t = setTimeout(() => setDebouncedAction(action.trim()), 200);
    return () => clearTimeout(t);
  }, [action]);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['staff', 'audit', actorType, debouncedAction, page],
    placeholderData: keepPreviousData,
    queryFn: async () =>
      (await staffApi.get<Paginated<AuditEntry>>('/admin/audit', {
        params: {
          actorType: actorType || undefined,
          action: debouncedAction || undefined,
          page,
        },
      })).data,
  });

  const rows = data?.data ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
        <p className="text-sm text-muted-foreground">
          {data ? `${data.total} recorded event${data.total === 1 ? '' : 's'}` : 'Loading…'}
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-3 py-4">
          <Select
            value={actorType || ALL}
            onValueChange={(v) => { setActorType(v === ALL ? '' : v); setPage(1); }}
          >
            <SelectTrigger className="w-44" aria-label="Filter by actor type"><SelectValue placeholder="Actor type" /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>All actors</SelectItem>
              {ACTOR_TYPES.map((a) => <SelectItem key={a} value={a}>{a}</SelectItem>)}
            </SelectContent>
          </Select>
          <Input
            value={action}
            onChange={(e) => { setAction(e.target.value); setPage(1); }}
            placeholder="Action (e.g. STATUS_CHANGED)"
            aria-label="Filter by action"
            className="w-64"
          />
        </CardContent>
      </Card>

      {isError && (
        <Alert variant="destructive"><AlertDescription>Could not load the audit log.</AlertDescription></Alert>
      )}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Actor</TableHead>
                <TableHead>Action</TableHead>
                <TableHead>Change</TableHead>
                <TableHead>Issue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading &&
                Array.from({ length: 8 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 5 }).map((_, j) => (
                      <TableCell key={j}><Skeleton className="h-5 w-24" /></TableCell>
                    ))}
                  </TableRow>
                ))}

              {!isLoading && rows.length === 0 && (
                <TableRow className="hover:bg-transparent">
                  <TableCell colSpan={5}>
                    <Empty className="py-12">
                      <EmptyHeader>
                        <EmptyMedia variant="icon"><ScrollText /></EmptyMedia>
                        <EmptyTitle>No audit events</EmptyTitle>
                        <EmptyDescription>Nothing matches these filters.</EmptyDescription>
                      </EmptyHeader>
                    </Empty>
                  </TableCell>
                </TableRow>
              )}

              {!isLoading && rows.map((e) => (
                <TableRow key={e.id}>
                  <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                    {dateTime(e.createdAt)}
                  </TableCell>
                  <TableCell><Badge variant="outline">{e.actorType}</Badge></TableCell>
                  <TableCell className="font-medium">{actionLabel(e.action)}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {e.field ? `${e.field}: ${e.oldValue ?? '∅'} → ${e.newValue ?? '∅'}` : '—'}
                  </TableCell>
                  <TableCell>
                    {e.issue ? (
                      <Link to={`/staff/issues/${e.issue.id}`} className="font-mono text-sm hover:underline">
                        {e.issue.referenceNo}
                      </Link>
                    ) : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
        {totalPages > 1 && (
          <div className="border-t border-border px-4 py-3">
            <Pager
              page={page}
              totalPages={totalPages}
              total={data?.total ?? 0}
              pageSize={data?.pageSize ?? 0}
              onPage={setPage}
            />
          </div>
        )}
      </Card>
    </div>
  );
}
