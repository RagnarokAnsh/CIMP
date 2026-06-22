import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { UpdatePriorityDto } from './update-priority.dto';
import { UpdateAssignmentDto } from './update-assignment.dto';
import { UpdateStatusDto } from './update-status.dto';
import { Priority, IssueStatus } from '../../common/enums';

// Regression guard for the optimistic-lock bypass: every mutation DTO must
// REQUIRE `version` so the service's assertVersion check always runs. Previously
// priority/assignment marked it @IsOptional(), letting concurrent edits silently
// overwrite each other.
describe('mutation DTOs require version', () => {
  const errorsFor = (cls: any, payload: object) =>
    validateSync(plainToInstance(cls, payload), { whitelist: true });

  const hasVersionError = (cls: any, payload: object) =>
    errorsFor(cls, payload).some((e) => e.property === 'version');

  it('UpdatePriorityDto rejects a missing version', () => {
    expect(hasVersionError(UpdatePriorityDto, { priority: Priority.HIGH })).toBe(true);
    expect(hasVersionError(UpdatePriorityDto, { priority: Priority.HIGH, version: 3 })).toBe(false);
  });

  it('UpdateAssignmentDto rejects a missing version', () => {
    expect(hasVersionError(UpdateAssignmentDto, { assigneeId: null })).toBe(true);
    expect(hasVersionError(UpdateAssignmentDto, { assigneeId: null, version: 1 })).toBe(false);
  });

  it('UpdateStatusDto rejects a missing version', () => {
    expect(hasVersionError(UpdateStatusDto, { status: IssueStatus.RESOLVED })).toBe(true);
    expect(hasVersionError(UpdateStatusDto, { status: IssueStatus.RESOLVED, version: 2 })).toBe(false);
  });
});
