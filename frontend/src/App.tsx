import { Link, NavLink, Navigate, Route, Routes } from 'react-router-dom';
import { Compass, LifeBuoy, ListChecks, PlusCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle,
} from '@/components/ui/empty';
import { useDocumentTitle } from '@/lib/use-document-title';
import { NewIssuePage } from './reporter/NewIssuePage';
import { MyIssuesPage } from './reporter/MyIssuesPage';
import { ReporterIssueDetailPage } from './reporter/ReporterIssueDetailPage';
import { StaffApp } from './staff/StaffApp';
import { PublicStatusPage } from './status/PublicStatusPage';
import { ThemeToggle } from '@/components/ThemeToggle';
import { GlobalLoadingBar } from '@/components/GlobalLoadingBar';
import { I18nProvider, useT } from '@/i18n';
import { LanguageSwitcher } from '@/i18n/LanguageSwitcher';
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

      {/* Public status page — no auth, no tokens; safe to link from anywhere. */}
      <Route path="/status/:key" element={<PublicStatusPage />} />

      {/* Staff workspace. */}
      <Route path="/staff/*" element={<StaffApp />} />

      <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}

/**
 * The 404. Previously a bare `<div>Not found.</div>` in muted grey — no
 * heading, no landmark, no way back — which is what a stale bookmark or a
 * mistyped issue id landed on, in a product where every other empty state is
 * carefully built.
 */
function NotFound() {
  useDocumentTitle('Page not found');
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
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
            <Link to="/reporter/issues"><ListChecks className="h-4 w-4" /> Go to my issues</Link>
          </Button>
        </EmptyContent>
      </Empty>
    </main>
  );
}

// The reporter portal is embedded in partner portals whose users may read any
// language, so this surface (unlike the internal staff workspace) is localized.
function ReporterShell({ children }: { children: React.ReactNode }) {
  return (
    <I18nProvider>
      <ReporterChrome>{children}</ReporterChrome>
    </I18nProvider>
  );
}

function ReporterChrome({ children }: { children: React.ReactNode }) {
  const { t } = useT();
  return (
    <div className="min-h-screen bg-background">
      <header className="glass sticky top-0 z-header border-b border-border">
        <div className="mx-auto flex h-14 max-w-3xl items-center justify-between px-4">
          <div className="flex items-center gap-2.5 font-semibold tracking-tight">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-brand text-white shadow-sm">
              <LifeBuoy className="h-[18px] w-[18px]" />
            </div>
            <span>{t('nav.support')}</span>
          </div>
          <nav aria-label="Portal" className="flex items-center gap-1 text-sm">
            <ReporterNavLink to="/reporter/issues" icon={<ListChecks className="h-4 w-4" />}>
              {t('nav.myIssues')}
            </ReporterNavLink>
            <ReporterNavLink to="/reporter/new" icon={<PlusCircle className="h-4 w-4" />}>
              {t('nav.raiseIssue')}
            </ReporterNavLink>
            <LanguageSwitcher />
            <ThemeToggle />
          </nav>
        </div>
      </header>
      <main id="main-content" className="mx-auto max-w-3xl px-4 py-8">{children}</main>
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
