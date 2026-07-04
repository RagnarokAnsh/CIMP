import {
  ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { createHash, randomBytes } from 'crypto';
import { IsNull, Repository } from 'typeorm';
import { Role } from '../common/enums';
import { ApiToken, Issue } from '../entities';
import { AuthenticatedStaff } from '../auth/auth.types';
import { ScopeService } from '../authz/scope.service';

const ALL_STAFF_ROLES: Role[] = [Role.FOCAL_POINT, Role.DEVELOPER, Role.ADMIN];
const sha256 = (v: string): string => createHash('sha256').update(v).digest('hex');

@Injectable()
export class ApiTokensService {
  constructor(
    @InjectRepository(ApiToken) private readonly tokens: Repository<ApiToken>,
    @InjectRepository(Issue) private readonly issues: Repository<Issue>,
    private readonly scope: ScopeService,
  ) {}

  private assertAccess(staff: AuthenticatedStaff, platformId: string): void {
    if (!this.scope.canAccessPlatform(staff, platformId, ALL_STAFF_ROLES)) {
      throw new ForbiddenException('You do not have access to this platform.');
    }
  }

  // ── Management (staff, platform-scoped) ────────────────────────────
  async list(staff: AuthenticatedStaff, platformId: string) {
    this.assertAccess(staff, platformId);
    const rows = await this.tokens.find({
      where: { platform: { id: platformId } },
      order: { createdAt: 'DESC' },
    });
    return rows.map((t) => this.toView(t));
  }

  // Returns the plaintext token ONCE — it is not recoverable afterward.
  async create(staff: AuthenticatedStaff, platformId: string, name: string) {
    this.assertAccess(staff, platformId);
    const plaintext = `cimp_${randomBytes(24).toString('hex')}`;
    const saved = await this.tokens.save(
      this.tokens.create({
        platform: { id: platformId } as any,
        name,
        tokenHash: sha256(plaintext),
        lastFour: plaintext.slice(-4),
        createdBy: staff.id,
      }),
    );
    return { ...this.toView(saved), token: plaintext };
  }

  async revoke(staff: AuthenticatedStaff, platformId: string, tokenId: string) {
    this.assertAccess(staff, platformId);
    const token = await this.tokens.findOne({ where: { id: tokenId }, relations: { platform: true } });
    if (!token || token.platform.id !== platformId) throw new NotFoundException('Token not found.');
    if (!token.revokedAt) {
      token.revokedAt = new Date();
      await this.tokens.save(token);
    }
    return { ok: true };
  }

  // ── Authentication (used by ApiTokenGuard) ─────────────────────────
  async authenticate(raw: string): Promise<ApiToken | null> {
    const token = await this.tokens.findOne({
      where: { tokenHash: sha256(raw), revokedAt: IsNull() },
      relations: { platform: true },
    });
    if (!token) return null;
    // Best-effort last-used stamp; don't block the request on it.
    this.tokens.update({ id: token.id }, { lastUsedAt: new Date() }).catch(() => undefined);
    return token;
  }

  // ── Read surface for authenticated integrations ────────────────────
  async listIssues(platformId: string, page = 1, pageSize = 50) {
    const take = Math.min(100, Math.max(1, pageSize));
    const [rows, total] = await this.issues.findAndCount({
      where: { platform: { id: platformId } },
      order: { createdAt: 'DESC' },
      skip: (Math.max(1, page) - 1) * take,
      take,
    });
    return { data: rows.map((i) => this.issueView(i)), total, page: Math.max(1, page), pageSize: take };
  }

  async getIssue(platformId: string, issueId: string) {
    const issue = await this.issues.findOne({ where: { id: issueId, platform: { id: platformId } } });
    if (!issue) throw new NotFoundException('Issue not found.');
    return this.issueView(issue);
  }

  private issueView(i: Issue) {
    return {
      id: i.id,
      referenceNo: i.referenceNo,
      status: i.status,
      priority: i.priority,
      description: i.description,
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
    };
  }

  private toView(t: ApiToken) {
    return {
      id: t.id,
      name: t.name,
      lastFour: t.lastFour,
      revoked: Boolean(t.revokedAt),
      lastUsedAt: t.lastUsedAt,
      createdAt: t.createdAt,
    };
  }
}
