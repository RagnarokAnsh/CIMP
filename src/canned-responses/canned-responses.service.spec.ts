import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { QueryFailedError } from 'typeorm';
import { CannedResponsesService } from './canned-responses.service';
import { ScopeService } from '../authz/scope.service';
import { Role } from '../common/enums';

describe('CannedResponsesService', () => {
  const scopedToPA = { id: 's1', roles: [{ role: Role.DEVELOPER, platformId: 'pA' }] } as any;
  // A watcher holds a read grant but no write role — must be refused (they can't comment).
  const watcherOnPA = { id: 's2', roles: [{ role: Role.WATCHER, platformId: 'pA' }] } as any;
  let responses: any;
  let service: CannedResponsesService;

  beforeEach(() => {
    responses = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn(),
      remove: jest.fn(),
    };
    service = new CannedResponsesService(responses, new ScopeService());
  });

  it('forbids access on a platform outside the staff scope', async () => {
    await expect(service.list(scopedToPA, 'pB')).rejects.toThrow(ForbiddenException);
  });

  it('forbids a read-only watcher from managing templates', async () => {
    await expect(service.list(watcherOnPA, 'pA')).rejects.toThrow(ForbiddenException);
  });

  it('creates a template on an in-scope platform, stamping the author', async () => {
    responses.save.mockResolvedValue({
      id: 'c1', title: 'Ask for logs', body: 'Hi {{reporter}}', createdAt: new Date(), updatedAt: new Date(),
    });
    const res = await service.create(scopedToPA, 'pA', { title: 'Ask for logs', body: 'Hi {{reporter}}' });
    expect(res).toMatchObject({ id: 'c1', title: 'Ask for logs' });
    expect(responses.create).toHaveBeenCalledWith(expect.objectContaining({ createdBy: 's1' }));
  });

  it('maps a duplicate-title violation to a 409', async () => {
    responses.save.mockRejectedValue(
      new QueryFailedError('insert', [], { code: '23505' } as any),
    );
    await expect(
      service.create(scopedToPA, 'pA', { title: 'dup', body: 'x' }),
    ).rejects.toThrow(ConflictException);
  });

  it('404s editing a template that belongs to another platform', async () => {
    responses.findOne.mockResolvedValue({ id: 'c1', platform: { id: 'pB' } });
    await expect(
      service.update(scopedToPA, 'pA', 'c1', { body: 'new' }),
    ).rejects.toThrow(NotFoundException);
  });

  it('lists templates as a compact view', async () => {
    const now = new Date();
    responses.find.mockResolvedValue([
      { id: 'c1', title: 'Greeting', body: 'Hello', createdAt: now, updatedAt: now },
    ]);
    await expect(service.list(scopedToPA, 'pA')).resolves.toEqual([
      { id: 'c1', title: 'Greeting', body: 'Hello', createdAt: now, updatedAt: now },
    ]);
  });
});
