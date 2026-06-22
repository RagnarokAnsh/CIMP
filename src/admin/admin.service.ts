import {
  BadRequestException, ConflictException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { ActorType, Role } from '../common/enums';
import { Platform, StaffUser, UserPlatformRole } from '../entities';
import { AuthenticatedStaff } from '../auth/auth.types';
import { LocalAuthService } from '../auth/local-auth.service';
import { AuditService } from '../audit/audit.service';
import { CreatePlatformDto } from './dto/create-platform.dto';
import { UpdatePlatformDto } from './dto/update-platform.dto';
import { AssignRoleDto } from './dto/assign-role.dto';
import { CreateStaffDto } from './dto/create-staff.dto';
import { SetPasswordDto } from './dto/set-password.dto';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(Platform) private readonly platforms: Repository<Platform>,
    @InjectRepository(StaffUser) private readonly staff: Repository<StaffUser>,
    @InjectRepository(UserPlatformRole) private readonly roles: Repository<UserPlatformRole>,
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

    const platform = await this.platforms.save(
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
      newValue: platform.key,
      metadata: { platformId: platform.id },
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

    await this.platforms.save(platform);
    await this.audit.record({
      actorType: ActorType.STAFF,
      actorId: admin.id,
      action: 'PLATFORM_UPDATED',
      metadata: { platformId: id },
    });
    return this.toPlatform(platform);
  }

  // Rotate the hand-off signing secret. Returns the new secret ONCE so the
  // portal owner can update their backend; it is not exposed by list/get.
  async rotateSecret(admin: AuthenticatedStaff, id: string) {
    const platform = await this.platforms.findOne({ where: { id } });
    if (!platform) throw new NotFoundException('Platform not found');
    platform.handoffSecret = this.newSecret();
    await this.platforms.save(platform);
    await this.audit.record({
      actorType: ActorType.STAFF,
      actorId: admin.id,
      action: 'PLATFORM_SECRET_ROTATED',
      metadata: { platformId: id },
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
    const idpSubject = `local:${email}`;
    const existing = await this.staff.findOne({
      where: [{ email }, { idpSubject }],
    });
    if (existing) throw new ConflictException('A staff user with that email already exists.');

    const user = await this.staff.save(
      this.staff.create({
        idpSubject,
        name: dto.name,
        email,
        passwordHash: await LocalAuthService.hashPassword(dto.password),
      }),
    );
    await this.audit.record({
      actorType: ActorType.STAFF,
      actorId: admin.id,
      action: 'STAFF_CREATED',
      newValue: email,
      metadata: { staffUserId: user.id },
    });
    return { id: user.id, name: user.name, email: user.email, status: user.status };
  }

  // Set or reset a staff member's password (admin-initiated).
  async setStaffPassword(admin: AuthenticatedStaff, id: string, dto: SetPasswordDto) {
    const user = await this.staff.findOne({ where: { id } });
    if (!user) throw new NotFoundException('Staff user not found');
    user.passwordHash = await LocalAuthService.hashPassword(dto.password);
    await this.staff.save(user);
    await this.audit.record({
      actorType: ActorType.STAFF,
      actorId: admin.id,
      action: 'STAFF_PASSWORD_SET',
      metadata: { staffUserId: id },
    });
    return { ok: true };
  }

  async assignRole(admin: AuthenticatedStaff, dto: AssignRoleDto) {
    // Scope rules (Section 2): focal points are always per-platform; admins are
    // global; developers may be either.
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

    const grant = await this.roles.save(
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
      metadata: { staffUserId: user.id, platformId: dto.platformId ?? null, grantId: grant.id },
    });
    return { id: grant.id, role: grant.role, platformId: dto.platformId ?? null };
  }

  async revokeRole(admin: AuthenticatedStaff, roleId: string) {
    const grant = await this.roles.findOne({
      where: { id: roleId },
      relations: { staffUser: true, platform: true },
    });
    if (!grant) throw new NotFoundException('Role assignment not found');
    await this.roles.remove(grant);
    await this.audit.record({
      actorType: ActorType.STAFF,
      actorId: admin.id,
      action: 'ROLE_REVOKED',
      oldValue: grant.role,
      metadata: { staffUserId: grant.staffUser?.id, platformId: grant.platform?.id ?? null },
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
      createdAt: p.createdAt,
    };
  }
}
