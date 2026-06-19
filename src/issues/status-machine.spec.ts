import { IssueStatus } from '../common/enums';
import { canTransition, STATUS_TRANSITIONS } from './status-machine';

describe('status state machine', () => {
  it('allows every transition listed in the spec', () => {
    const allowed: [IssueStatus, IssueStatus][] = [
      [IssueStatus.NEW, IssueStatus.IN_PROGRESS],
      [IssueStatus.NEW, IssueStatus.ON_HOLD],
      [IssueStatus.NEW, IssueStatus.CLOSED],
      [IssueStatus.IN_PROGRESS, IssueStatus.ON_HOLD],
      [IssueStatus.IN_PROGRESS, IssueStatus.RESOLVED],
      [IssueStatus.ON_HOLD, IssueStatus.IN_PROGRESS],
      [IssueStatus.ON_HOLD, IssueStatus.CLOSED],
      [IssueStatus.RESOLVED, IssueStatus.CLOSED],
      [IssueStatus.RESOLVED, IssueStatus.REOPENED],
      [IssueStatus.CLOSED, IssueStatus.REOPENED],
      [IssueStatus.REOPENED, IssueStatus.IN_PROGRESS],
    ];
    for (const [from, to] of allowed) {
      expect(canTransition(from, to)).toBe(true);
    }
  });

  it('rejects transitions not in the map', () => {
    expect(canTransition(IssueStatus.NEW, IssueStatus.RESOLVED)).toBe(false);
    expect(canTransition(IssueStatus.NEW, IssueStatus.REOPENED)).toBe(false);
    expect(canTransition(IssueStatus.CLOSED, IssueStatus.IN_PROGRESS)).toBe(false);
    expect(canTransition(IssueStatus.RESOLVED, IssueStatus.IN_PROGRESS)).toBe(false);
    expect(canTransition(IssueStatus.IN_PROGRESS, IssueStatus.NEW)).toBe(false);
  });

  it('never allows a self-transition', () => {
    for (const status of Object.values(IssueStatus)) {
      expect(canTransition(status, status)).toBe(false);
    }
  });

  it('has an entry for every status', () => {
    for (const status of Object.values(IssueStatus)) {
      expect(STATUS_TRANSITIONS[status]).toBeDefined();
    }
  });
});
