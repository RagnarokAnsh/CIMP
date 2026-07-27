// Small presentation helpers shared across the staff UI.
//
// Dates go through these three and nowhere else. Before they existed, absolute
// timestamps were written as a bare `toLocaleString()` in five places — which
// renders seconds ("7/22/2026, 12:33:18 PM"), noise nobody reads — while others
// used `toLocaleDateString()`, and NotificationsBell kept its own copy of
// relativeTime that had already drifted (no date fallback past 30 days, so an
// old notification showed "200d ago").

/** "just now" / "5m ago" / "3h ago" / "12d ago", then an absolute date. */
export function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.round(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 30) return `${day}d ago`;
  return shortDate(iso);
}

/** Date + time to the minute — audit rows, comment stamps, hover titles. */
export function dateTime(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

/** Date only — where the time of day carries no meaning. */
export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
}

export function initials(name?: string): string {
  if (!name) return '?';
  return name.split(' ').map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase();
}

// First meaningful line of a block of text, truncated — used as a derived title.
export function firstLine(text: string, max = 100): string {
  const line = (text ?? '').split('\n').map((s) => s.trim()).find(Boolean) ?? '';
  return line.length > max ? `${line.slice(0, max).trimEnd()}…` : line;
}

/** Whole-number percentage, guarding the divide-by-zero empty state. */
export const pct = (n: number, of: number) => (of > 0 ? Math.round((n / of) * 100) : 0);

/** Humanize an hour count: 4.2h under two days, 2.1d beyond. */
export function hoursFmt(hours: number | null): string {
  if (hours === null) return '—';
  return hours < 48 ? `${Math.round(hours * 10) / 10}h` : `${Math.round((hours / 24) * 10) / 10}d`;
}
