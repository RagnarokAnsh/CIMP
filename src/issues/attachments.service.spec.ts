import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { AttachmentsService } from './attachments.service';
import { ScopeService } from '../authz/scope.service';
import { StorageService } from '../storage/storage.service';
import { Attachment } from '../entities';
import { Role, ScanStatus } from '../common/enums';
import { AuthenticatedStaff } from '../auth/auth.types';

// The scan-gating guarantee: only CLEAN/SKIPPED files are ever served, and an
// INFECTED/PENDING file must be refused WITHOUT even reading it from storage.
// This is the malware-serving trust boundary, so it is asserted directly.
describe('AttachmentsService.getForStaff (scan gating + scope)', () => {
  const staff: AuthenticatedStaff = {
    id: 's1', idpSubject: 'x', name: 'S', email: 's@x',
    roles: [{ role: Role.DEVELOPER, platformId: 'p1' }],
  };

  const attachment = (scanStatus: ScanStatus, platformId = 'p1') => ({
    id: 'a1',
    scanStatus,
    storageKey: 'key-1',
    filename: 'doc.pdf',
    contentType: 'application/pdf',
    issue: { id: 'i1', platform: { id: platformId } },
  });

  let findOne: jest.Mock;
  let read: jest.Mock;
  let service: AttachmentsService;

  beforeEach(() => {
    findOne = jest.fn();
    read = jest.fn().mockResolvedValue(Buffer.from('bytes'));
    service = new AttachmentsService(
      { findOne } as unknown as Repository<Attachment>,
      new ScopeService(),
      { read } as unknown as StorageService,
    );
  });

  it.each([ScanStatus.CLEAN, ScanStatus.SKIPPED])('serves a %s attachment', async (status) => {
    findOne.mockResolvedValue(attachment(status));
    const file = await service.getForStaff(staff, 'a1');
    expect(file.buffer).toEqual(Buffer.from('bytes'));
    expect(read).toHaveBeenCalledWith('key-1');
  });

  it.each([ScanStatus.INFECTED, ScanStatus.PENDING])(
    'refuses a %s attachment and never reads it from storage',
    async (status) => {
      findOne.mockResolvedValue(attachment(status));
      await expect(service.getForStaff(staff, 'a1')).rejects.toThrow(ForbiddenException);
      expect(read).not.toHaveBeenCalled();
    },
  );

  it('refuses (403) an attachment on a platform outside the staff scope', async () => {
    findOne.mockResolvedValue(attachment(ScanStatus.CLEAN, 'p2'));
    await expect(service.getForStaff(staff, 'a1')).rejects.toThrow(ForbiddenException);
    expect(read).not.toHaveBeenCalled();
  });

  it('404s an unknown attachment', async () => {
    findOne.mockResolvedValue(null);
    await expect(service.getForStaff(staff, 'nope')).rejects.toThrow(NotFoundException);
  });
});
