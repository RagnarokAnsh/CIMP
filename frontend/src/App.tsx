import { NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { LifeBuoy, ListChecks, PlusCircle } from 'lucide-react';
import { NewIssuePage } from './reporter/NewIssuePage';
import { MyIssuesPage } from './reporter/MyIssuesPage';
import { ReporterIssueDetailPage } from './reporter/ReporterIssueDetailPage';
import { StaffApp } from './staff/StaffApp';
import { ThemeToggle } from '@/components/ThemeToggle';
import { GlobalLoadingBar } from '@/components/GlobalLoadingBar';
import { cn } from '@/lib/utils';

export function App() {
  return (
    <>
      <GlobalLoadingBar />
      <Routes>
      {/* Reporter surface (embedded in portals; auth via hand-off token). */}
      <Route path="/" element={<Navigate to="/reporter/issues" replace />} />
      <Route path="/reporter/new" element={<ReporterShell><NewIssuePage /></ReporterShell>} />
      <Route path="/reporter/issues" element={<ReporterShell><MyIssuesPage /></ReporterShell>} />
      <Route
        path="/reporter/issues/:id"
        element={<ReporterShell><ReporterIssueDetailPage /></ReporterShell>}
      />

      {/* Staff workspace. */}
      <Route path="/staff/*" element={<StaffApp />} />

      <Route path="*" element={<div className="p-8 text-muted-foreground">Not found.</div>} />
      </Routes>
    </>
  );
}

function ReporterShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-background">
      <header className="glass sticky top-0 z-10 border-b border-border">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <div className="flex items-center gap-2.5 font-semibold tracking-tight">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-brand text-white shadow-sm">
              <LifeBuoy className="h-[18px] w-[18px]" />
            </div>
            <span>Support</span>
          </div>
          <nav className="flex items-center gap-1 text-sm">
            <ReporterNavLink to="/reporter/issues" icon={<ListChecks className="h-4 w-4" />}>
              My issues
            </ReporterNavLink>
            <ReporterNavLink to="/reporter/new" icon={<PlusCircle className="h-4 w-4" />}>
              Raise an issue
            </ReporterNavLink>
            <ThemeToggle />
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8">{children}</main>
    </div>
  );
}

function ReporterNavLink({
  to, icon, children,
}: {
  to: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-1.5 rounded-md px-3 py-1.5 transition-colors',
          isActive
            ? 'bg-secondary text-secondary-foreground'
            : 'text-muted-foreground hover:text-foreground',
        )
      }
    >
      {icon}
      {children}
    </NavLink>
  );
}
