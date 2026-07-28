import {
  ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { SERVABLE_SCAN_STATUSES } from '../common/constants';
import { Attachment } from '../entities';
import { AuthenticatedStaff } from '../auth/auth.types';
import { ScopeService } from '../authz/scope.service';
import { STAFF_READ_ROLES } from '../authz/role-sets';
import { StorageService } from '../storage/storage.service';

export interface ServableFile {
  buffer: Buffer;
  filename: string;
  contentType: string;
}

@Injectable()
export class AttachmentsService {
  constructor(
    @InjectRepository(Attachment) private readonly attachments: Repository<Attachment>,
    private readonly scope: ScopeService,
    private readonly storage: StorageService,
  ) {}

  async getForStaff(staff: AuthenticatedStaff, attachmentId: string): Promise<ServableFile> {
    const attachment = await this.attachments.findOne({
      where: { id: attachmentId },
      relations: { issue: { platform: true } },
    });
    if (!attachment || !attachment.issue) throw new NotFoundException('Attachment not found');

    // Download is a read — any role on the platform may fetch, watchers included.
    // Out-of-scope answers 404, identical to not-found: a 403 here would confirm
    // that an attachment id exists on some other tenant's issue, which is the
    // existence oracle PlatformAccessGuard closes for issue ids
    // (platform-access.guard.ts) and reporter.service.ts closes for reporters.
    // This was the last 403/404 asymmetry in the codebase.
    if (!this.scope.canAccessPlatform(staff, attachment.issue.platform.id, STAFF_READ_ROLES)) {
      throw new NotFoundException('Attachment not found');
    }
    if (!SERVABLE_SCAN_STATUSES.has(attachment.scanStatus)) {
      throw new ForbiddenException(
        `Attachment is not available (scan status: ${attachment.scanStatus}).`,
      );
    }

    return {
      buffer: await this.storage.read(attachment.storageKey),
      filename: attachment.filename,
      contentType: attachment.contentType,
    };
  }
}
