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
import { useT } from '@/i18n';
import { useDocumentTitle } from '@/lib/use-document-title';
import { usePriorityLabel, useStatusLabel } from '@/i18n/useStatusLabel';

export function MyIssuesPage() {
  const { t } = useT();
  useDocumentTitle(t('list.title'));
  const statusLabel = useStatusLabel();
  const priorityLabel = usePriorityLabel();
  const hasToken = Boolean(getHandoffToken());
  const { data, isLoading, isError } = useQuery({
    queryKey: ['reporter', 'issues'],
    queryFn: async () => (await reporterApi.get<ReporterIssueSummary[]>('/issues')).data,
    enabled: hasToken,
  });

  if (!hasToken) {
    return (
      <Alert variant="destructive">
        <AlertTitle>{t('new.noSession.title')}</AlertTitle>
        <AlertDescription>{t('new.noSession.body')}</AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle as="h1" className="text-xl">{t('list.title')}</CardTitle>
        <Button asChild size="sm">
          <Link to="/reporter/new">
            <PlusCircle className="h-4 w-4" />
            {t('nav.raiseIssue')}
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
            <AlertDescription>{t('list.loadError')}</AlertDescription>
          </Alert>
        )}

        {data && data.length === 0 && (
          <Empty className="py-10">
            <EmptyHeader>
              <EmptyMedia variant="icon"><Inbox /></EmptyMedia>
              <EmptyTitle>{t('list.empty.title')}</EmptyTitle>
              <EmptyDescription>{t('list.empty.body')}</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button asChild>
                <Link to="/reporter/new"><PlusCircle className="h-4 w-4" /> {t('list.empty.cta')}</Link>
              </Button>
            </EmptyContent>
          </Empty>
        )}

        {data && data.length > 0 && (
          <Table>
            <TableHeader>
              <TableRow>
                {/* These were English literals on the one fully localized
                    surface in the product — a Spanish reporter saw Spanish
                    navigation, Spanish empty states and Spanish status badges
                    under four English column headers. */}
                <TableHead>{t('list.col.reference')}</TableHead>
                <TableHead>{t('list.col.status')}</TableHead>
                <TableHead>{t('list.col.priority')}</TableHead>
                <TableHead className="text-right">{t('list.col.updated')}</TableHead>
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
                        <Badge className="h-5 px-1.5 text-2xs">{t('list.newUpdates')}</Badge>
                      )}
                    </Link>
                  </TableCell>
                  <TableCell><StatusBadge status={i.status} label={statusLabel(i.status)} /></TableCell>
                  <TableCell><PriorityBadge priority={i.priority} label={priorityLabel(i.priority)} /></TableCell>
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
