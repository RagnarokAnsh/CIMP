import { toCsv } from './issues.csv';
import { Issue } from '../entities';
import { IssueStatus, Priority } from '../common/enums';

// Guards the CSV export against spreadsheet formula injection and basic quoting.
describe('toCsv', () => {
  const base = {
    status: IssueStatus.NEW,
    priority: Priority.MEDIUM,
    createdAt: new Date('2026-01-01T00:00:00Z'),
    updatedAt: new Date('2026-01-01T00:00:00Z'),
    resolvedAt: null,
    closedAt: null,
  };

  it('neutralises a formula-injection reporter name', () => {
    const issue = {
      ...base,
      referenceNo: 'SUP-1',
      platform: { key: 'DEMO' },
      reporter: { name: '=cmd|/c calc' },
      assignee: null,
    } as unknown as Issue;

    const csv = toCsv([issue]);
    // The dangerous cell is prefixed with a single quote so it renders as text.
    expect(csv).toContain('"\'=cmd|/c calc"');
    expect(csv).not.toContain('"=cmd');
  });

  it('escapes embedded quotes', () => {
    const issue = {
      ...base,
      referenceNo: 'SUP-2',
      platform: { key: 'DEMO' },
      reporter: { name: 'a "quoted" name' },
      assignee: null,
    } as unknown as Issue;

    expect(toCsv([issue])).toContain('"a ""quoted"" name"');
  });
});
