import {
  ConflictException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CannedResponse } from '../entities';
import { AuthenticatedStaff } from '../auth/auth.types';
import { ScopeService } from '../authz/scope.service';
import { STAFF_WRITE_ROLES } from '../authz/role-sets';
import { isUniqueViolation } from '../common/db-errors';
import { CreateCannedResponseDto, UpdateCannedResponseDto } from './dto/canned-response.dto';

// Per-platform reply templates. Both managing AND using them is write-role only:
// watchers cannot comment, so there is no read-only surface (unlike the labels
// catalog, which watchers list because labels appear on issues they can see).
@Injectable()
export class CannedResponsesService {
  constructor(
    @InjectRepository(CannedResponse) private readonly responses: Repository<CannedResponse>,
    private readonly scope: ScopeService,
  ) {}

  private assertAccess(staff: AuthenticatedStaff, platformId: string): void {
    if (!this.scope.canAccessPlatform(staff, platformId, STAFF_WRITE_ROLES)) {
      throw new ForbiddenException('You do not have access to this platform.');
    }
  }

  async list(staff: AuthenticatedStaff, platformId: string) {
    this.assertAccess(staff, platformId);
    const rows = await this.responses.find({
      where: { platform: { id: platformId } },
      order: { title: 'ASC' },
    });
    return rows.map((r) => this.toView(r));
  }

  async create(staff: AuthenticatedStaff, platformId: string, dto: CreateCannedResponseDto) {
    this.assertAccess(staff, platformId);
    try {
      const saved = await this.responses.save(
        this.responses.create({
          platform: { id: platformId } as any,
          title: dto.title.trim(),
          body: dto.body,
          createdBy: staff.id,
        }),
      );
      return this.toView(saved);
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new ConflictException('A canned response with that title already exists on this platform.');
      }
      throw e;
    }
  }

  async update(staff: AuthenticatedStaff, platformId: string, id: string, dto: UpdateCannedResponseDto) {
    this.assertAccess(staff, platformId);
    const row = await this.responses.findOne({ where: { id }, relations: { platform: true } });
    // Same-platform check: the row must belong to the platform in the path, so a
    // template id can't be edited through another platform the caller can access.
    if (!row || row.platform.id !== platformId) throw new NotFoundException('Canned response not found.');
    if (dto.title !== undefined) row.title = dto.title.trim();
    if (dto.body !== undefined) row.body = dto.body;
    try {
      return this.toView(await this.responses.save(row));
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new ConflictException('A canned response with that title already exists on this platform.');
      }
      throw e;
    }
  }

  async remove(staff: AuthenticatedStaff, platformId: string, id: string) {
    this.assertAccess(staff, platformId);
    const row = await this.responses.findOne({ where: { id }, relations: { platform: true } });
    if (!row || row.platform.id !== platformId) throw new NotFoundException('Canned response not found.');
    await this.responses.remove(row);
    return { ok: true };
  }

  private toView(r: CannedResponse) {
    return {
      id: r.id,
      title: r.title,
      body: r.body,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }
}
