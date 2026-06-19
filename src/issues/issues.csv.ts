import { Issue } from '../entities';

// Minimal RFC-4180-ish CSV: quote fields, double embedded quotes.
function cell(value: unknown): string {
  const s = value === null || value === undefined ? '' : String(value);
  return `"${s.replace(/"/g, '""')}"`;
}

const HEADERS = [
  'referenceNo', 'status', 'priority', 'platform', 'reporter', 'assignee',
  'createdAt', 'updatedAt', 'resolvedAt', 'closedAt',
];

export function toCsv(issues: Issue[]): string {
  const lines = [HEADERS.map(cell).join(',')];
  for (const i of issues) {
    lines.push(
      [
        i.referenceNo,
        i.status,
        i.priority,
        i.platform?.key ?? '',
        i.reporter?.name ?? '',
        i.assignee?.name ?? '',
        i.createdAt?.toISOString() ?? '',
        i.updatedAt?.toISOString() ?? '',
        i.resolvedAt?.toISOString() ?? '',
        i.closedAt?.toISOString() ?? '',
      ]
        .map(cell)
        .join(','),
    );
  }
  return lines.join('\r\n');
}
