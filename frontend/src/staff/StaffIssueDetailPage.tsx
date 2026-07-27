import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { staffApi } from '@/api/client';
import type { StaffIssueDetail } from '@/api/types';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useDocumentTitle } from '@/lib/use-document-title';
import { IssueDetailPanel } from './IssueDetailPanel';

// Standalone issue route (deep links, the board, notifications). The shared
// detail UI lives in IssueDetailPanel, which the Issues split view also renders.
export function StaffIssueDetailPage() {
  const { id } = useParams<{ id: string }>();

  // Same query key as IssueDetailPanel, so TanStack serves this from cache and
  // no second request is made — it exists only to name the tab. The split view
  // deliberately keeps its "Issues" title, which is why this lives here rather
  // than inside the shared panel.
  const { data } = useQuery({
    queryKey: ['staff', 'issue', id],
    queryFn: async () => (await staffApi.get<StaffIssueDetail>(`/staff/issues/${id}`)).data,
    enabled: Boolean(id),
  });
  useDocumentTitle(data?.referenceNo);

  if (!id) {
    return <Alert variant="destructive"><AlertDescription>Issue not found.</AlertDescription></Alert>;
  }
  return (
    <IssueDetailPanel
      issueId={id}
      toolbar={
        <Button asChild variant="ghost" size="sm" className="-ml-2 text-muted-foreground">
          <Link to="/staff/issues"><ArrowLeft className="h-4 w-4" /> Back to issues</Link>
        </Button>
      }
    />
  );
}
