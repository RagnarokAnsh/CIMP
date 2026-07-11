// Shared full-text helpers: turn free text into a prefix tsquery
// (`foo:* & bar:*`). Stripping non-alphanumerics keeps to_tsquery input safe
// from syntax errors. Used by the staff issues search and the reporter
// similar-issues (deflection) search so the two never drift.

export function buildPrefixTsQuery(q: string): string {
  return q
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.replace(/[^a-z0-9]/g, ''))
    .filter(Boolean)
    .map((t) => `${t}:*`)
    .join(' & ');
}
