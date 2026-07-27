import { ArrowDown, ArrowUp, ChevronsUp, Equal, type LucideIcon } from 'lucide-react';
import type { IssueStatus, Priority, Role } from '@/api/types';

// Maps domain enums to vivid, WCAG-AA badge styles (verified in both light and
// dark) plus a scan-friendly dot/icon, so status and priority never rely on
// color alone. Soft fill + saturated text is reliable across themes.

/**
 * Shared semantic badge tones.
 *
 * These exist because the same meanings were being re-invented per component —
 * `bg-emerald-500/10 text-emerald-400` here, `text-emerald-500` there — each
 * picked while working in dark mode and none re-checked in light, where they
 * measured 1.7–3.5 against a 4.5 requirement. The recipe below is the same
 * soft-fill + saturated-text shape as STATUS_META, which does pass both themes.
 *
 * Use these for any success/info/warning/danger badge. The design tokens
 * (--success, --warning, --info) stay reserved for solid-fill surfaces; badges
 * need the tinted pair.
 */
export const BADGE_TONE = {
  success: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/20',
  info: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/20',
  warning: 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/20',
  // Between warning and danger. Exists because the status page has five
  // component severities and only had four tones, so "partial outage" and
  // "degraded" rendered identically. Same recipe, measured 4.56 light / 8.9 dark.
  severe: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/20',
  danger: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/20',
} as const;

/**
 * Full-surface variants of the tones above, for banners rather than chips.
 * A banner is a large tinted panel with an icon, so it needs a softer fill and
 * a saturated icon colour — not the chip's border+text pair.
 */
export const BANNER_TONE = {
  success: 'border-emerald-200 bg-emerald-50 dark:border-emerald-500/20 dark:bg-emerald-500/10',
  info: 'border-blue-200 bg-blue-50 dark:border-blue-500/20 dark:bg-blue-500/10',
  warning: 'border-amber-200 bg-amber-50 dark:border-amber-500/20 dark:bg-amber-500/10',
  severe: 'border-orange-200 bg-orange-50 dark:border-orange-500/20 dark:bg-orange-500/10',
  danger: 'border-red-200 bg-red-50 dark:border-red-500/20 dark:bg-red-500/10',
} as const;

export const BANNER_ICON_TONE = {
  success: 'text-emerald-600 dark:text-emerald-400',
  info: 'text-blue-600 dark:text-blue-400',
  warning: 'text-amber-600 dark:text-amber-400',
  severe: 'text-orange-600 dark:text-orange-400',
  danger: 'text-red-600 dark:text-red-400',
} as const;

/** Standalone coloured text (no fill) — inline notes and confirmations. */
export const TEXT_TONE = {
  success: 'text-emerald-700 dark:text-emerald-400',
  warning: 'text-amber-700 dark:text-amber-400',
  danger: 'text-red-700 dark:text-red-400',
} as const;

/**
 * Fills for progress bars and meters — the "is this number healthy?" axis.
 *
 * These read from the design tokens rather than the raw palette. Six call sites
 * across DashboardPage and PlatformReportPage each wrote
 * `cond ? 'bg-amber-500' : 'bg-emerald-500'` inline, which meant a theme change
 * could never reach them and the two report pages could drift apart.
 */
export const METER_TONE = {
  good: 'bg-success',
  caution: 'bg-warning',
  bad: 'bg-danger',
} as const;

