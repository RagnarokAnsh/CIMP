import { NotFoundException } from '@nestjs/common';
import { WatchersService } from './watchers.service';

describe('WatchersService', () => {
  const staff = { id: 's1' } as any;
  let watchers: any;
  let issues: any;
  let service: WatchersService;

  beforeEach(() => {
    watchers = {
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn(),
      remove: jest.fn(),
    };
    issues = { findOne: jest.fn() };
    service = new WatchersService(watchers, issues);
  });

  it('404s watching a missing issue', async () => {
    issues.findOne.mockResolvedValue(null);
    await expect(service.watch(staff, 'i1')).rejects.toThrow(NotFoundException);
  });

  it('watches an issue and reports watching=true with the watcher list', async () => {
    issues.findOne.mockResolvedValue({ id: 'i1' });
    watchers.find.mockResolvedValue([{ staffUser: { id: 's1', name: 'Me' } }]);
    const res = await service.watch(staff, 'i1');
    expect(watchers.save).toHaveBeenCalled();
    expect(res).toEqual({ watching: true, watchers: [{ id: 's1', name: 'Me' }] });
  });

  it('lists watchers and computes the watching flag for the caller', async () => {
    watchers.find.mockResolvedValue([{ staffUser: { id: 's2', name: 'Other' } }]);
    const res = await service.listForIssue(staff, 'i1');
    expect(res.watching).toBe(false);
    expect(res.watchers).toEqual([{ id: 's2', name: 'Other' }]);
  });

  it('unwatch removes the subscription', async () => {
    watchers.findOne.mockResolvedValue({ id: 'w1' });
    await service.unwatch(staff, 'i1');
    expect(watchers.remove).toHaveBeenCalledWith({ id: 'w1' });
  });
});
