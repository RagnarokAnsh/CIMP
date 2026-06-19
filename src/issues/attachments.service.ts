import {
  ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role, ScanStatus } from '../common/enums';
import { Attachment } from '../entities';
import { AuthenticatedStaff } from '../auth/auth.types';
import { ScopeService } from '../authz/scope.service';
import { StorageService } from '../storage/storage.service';

const STAFF_ROLES = [Role.FOCAL_POINT, Role.DEVELOPER, Role.ADMIN];
// Only files that have cleared (or skipped) scanning may be served.
const SERVABLE = new Set([ScanStatus.CLEAN, ScanStatus.SKIPPED]);

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

    if (!this.scope.canAccessPlatform(staff, attachment.issue.platform.id, STAFF_ROLES)) {
      throw new ForbiddenException('You do not have access to this attachment.');
    }
    if (!SERVABLE.has(attachment.scanStatus)) {
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