/** Picks a meter fill from a boolean "needs attention" test. */
export const meterTone = (needsAttention: boolean): string =>
  (needsAttention ? METER_TONE.caution : METER_TONE.good);

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
    // slate-500, not -400: the darker step buys separation from CLOSED's zinc
    // without changing what the colour means.
    dot: 'bg-slate-500',
    className: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-500/15 dark:text-slate-300 dark:border-slate-500/20',
  },
  RESOLVED: {
    label: 'Resolved',
    dot: 'bg-emerald-500',
    className: 'bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/20',
  },
  CLOSED: {
    label: 'Closed',
    dot: 'bg-zinc-400',
    // zinc-600, not zinc-500: the lighter shade measured 4.39 against a 4.5
    // requirement in light mode — the only status badge that missed.
    className: 'bg-zinc-100 text-zinc-600 border-zinc-200 dark:bg-zinc-400/12 dark:text-zinc-400 dark:border-zinc-400/15',
  },
  REOPENED: {
    label: 'Reopened',
    // Rose, not violet. Under deuteranopia violet and blue simulate to ΔE 1.1 —
    // literally the same colour — so REOPENED and NEW were indistinguishable
    // for ~8% of men. No violet or purple survives that test (blue and violet
    // share the axis dichromats lose); rose does. The six-dot set was solved
    // for worst-case pairwise ΔE across normal, deuteranope and protanope
    // vision: it was 1.1, it is now 20.4. Rose also reads as "this came back",
    // which is what REOPENED means.
    dot: 'bg-rose-500',
    className: 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/20',
  },
};

// `dot` matches STATUS_META's shape so breakdown bars can read their colour
// from here instead of keeping a parallel PRIORITY_BAR map in
// dashboard-widgets.tsx — the two were free to disagree about what "High" looks
// like, which is exactly the drift STATUS_META was created to stop.
export const PRIORITY_META: Record<
  Priority,
  { label: string; className: string; icon: LucideIcon; dot: string }
> = {
  LOW: {
    label: 'Low',
    icon: ArrowDown,
    dot: 'bg-slate-400',
    className: 'bg-slate-100 text-slate-600 border-slate-200 dark:bg-slate-400/15 dark:text-slate-300 dark:border-slate-400/20',
  },
  MEDIUM: {
    label: 'Medium',
    icon: Equal,
    dot: 'bg-blue-500',
    className: 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/20',
  },
  HIGH: {
    label: 'High',
    icon: ArrowUp,
    dot: 'bg-orange-500',
    className: 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-500/15 dark:text-orange-300 dark:border-orange-500/20',
  },
  CRITICAL: {
    label: 'Critical',
    icon: ChevronsUp,
    dot: 'bg-red-500',
    className: 'bg-red-100 text-red-700 border-red-200 dark:bg-red-500/15 dark:text-red-300 dark:border-red-500/20',
  },
};

// Human labels for staff roles — single source of truth so dropdowns, badges,
// and the dev role picker stay consistent instead of each doing `.replace('_',' ')`.
export const ROLE_META: Record<Role, { label: string }> = {
  FOCAL_POINT: { label: 'Focal point' },
  DEVELOPER: { label: 'Developer' },
  ADMIN: { label: 'Admin' },
  WATCHER: { label: 'Watcher' },
};

export const roleLabel = (role: Role): string => ROLE_META[role]?.label ?? role;

/**
 * "STATUS_CHANGED" -> "Status changed".
 *
 * The audit log and the issue history timeline each carried their own
 * `.replace(/_/g, ' ').toLowerCase()`, which rendered the label all-lowercase
 * mid-sentence and let the two surfaces describe the same event differently.
 */
export const actionLabel = (action: string): string => {
  const words = action.replace(/_/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};

/**
 * Humanises an issue-history value. History rows carry the raw column value, so
 * a status change rendered as "NEW → IN_PROGRESS" — the enum, in a UI that has
 * had a label for it all along.
 */
export function historyValue(field: string | null | undefined, value: string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '—';
  if (field === 'status') return STATUS_META[value as IssueStatus]?.label ?? value;
  if (field === 'priority') return PRIORITY_META[value as Priority]?.label ?? value;
  if (field === 'role') return ROLE_META[value as Role]?.label ?? value;
  return value;
}

/** "jiraSyncStatus" values and similar SCREAMING_CASE fields shown as plain text. */
export const enumLabel = (value: string | null | undefined): string => {
  if (!value) return '—';
  const words = value.replace(/_/g, ' ').toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};
