import {
  BadRequestException, ConflictException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, IsNull, Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { AccountStatus, ActorType, Priority, Role } from '../common/enums';
import {
  Issue, Platform, StaffUser, UserPlatformRole,
} from '../entities';
import { AuthenticatedStaff, localSubject } from '../auth/auth.types';
import { LocalAuthService } from '../auth/local-auth.service';
import { AuditService } from '../audit/audit.service';
import { CreatePlatformDto } from './dto/create-platform.dto';
import { UpdatePlatformDto } from './dto/update-platform.dto';
import { AssignRoleDto } from './dto/assign-role.dto';
import { CreateStaffDto } from './dto/create-staff.dto';
import { UpdateStaffDto } from './dto/update-staff.dto';
import { SetPasswordDto } from './dto/set-password.dto';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(Platform) private readonly platforms: Repository<Platform>,
    @InjectRepository(StaffUser) private readonly staff: Repository<StaffUser>,
    @InjectRepository(UserPlatformRole) private readonly roles: Repository<UserPlatformRole>,
    @InjectRepository(Issue) private readonly issues: Repository<Issue>,
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  // ---- Platforms -----------------------------------------------------------

  async listPlatforms() {
    const rows = await this.platforms.find({ order: { createdAt: 'ASC' } });
    return rows.map((p) => this.toPlatform(p));
  }

  async createPlatform(admin: AuthenticatedStaff, dto: CreatePlatformDto) {
    const existing = await this.platforms.findOne({ where: { key: dto.key } });
    if (existing) throw new ConflictException(`Platform key "${dto.key}" already exists.`);

    const platform = await this.dataSource.transaction(async (em) => {
      const saved = await em.save(
        this.platforms.create({
          key: dto.key,
          name: dto.name,
          status: dto.status,
          jiraProjectKey: dto.jiraProjectKey ?? null,
          jiraEnabled: dto.jiraEnabled ?? false,
          handoffSecret: dto.handoffSecret ?? this.newSecret(),
        }),
      );
      await this.audit.record({
        actorType: ActorType.STAFF,
        actorId: admin.id,
        action: 'PLATFORM_CREATED',
        newValue: saved.key,
        metadata: { platformId: saved.id },
      }, em);
      return saved;
    });
    return this.toPlatform(platform);
  }

  async updatePlatform(admin: AuthenticatedStaff, id: string, dto: UpdatePlatformDto) {
    const platform = await this.platforms.findOne({ where: { id } });
    if (!platform) throw new NotFoundException('Platform not found');

    if (dto.name !== undefined) platform.name = dto.name;
    if (dto.status !== undefined) platform.status = dto.status;
    if (dto.jiraProjectKey !== undefined) platform.jiraProjectKey = dto.jiraProjectKey;
    if (dto.jiraEnabled !== undefined) platform.jiraEnabled = dto.jiraEnabled;
    if (dto.slaPolicy !== undefined) platform.slaPolicy = this.validateSlaPolicy(dto.slaPolicy);

    await this.dataSource.transaction(async (em) => {
      await em.save(platform);
      await this.audit.record({
        actorType: ActorType.STAFF,
        actorId: admin.id,
        action: 'PLATFORM_UPDATED',
        metadata: { platformId: id },
      }, em);
    });
    return this.toPlatform(platform);
  }

  // SLA policy: only priority keys, only sane positive hour values (≤ 1 year).
  // Empty object normalizes to null (= all env defaults).
  private validateSlaPolicy(
    policy: Record<string, number> | null,
  ): Partial<Record<string, number>> | null {
    if (policy === null) return null;
    const allowed = new Set(Object.values(Priority) as string[]);
    const out: Record<string, number> = {};
    for (const [key, value] of Object.entries(policy)) {
      if (!allowed.has(key)) {
        throw new BadRequestException(`Unknown SLA priority "${key}".`);
      }
      const hours = Number(value);
      if (!Number.isFinite(hours) || hours <= 0 || hours > 8760) {
        throw new BadRequestException(`SLA hours for ${key} must be between 0 and 8760.`);
      }
      out[key] = hours;
    }
    return Object.keys(out).length > 0 ? out : null;
  }

  // Hard-delete a platform. Only ever possible while it holds NO issues:
  // Issue.platform is onDelete RESTRICT, so Postgres would refuse anyway — we
  // check first to return a 409 that names the real remedy instead of a 500.
  // Everything else attached (reporters, role grants, labels, API tokens,
  // webhooks, automation rules) cascades away with it.
  //
  // Retiring a platform that HAS history is `status: DISABLED` — that already
  // stops hand-off tokens, self-support, deflection and the digest, and stays
  // reversible.
  async deletePlatform(admin: AuthenticatedStaff, id: string) {
    const platform = await this.platforms.findOne({ where: { id } });
    if (!platform) throw new NotFoundException('Platform not found');

    const issueCount = await this.issues.count({ where: { platform: { id } } });
    if (issueCount > 0) {
      throw new ConflictException(
        `"${platform.key}" still has ${issueCount} issue(s) and cannot be deleted. `
        + 'Set its status to DISABLED to retire it while keeping the history.',
      );
    }

    await this.dataSource.transaction(async (em) => {
      await em.remove(platform);
      await this.audit.record({
        actorType: ActorType.STAFF,
        actorId: admin.id,
        action: 'PLATFORM_DELETED',
        oldValue: platform.key,
        metadata: { platformId: id },
      }, em);
    });
    return { ok: true };
  }

  // Rotate the hand-off signing secret. Returns the new secret ONCE so the
  // portal owner can update their backend; it is not exposed by list/get.
  async rotateSecret(admin: AuthenticatedStaff, id: string) {
    const platform = await this.platforms.findOne({ where: { id } });
    if (!platform) throw new NotFoundException('Platform not found');
    platform.handoffSecret = this.newSecret();
    await this.dataSource.transaction(async (em) => {
      await em.save(platform);
      await this.audit.record({
        actorType: ActorType.STAFF,
        actorId: admin.id,
        action: 'PLATFORM_SECRET_ROTATED',
        metadata: { platformId: id },
      }, em);
    });
    return { id: platform.id, key: platform.key, handoffSecret: platform.handoffSecret };
  }

  // ---- Staff & roles -------------------------------------------------------

  async listStaff() {
    const rows = await this.staff.find({
      relations: { roleAssignments: { platform: true } },
      order: { createdAt: 'ASC' },
    });
    return rows.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      status: u.status,
      roles: (u.roleAssignments ?? []).map((r) => ({
        id: r.id,
        role: r.role,
        platformId: r.platform?.id ?? null,
        platformKey: r.platform?.key ?? null,
      })),
    }));
  }

  // Create a staff user with a password for self-issued JWT login. idpSubject is
  // keyed as `local:<email>` so the login token's `sub` resolves back here.
  async createStaff(admin: AuthenticatedStaff, dto: CreateStaffDto) {
    const email = dto.email.toLowerCase();
    const idpSubject = localSubject(email);
    const existing = await this.staff.findOne({
      where: [{ email }, { idpSubject }],
    });
    if (existing) throw new ConflictException('A staff user with that email already exists.');

    const passwordHash = await LocalAuthService.hashPassword(dto.password);
    const user = await this.dataSource.transaction(async (em) => {
      const saved = await em.save(
        this.staff.create({ idpSubject, name: dto.name, email, passwordHash }),
      );
      await this.audit.record({
        actorType: ActorType.STAFF,
        actorId: admin.id,
        action: 'STAFF_CREATED',
        newValue: email,
        metadata: { staffUserId: saved.id },
      }, em);
      return saved;
    });
    return { id: user.id, name: user.name, email: user.email, status: user.status };
  }

  // Edit a staff member's identity or lifecycle status.
  //
  // DISABLED is the offboarding path: login is refused (LocalAuthService) and
  // every live token is rejected on its next request (AuthService re-checks
  // status per call), so access ends immediately rather than at token expiry.
  // They stay assignable-in-history, keep authoring their comments, and can be
  // re-enabled — which is why this, not delete, is the default in the UI.
  async updateStaff(admin: AuthenticatedStaff, id: string, dto: UpdateStaffDto) {
    const user = await this.staff.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Staff user not found');

    if (dto.status === AccountStatus.DISABLED && user.status !== AccountStatus.DISABLED) {
      if (user.id === admin.id) {
        throw new BadRequestException('You cannot disable your own account.');
      }
      await this.assertNotLastAdmin(user.id, 'disable');
    }

    if (dto.name !== undefined) user.name = dto.name;

    // Re-key the login subject with the email. `sub` in an issued token is the
    // idpSubject, so this invalidates existing sessions — bump tokenVersion too
    // and let them log in again under the new address. (AuthService refuses to
    // auto-create `local:` subjects, so the stale token 401s instead of
    // resurrecting the old identity.)
    if (dto.email !== undefined && dto.email.toLowerCase() !== user.email) {
      const email = dto.email.toLowerCase();
      const clash = await this.staff.findOne({
        where: [{ email }, { idpSubject: localSubject(email) }],
      });
      if (clash && clash.id !== user.id) {
        throw new ConflictException('A staff user with that email already exists.');
      }
      user.email = email;
      user.idpSubject = localSubject(email);
      user.tokenVersion = (user.tokenVersion ?? 1) + 1;
    }

    if (dto.status !== undefined && dto.status !== user.status) {
      user.status = dto.status;
      // Disabling revokes on the next request regardless, but bumping the
      // version closes the door on cached/replayed tokens as well.
      if (dto.status === AccountStatus.DISABLED) {
        user.tokenVersion = (user.tokenVersion ?? 1) + 1;
      }
    }

    await this.dataSource.transaction(async (em) => {
      await em.save(user);
      await this.audit.record({
        actorType: ActorType.STAFF,
        actorId: admin.id,
        action: 'STAFF_UPDATED',
        newValue: dto.status ?? null,
        metadata: { staffUserId: id, fields: Object.keys(dto) },
      }, em);
    });
    return {
      id: user.id, name: user.name, email: user.email, status: user.status,
    };
  }

  // Hard-delete a staff user. Their role grants, watches and saved views
  // cascade; issues they were assigned fall back to unassigned and their
  // comments survive unattributed (both FKs are ON DELETE SET NULL). The audit
  // trail keeps the raw actor id, so history is not rewritten.
  //
  // Prefer updateStaff({ status: DISABLED }) — it ends access just as fast and
  // keeps attribution intact.
  async deleteStaff(admin: AuthenticatedStaff, id: string) {
    const user = await this.staff.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Staff user not found');
    if (user.id === admin.id) {
      throw new BadRequestException('You cannot delete your own account.');
    }
    await this.assertNotLastAdmin(user.id, 'delete');

    await this.dataSource.transaction(async (em) => {
      await em.remove(user);
      await this.audit.record({
        actorType: ActorType.STAFF,
        actorId: admin.id,
        action: 'STAFF_DELETED',
        oldValue: user.email,
        metadata: { staffUserId: id },
      }, em);
    });
    return { ok: true };
  }

  // Refuse anything that would leave the deployment with no reachable admin.
  // Nothing else in the system can re-grant ADMIN, so locking the last one out
  // is recoverable only with direct database access.
  private async assertNotLastAdmin(staffUserId: string, action: string) {
    const others = await this.roles
      .createQueryBuilder('r')
      .innerJoin('r.staffUser', 'su')
      .where('r.role = :role', { role: Role.ADMIN })
      .andWhere('su.status = :active', { active: AccountStatus.ACTIVE })
      .andWhere('su.id != :id', { id: staffUserId })
      .getCount();
    if (others === 0) {
      throw new ConflictException(
        `Cannot ${action} the last active administrator. `
        + 'Grant ADMIN to another staff member first.',
      );
    }
  }

  // Set or reset a staff member's password (admin-initiated).
  async setStaffPassword(admin: AuthenticatedStaff, id: string, dto: SetPasswordDto) {
    const user = await this.staff.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Staff user not found');
    user.passwordHash = await LocalAuthService.hashPassword(dto.password);
    // Invalidate any tokens issued before this reset (session revocation).
    user.tokenVersion = (user.tokenVersion ?? 1) + 1;
    await this.dataSource.transaction(async (em) => {
      await em.save(user);
      await this.audit.record({
        actorType: ActorType.STAFF,
        actorId: admin.id,
        action: 'STAFF_PASSWORD_SET',
        metadata: { staffUserId: id },
      }, em);
    });
    return { ok: true };
  }

  async assignRole(admin: AuthenticatedStaff, dto: AssignRoleDto) {
    // Scope rules (Section 2): focal points are always per-platform; admins are
    // global; developers and watchers may be either (a global watcher is a
    // read-only observer across all platforms).
    if (dto.role === Role.FOCAL_POINT && !dto.platformId) {
      throw new BadRequestException('Focal points must be scoped to a platform.');
    }
    if (dto.role === Role.ADMIN && dto.platformId) {
      throw new BadRequestException('Admins are global; do not set a platform.');
    }

    const user = await this.staff.findOne({ where: { id: dto.staffUserId } });
    if (!user) throw new NotFoundException('Staff user not found');

    let platform: Platform | null = null;
    if (dto.platformId) {
      platform = await this.platforms.findOne({ where: { id: dto.platformId } });
      if (!platform) throw new NotFoundException('Platform not found');
    }

    const existing = await this.roles.findOne({
      where: {
        staffUser: { id: user.id },
        role: dto.role,
        platform: dto.platformId ? { id: dto.platformId } : IsNull(),
      },
    });
    if (existing) throw new ConflictException('That role assignment already exists.');

    const grant = await this.dataSource.transaction(async (em) => {
      const saved = await em.save(
        this.roles.create({
          staffUser: { id: user.id } as any,
          platform: platform ? ({ id: platform.id } as any) : null,
          role: dto.role,
        }),
      );
      await this.audit.record({
        actorType: ActorType.STAFF,
        actorId: admin.id,
        action: 'ROLE_ASSIGNED',
        newValue: dto.role,
        metadata: { staffUserId: user.id, platformId: dto.platformId ?? null, grantId: saved.id },
      }, em);
      return saved;
    });
    return { id: grant.id, role: grant.role, platformId: dto.platformId ?? null };
  }

  async revokeRole(admin: AuthenticatedStaff, roleId: string) {
    const grant = await this.roles.findOne({
      where: { id: roleId },
      relations: { staffUser: true, platform: true },
    });
    if (!grant) throw new NotFoundException('Role assignment not found');
    // Revoking the only remaining ADMIN grant — typically an admin clicking the
    // bin on their own badge — would lock everyone out of this screen for good.
    if (grant.role === Role.ADMIN && grant.staffUser) {
      await this.assertNotLastAdmin(grant.staffUser.id, 'revoke ADMIN from');
    }
    await this.dataSource.transaction(async (em) => {
      await em.remove(grant);
      await this.audit.record({
        actorType: ActorType.STAFF,
        actorId: admin.id,
        action: 'ROLE_REVOKED',
        oldValue: grant.role,
        metadata: { staffUserId: grant.staffUser?.id, platformId: grant.platform?.id ?? null },
      }, em);
    });
    return { ok: true };
  }

  private newSecret(): string {
    return randomBytes(32).toString('hex');
  }

  // Never expose handoffSecret in list/get responses.
  private toPlatform(p: Platform) {
    return {
      id: p.id,
      key: p.key,
      name: p.name,
      status: p.status,
      jiraProjectKey: p.jiraProjectKey,
      jiraEnabled: p.jiraEnabled,
      slaPolicy: p.slaPolicy ?? null,
      createdAt: p.createdAt,
    };
  }
}
