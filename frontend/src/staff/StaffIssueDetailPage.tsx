import { Link, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { IssueDetailPanel } from './IssueDetailPanel';

// Standalone issue route (deep links, the board, notifications). The shared
// detail UI lives in IssueDetailPanel, which the Issues split view also renders.
export function StaffIssueDetailPage() {
  const { id } = useParams<{ id: string }>();
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
