import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { LabelsService } from './labels.service';
import { ScopeService } from '../authz/scope.service';
import { Role } from '../common/enums';

describe('LabelsService', () => {
  const scopedToPA = { id: 's1', roles: [{ role: Role.DEVELOPER, platformId: 'pA' }] } as any;
  let labels: any;
  let issueLabels: any;
  let issues: any;
  let service: LabelsService;

  beforeEach(() => {
    labels = { find: jest.fn(), findOne: jest.fn(), create: jest.fn((x) => x), save: jest.fn(), remove: jest.fn() };
    issueLabels = { find: jest.fn(), findOne: jest.fn(), create: jest.fn((x) => x), save: jest.fn(), remove: jest.fn() };
    issues = { findOne: jest.fn() };
    service = new LabelsService(labels, issueLabels, issues, new ScopeService());
  });

  it('forbids catalog access on a platform outside the staff scope', async () => {
    await expect(service.listForPlatform(scopedToPA, 'pB')).rejects.toThrow(ForbiddenException);
  });

  it('creates a label on an in-scope platform', async () => {
    labels.save.mockResolvedValue({ id: 'l1', name: 'bug', color: '#ff0000' });
    const res = await service.createForPlatform(scopedToPA, 'pA', { name: 'bug', color: '#ff0000' });
    expect(res).toMatchObject({ id: 'l1', name: 'bug' });
  });

  it('rejects attaching a label from a different platform', async () => {
    issues.findOne.mockResolvedValue({ id: 'i1', platform: { id: 'pA' } });
    labels.findOne.mockResolvedValue({ id: 'l1', platform: { id: 'pB' } });
    await expect(service.addToIssue('i1', { labelId: 'l1' })).rejects.toThrow(BadRequestException);
  });

  it('404s attaching a nonexistent label', async () => {
    issues.findOne.mockResolvedValue({ id: 'i1', platform: { id: 'pA' } });
    labels.findOne.mockResolvedValue(null);
    await expect(service.addToIssue('i1', { labelId: 'lx' })).rejects.toThrow(NotFoundException);
  });

  it('maps issue labels to a compact view', async () => {
    issueLabels.find.mockResolvedValue([{ label: { id: 'l1', name: 'bug', color: '#f00' } }]);
    await expect(service.listForIssue('i1')).resolves.toEqual([{ id: 'l1', name: 'bug', color: '#f00' }]);
  });
});
