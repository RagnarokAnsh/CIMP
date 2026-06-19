import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useTheme } from 'next-themes';
import {
  LayoutDashboard, ListChecks, Monitor, Moon, Settings, Sun, Trello,
} from 'lucide-react';
import { staffApi } from '@/api/client';
import type { Paginated, StaffIssueSummary } from '@/api/types';
import { COMMAND_EVENT } from '@/lib/motion';
import { STATUS_META } from '@/lib/issue-meta';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem,
  CommandList, CommandSeparator, CommandShortcut,
} from '@/components/ui/command';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

// One ⌘K surface for the staff workspace: jump to a section, switch theme, or
// search issues by reference/keyword and open one. Mounted once in StaffLayout;
// opens on the top-bar trigger (COMMAND_EVENT) or the ⌘K / Ctrl+K shortcut.
export function CommandPalette({ isAdmin }: { isAdmin: boolean }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const navigate = useNavigate();
  const { setTheme } = useTheme();

  useEffect(() => {
    const onEvent = () => setOpen(true);
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener(COMMAND_EVENT, onEvent);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener(COMMAND_EVENT, onEvent);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  // Debounce the keystrokes that hit the API.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);

  const { data: results, isFetching } = useQuery({
    queryKey: ['staff', 'command-search', debounced],
    enabled: open && debounced.length >= 2,
    queryFn: async () =>
      (await staffApi.get<Paginated<StaffIssueSummary>>('/staff/issues', {
        params: { q: debounced, pageSize: 6 },
      })).data,
  });

  function run(action: () => void) {
    setOpen(false);
    setQuery('');
    action();
  }

  const issues = results?.data ?? [];

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setQuery(''); }}>
      <DialogContent className="overflow-hidden p-0" showCloseButton={false}>
        <DialogHeader className="sr-only">
          <DialogTitle>Command palette</DialogTitle>
          <DialogDescription>Jump to a section, search issues, or switch theme.</DialogDescription>
        </DialogHeader>
        {/* cmdk substring-matches on item `value`; issue search is server-side,
            so disable the client filter or it would hide live keyword results. */}
        <Command
          shouldFilter={false}
          className="[&_[cmdk-input-wrapper]]:h-12 [&_[cmdk-input]]:h-12 [&_[cmdk-item]]:px-3 [&_[cmdk-item]]:py-2.5"
        >
          <CommandInput
            placeholder="Search issues or type a command…"
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
        <CommandEmpty>
          {debounced.length >= 2
            ? (isFetching ? 'Searching…' : 'No issues match.')
            : 'Type at least 2 characters to search issues.'}
        </CommandEmpty>

        {issues.length > 0 && (
          <CommandGroup heading="Issues">
            {issues.map((issue) => (
              <CommandItem
                key={issue.id}
                value={`issue-${issue.id}-${issue.referenceNo}`}
                onSelect={() => run(() => navigate(`/staff/issues/${issue.id}`))}
              >
                <span className={`size-2 rounded-full ${STATUS_META[issue.status].dot}`} aria-hidden />
                <span className="font-mono text-xs">{issue.referenceNo}</span>
                <span className="ml-auto truncate text-xs text-muted-foreground">
                  {STATUS_META[issue.status].label} · {issue.platform?.key ?? '—'}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}

        <CommandGroup heading="Go to">
          <CommandItem value="nav issues" onSelect={() => run(() => navigate('/staff/issues'))}>
            <ListChecks /> Issues
          </CommandItem>
          <CommandItem value="nav board" onSelect={() => run(() => navigate('/staff/board'))}>
            <Trello /> Board
          </CommandItem>
          <CommandItem value="nav dashboard" onSelect={() => run(() => navigate('/staff/dashboard'))}>
            <LayoutDashboard /> Dashboard
          </CommandItem>
          {isAdmin && (
            <CommandItem value="nav admin" onSelect={() => run(() => navigate('/staff/admin'))}>
              <Settings /> Admin
            </CommandItem>
          )}
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Theme">
          <CommandItem value="theme light" onSelect={() => run(() => setTheme('light'))}>
            <Sun /> Light
          </CommandItem>
          <CommandItem value="theme dark" onSelect={() => run(() => setTheme('dark'))}>
            <Moon /> Dark
          </CommandItem>
          <CommandItem value="theme system" onSelect={() => run(() => setTheme('system'))}>
            <Monitor /> System <CommandShortcut>auto</CommandShortcut>
          </CommandItem>
        </CommandGroup>
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
