import type { IssueStatus } from '@/api/types';

// Mirrors the backend status state machine (src/issues/status-machine.ts). The
// server is the source of truth and rejects invalid transitions with 422; this
// lets the UI gate moves up front so a drag that can't succeed is refused with
// a clear message instead of a round-trip error.
export const STATUS_TRANSITIONS: Record<IssueStatus, IssueStatus[]> = {
  NEW: ['IN_PROGRESS', 'ON_HOLD', 'CLOSED'],
  IN_PROGRESS: ['ON_HOLD', 'RESOLVED'],
  ON_HOLD: ['IN_PROGRESS', 'CLOSED'],
  RESOLVED: ['CLOSED', 'REOPENED'],
  CLOSED: ['REOPENED'],
  REOPENED: ['IN_PROGRESS'],
};

export function canTransition(from: IssueStatus, to: IssueStatus): boolean {
  if (from === to) return false;
  return STATUS_TRANSITIONS[from]?.includes(to) ?? false;
}

// Left-to-right board column order: work that needs attention first, terminal
// states last.
export const BOARD_STATUS_ORDER: IssueStatus[] = [
  'NEW',
  'REOPENED',
  'IN_PROGRESS',
  'ON_HOLD',
  'RESOLVED',
  'CLOSED',
];
