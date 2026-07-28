import { Link, Route, Routes } from 'react-router-dom';
import { Compass, ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle,
} from '@/components/ui/empty';
import { useDocumentTitle } from '@/lib/use-document-title';
import { IssuesListPage } from './IssuesListPage';
import { StaffIssueDetailPage } from './StaffIssueDetailPage';
import { BoardPage } from './BoardPage';
import { TriagePage } from './TriagePage';
import { DashboardPage } from './DashboardPage';
import { PlatformReportPage } from './PlatformReportPage';
import { AdminPage } from './AdminPage';
import { AuditPage } from './AuditPage';

// The app-level 404 in App.tsx never fires for /staff/*, because that path is
// claimed by StaffApp — so an unknown workspace URL used to render the sidebar
// and header around an empty content area, with no title and nothing to click.
// This is the staff-shell equivalent: content only (the layout already provides
// the <main> landmark) and it points back into the workspace, not the portal.
function StaffNotFound() {
  useDocumentTitle('Page not found');
  return (
    <Empty className="max-w-md">
      <EmptyHeader>
        <EmptyMedia variant="icon"><Compass /></EmptyMedia>
        <EmptyTitle as="h1">This page doesn’t exist</EmptyTitle>
        <EmptyDescription>
          The link may be out of date, or the issue may have been merged into another one.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild>
          <Link to="/staff/issues"><ListChecks className="h-4 w-4" /> Go to issues</Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
}

// Shared by the OIDC and dev-auth gates so the workspace routes stay in one place.
export function StaffWorkspaceRoutes() {
  return (
    <Routes>
      <Route index element={<IssuesListPage />} />
      <Route path="issues" element={<IssuesListPage />} />
      <Route path="issues/:id" element={<StaffIssueDetailPage />} />
      <Route path="board" element={<BoardPage />} />
      <Route path="triage" element={<TriagePage />} />
      <Route path="dashboard" element={<DashboardPage />} />
      <Route path="reports" element={<PlatformReportPage />} />
      <Route path="admin" element={<AdminPage />} />
      <Route path="audit" element={<AuditPage />} />
      <Route path="*" element={<StaffNotFound />} />
    </Routes>
  );
}
