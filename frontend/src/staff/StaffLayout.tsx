import { useEffect, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  ChevronsLeft, Inbox, LayoutDashboard, LifeBuoy, ListChecks, LogOut,
  Menu, ScrollText, Search, Settings, Trello,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { initials } from '@/lib/format';
import { openCommandPalette } from '@/lib/motion';
import { useMe } from '@/lib/use-me';
import { useStaffRealtime } from '@/lib/realtime';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Kbd } from '@/components/ui/kbd';
import { CommandPalette } from './CommandPalette';
import { NotificationsBell } from './NotificationsBell';
import { SupportButton } from './SupportButton';

const COLLAPSE_KEY = 'cimp_sidebar_collapsed';

export function StaffLayout({
  children,
  onSignOut,
}: {
  children: React.ReactNode;
  onSignOut: () => void;
}) {
  const { data: me } = useMe();

  // Live updates over SSE — keeps the board, lists, detail and bell fresh.
  useStaffRealtime();

  // Reading surfaces are capped at max-w-screen-2xl so lines stay a comfortable
  // measure. The board is not a reading surface: it needs 1692px for six
  // 17rem columns, and the 1536px cap bound before the sidebar or the viewport
  // ever did — so it overflowed by exactly 220px on a 1920 *and* a 2560 screen,
  // collapsed or not. Full-bleed lets the width people actually have do its job.
  const fullBleed = useLocation().pathname.startsWith('/staff/board');

  const isAdmin = me?.roles.some((r) => r.role === 'ADMIN') ?? false;
  const [collapsed, setCollapsed] = useState(
    () => localStorage.getItem(COLLAPSE_KEY) === 'true',
  );
  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, String(collapsed));
  }, [collapsed]);

  return (
    <div className="flex min-h-screen bg-background">
      {/* Skip link. A keyboard user otherwise traverses ~12 controls — seven
          sidebar links, the collapse toggle, search, support, notifications,
          theme and the account menu — before reaching content, on every single
          navigation (WCAG 2.4.1, Level A). Visually hidden until focused. */}
      <a
        href="#main-content"
        className="focus-ring sr-only z-overlay rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:absolute focus:left-4 focus:top-3"
      >
        Skip to content
      </a>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          'sticky top-0 hidden h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200 lg:flex',
          collapsed ? 'w-[68px]' : 'w-60',
        )}
      >
        <SidebarNav isAdmin={isAdmin} collapsed={collapsed} />
        <div className="border-t border-sidebar-border p-2">
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-sidebar-foreground/70"
            onClick={() => setCollapsed((c) => !c)}
          >
            <ChevronsLeft className={cn('h-4 w-4 transition-transform', collapsed && 'rotate-180')} />
            {!collapsed && <span className="text-xs">Collapse</span>}
          </Button>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="glass sticky top-0 z-header flex h-14 items-center gap-2 border-b border-border px-4">
          {/* Mobile nav trigger */}
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Open navigation">
                <Menu className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-64 bg-sidebar p-0 text-sidebar-foreground">
              <SheetTitle className="sr-only">Navigation</SheetTitle>
              <SidebarNav isAdmin={isAdmin} collapsed={false} />
            </SheetContent>
          </Sheet>

          <button
            type="button"
            onClick={openCommandPalette}
            className="focus-ring flex h-9 w-full max-w-sm items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm text-muted-foreground shadow-xs transition-colors hover:border-ring/40 hover:text-foreground"
          >
            <Search className="h-4 w-4" />
            <span className="flex-1 text-left">Search issues…</span>
            <Kbd className="hidden sm:inline-flex">⌘K</Kbd>
          </button>

          <div className="ml-auto flex items-center gap-1">
            <SupportButton />
            <NotificationsBell />
            <ThemeToggle />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={me?.name ? `Account menu for ${me.name}` : 'Account menu'}
                  className="focus-ring flex items-center gap-2 rounded-full p-0.5 pr-2 transition-colors hover:bg-accent"
                >
                  <Avatar className="h-8 w-8">
                    <AvatarFallback className="bg-gradient-brand text-xs text-white">
                      {initials(me?.name)}
                    </AvatarFallback>
                  </Avatar>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-56">
                <DropdownMenuLabel className="flex flex-col">
                  <span className="truncate font-medium">{me?.name ?? 'Loading…'}</span>
                  <span className="truncate text-xs font-normal text-muted-foreground">{me?.email}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onSignOut} className="gap-2 text-destructive focus:text-destructive">
                  <LogOut className="h-4 w-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main id="main-content" tabIndex={-1} className="flex-1 overflow-auto">
          <div className={cn('mx-auto w-full p-4 sm:p-6 lg:p-8', !fullBleed && 'max-w-screen-2xl')}>
            {children}
          </div>
        </main>
      </div>

      <CommandPalette isAdmin={isAdmin} />
    </div>
  );
}

const NAV_ITEMS = [
  { to: '/staff/triage', icon: Inbox, label: 'Triage' },
  { to: '/staff/issues', icon: ListChecks, label: 'Issues' },
  { to: '/staff/board', icon: Trello, label: 'Board' },
  // One dashboard, filtered by a platform selector. There used to be a
  // separate "Reports" item for the single-platform view; it shared seven of
  // its eight KPI cards with this one, so the split asked people to diff two
  // near-identical screens to find a filter.
  { to: '/staff/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
];

function SidebarNav({ isAdmin, collapsed }: { isAdmin: boolean; collapsed: boolean }) {
  return (
    <>
      <div className={cn('flex h-14 items-center gap-2.5 border-b border-sidebar-border px-4', collapsed && 'justify-center px-0')}>
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-brand text-white shadow-sm">
          <LifeBuoy className="h-[18px] w-[18px]" />
        </div>
        {!collapsed && <span className="font-semibold tracking-tight">Support</span>}
      </div>

      <nav aria-label="Workspace" className="flex flex-1 flex-col gap-1 p-3">
        {NAV_ITEMS.map((item) => (
          <SidebarLink key={item.to} {...item} collapsed={collapsed} />
        ))}
        {isAdmin && <SidebarLink to="/staff/audit" icon={ScrollText} label="Audit log" collapsed={collapsed} />}
        {isAdmin && <SidebarLink to="/staff/admin" icon={Settings} label="Admin" collapsed={collapsed} />}
      </nav>
    </>
  );
}

function SidebarLink({
  to, icon: Icon, label, collapsed,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  collapsed: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={to === '/staff/issues'}
      title={collapsed ? label : undefined}
      className={({ isActive }) =>
        cn(
          'group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          collapsed && 'justify-center px-0',
          isActive
            ? 'bg-sidebar-accent text-sidebar-accent-foreground'
            : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground',
        )
      }
    >
      {({ isActive }) => (
        <>
          <span
            className={cn(
              'absolute left-0 top-1/2 h-5 -translate-y-1/2 rounded-r-full bg-sidebar-primary transition-all',
              isActive ? 'w-1 opacity-100' : 'w-0 opacity-0',
            )}
            aria-hidden
          />
          <Icon className={cn('h-[18px] w-[18px] shrink-0', isActive && 'text-sidebar-primary')} />
          {!collapsed && label}
        </>
      )}
    </NavLink>
  );
}
