import { Route, Routes } from 'react-router-dom';
import { IssuesListPage } from './IssuesListPage';
import { StaffIssueDetailPage } from './StaffIssueDetailPage';
import { BoardPage } from './BoardPage';
import { DashboardPage } from './DashboardPage';
import { AdminPage } from './AdminPage';

// Shared by the OIDC and dev-auth gates so the workspace routes stay in one place.
export function StaffWorkspaceRoutes() {
  return (
    <Routes>
      <Route index element={<IssuesListPage />} />
      <Route path="issues" element={<IssuesListPage />} />
      <Route path="issues/:id" element={<StaffIssueDetailPage />} />
      <Route path="board" element={<BoardPage />} />
      <Route path="dashboard" element={<DashboardPage />} />
      <Route path="admin" element={<AdminPage />} />
    </Routes>
  );
}
