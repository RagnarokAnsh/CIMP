import { ArrowDown, ArrowUp, ChevronsUp, Equal, type LucideIcon } from 'lucide-react';
import type { IssueStatus, Priority } from '@/api/types';

// Maps domain enums to vivid, WCAG-AA badge styles (verified in both light and
// dark) plus a scan-friendly dot/icon, so status and priority never rely on
// color alone. Soft fill + saturated text is reliable across themes.

export const STATUS_META: Record<
  IssueStatus,
  { label: string; className: string; dot: string }
> = {
  NEW: {
    label: 'New',
    dot: 'bg-blue-500',
    className: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/20',
  },
  IN_PROGRESS: {
    label: 'In progress',
    dot: 'bg-amber-500',
    className: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/20',
  },
  ON_HOLD: {
    label: 'On hold',
    dot: 'bg-slate-400',
    className: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-400/15 dark:text-slate-300 dark:border-slate-400/20',
  },
  RESOLVED: {
    label: 'Resolved',
    dot: 'bg-emerald-500',
    className: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/20',
  },
  CLOSED: {
    label: 'Closed',
    dot: 'bg-zinc-400',
    className: 'bg-zinc-100 text-zinc-500 border-zinc-200 dark:bg-zinc-400/12 dark:text-zinc-400 dark:border-zinc-400/15',
  },
  REOPENED: {
    label: 'Reopened',
    dot: 'bg-violet-500',
    className: 'bg-violet-100 text-violet-700 border-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/20',
  },
};

export const PRIORITY_META: Record<
  Priority,
  { label: string; className: string; icon: LucideIcon }
> = {
  LOW: {
    label: 'Low',
    icon: ArrowDown,
    className: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-400/15 dark:text-slate-300 dark:border-slate-400/20',
  },
  MEDIUM: {
    label: 'Medium',
    icon: Equal,
    className: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/20',
  },
  HIGH: {
    label: 'High',
    icon: ArrowUp,
    className: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/20',
  },
  CRITICAL: {
    label: 'Critical',
    icon: ChevronsUp,
    className: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/20',
  },
};
