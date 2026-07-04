import { BadRequestException, NotFoundException } from '@nestjs/common';
import { IssueLinksService } from './issue-links.service';
import { IssueLinkType } from '../common/enums';

describe('IssueLinksService', () => {
  const staff = { id: 's1' } as any;
  let links: any;
  let issues: any;
  let service: IssueLinksService;

  beforeEach(() => {
    links = {
      create: jest.fn((x) => x),
      save: jest.fn(),
      find: jest.fn(),
      findOne: jest.fn(),
      findOneOrFail: jest.fn(),
      remove: jest.fn(),
    };
    issues = { findOne: jest.fn() };
    service = new IssueLinksService(links, issues);
  });

  it('rejects self-links', async () => {
    await expect(
      service.create(staff, 'i1', { targetIssueId: 'i1', type: IssueLinkType.BLOCKS }),
    ).rejects.toThrow(BadRequestException);
  });

  it('rejects cross-platform links (tenant isolation)', async () => {
    issues.findOne
      .mockResolvedValueOnce({ id: 'i1', platform: { id: 'pA' } })
      .mockResolvedValueOnce({ id: 'i2', platform: { id: 'pB' } });
    await expect(
      service.create(staff, 'i1', { targetIssueId: 'i2', type: IssueLinkType.BLOCKS }),
    ).rejects.toThrow(BadRequestException);
  });

  it('404s when the target issue does not exist', async () => {
    issues.findOne
      .mockResolvedValueOnce({ id: 'i1', platform: { id: 'pA' } })
      .mockResolvedValueOnce(null);
    await expect(
      service.create(staff, 'i1', { targetIssueId: 'i2', type: IssueLinkType.RELATES }),
    ).rejects.toThrow(NotFoundException);
  });

  it('creates a same-platform link and returns it as outward', async () => {
    issues.findOne
      .mockResolvedValueOnce({ id: 'i1', platform: { id: 'pA' } })
      .mockResolvedValueOnce({ id: 'i2', platform: { id: 'pA' } });
    links.save.mockResolvedValue({ id: 'l1' });
    links.findOneOrFail.mockResolvedValue({
      id: 'l1', type: IssueLinkType.BLOCKS, createdAt: new Date(),
      sourceIssue: { id: 'i1', referenceNo: 'SUP-1', status: 'NEW' },
      targetIssue: { id: 'i2', referenceNo: 'SUP-2', status: 'NEW' },
    });
    const res = await service.create(staff, 'i1', { targetIssueId: 'i2', type: IssueLinkType.BLOCKS });
    expect(res).toMatchObject({
      direction: 'outward', type: IssueLinkType.BLOCKS, issue: { id: 'i2', referenceNo: 'SUP-2' },
    });
  });

  it('presents a link as inward when the viewing issue is the target', async () => {
    links.find.mockResolvedValue([
      {
        id: 'l1', type: IssueLinkType.BLOCKS, createdAt: new Date(),
        sourceIssue: { id: 'i9', referenceNo: 'SUP-9', status: 'NEW' },
        targetIssue: { id: 'i1', referenceNo: 'SUP-1', status: 'NEW' },
      },
    ]);
    const [view] = await service.listForIssue('i1');
    expect(view).toMatchObject({ direction: 'inward', issue: { id: 'i9', referenceNo: 'SUP-9' } });
  });
});
