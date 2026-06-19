import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Inbox, PlusCircle } from 'lucide-react';
import { reporterApi } from '@/api/client';
import { getHandoffToken } from '@/api/handoff';
import type { ReporterIssueSummary } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle,
} from '@/components/ui/empty';
import { StatusBadge, PriorityBadge } from '@/components/StatusBadge';
import { relativeTime } from '@/lib/format';

export function MyIssuesPage() {
  const hasToken = Boolean(getHandoffToken());
  const { data, isLoading, isError } = useQuery({
    queryKey: ['reporter', 'issues'],
    queryFn: async () => (await reporterApi.get<ReporterIssueSummary[]>('/issues')).data,
    enabled: hasToken,
  });

  if (!hasToken) {
    return (
      <Alert variant="destructive">
        <AlertTitle>No portal session</AlertTitle>
        <AlertDescription>Open this page from your portal to see your issues.</AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>My issues</CardTitle>
        <Button asChild size="sm">
          <Link to="/reporter/new">
            <PlusCircle className="h-4 w-4" />
            Raise an issue
          </Link>
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="space-y-2">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        )}

        {isError && (
          <Alert variant="destructive">
            <AlertDescription>Could not load your issues. Please try again.</AlertDescription>
          </Alert>
        )}

        {data && data.length === 0 && (
          <Empty className="py-10">
            <EmptyHeader>
              <EmptyMedia variant="icon"><Inbox /></EmptyMedia>
              <EmptyTitle>No issues yet</EmptyTitle>
              <EmptyDescription>
                When you raise an issue it appears here so you can follow its progress and replies.
              </EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button asChild>
                <Link to="/reporter/new"><PlusCircle className="h-4 w-4" /> Raise your first issue</Link>
              </Button>
            </EmptyContent>
          </Empty>
        )}

        {data && data.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Reference</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead className="text-right">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((i) => (
                <TableRow key={i.id}>
                  <TableCell>
                    <Link
                      to={`/reporter/issues/${i.id}`}
                      className="flex items-center gap-2 font-mono text-sm font-medium hover:underline"
                    >
                      {i.referenceNo}
                      {i.hasUpdates && (
                        <Badge className="h-5 px-1.5 text-[10px]">New update</Badge>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell><StatusBadge status={i.status} /></TableCell>
                  <TableCell><PriorityBadge priority={i.priority} /></TableCell>
                  <TableCell className="text-right text-sm text-muted-foreground">
                    {relativeTime(i.updatedAt)}
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
