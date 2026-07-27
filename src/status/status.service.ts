import {
  BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, In, Repository } from 'typeorm';
import {
  ComponentStatus, IncidentStatus, PlatformStatus,
} from '../common/enums';
import {
  Platform, StatusComponent, StatusIncident, StatusIncidentUpdate,
} from '../entities';
import { AuthenticatedStaff } from '../auth/auth.types';
import { ScopeService } from '../authz/scope.service';
import { STAFF_WRITE_ROLES } from '../authz/role-sets';
import { isUniqueViolation } from '../common/db-errors';
import {
  AddIncidentUpdateDto, CreateComponentDto, CreateIncidentDto, UpdateComponentDto,
} from './dto/status.dto';

// How many past incidents the public page shows.
const PUBLIC_HISTORY_LIMIT = 20;

// Worst-last, so the overall banner is the max over all components.
const SEVERITY_ORDER: ComponentStatus[] = [
  ComponentStatus.OPERATIONAL,
  ComponentStatus.MAINTENANCE,
  ComponentStatus.DEGRADED,
  ComponentStatus.PARTIAL_OUTAGE,
  ComponentStatus.MAJOR_OUTAGE,
];

@Injectable()
export class StatusService {
  constructor(
    @InjectRepository(StatusComponent) private readonly components: Repository<StatusComponent>,
    @InjectRepository(StatusIncident) private readonly incidents: Repository<StatusIncident>,
    @InjectRepository(StatusIncidentUpdate) private readonly updates: Repository<StatusIncidentUpdate>,
    @InjectRepository(Platform) private readonly platforms: Repository<Platform>,
    private readonly dataSource: DataSource,
    private readonly scope: ScopeService,
  ) {}

  // Publishing to a public page is a write action: write roles only, never a
  // read-only watcher.
  private assertAccess(staff: AuthenticatedStaff, platformId: string): void {
    if (!this.scope.canAccessPlatform(staff, platformId, STAFF_WRITE_ROLES)) {
      throw new ForbiddenException('You do not have access to this platform.');
    }
  }

  // ── Components (staff) ─────────────────────────────────────────────
  async listComponents(staff: AuthenticatedStaff, platformId: string) {
    this.assertAccess(staff, platformId);
    return (await this.loadComponents(platformId)).map((c) => this.componentView(c));
  }

  async createComponent(staff: AuthenticatedStaff, platformId: string, dto: CreateComponentDto) {
    this.assertAccess(staff, platformId);
    try {
      const saved = await this.components.save(
        this.components.create({
          platform: { id: platformId } as any,
          name: dto.name.trim(),
          description: dto.description?.trim() || null,
          status: dto.status ?? ComponentStatus.OPERATIONAL,
          position: dto.position ?? 0,
        }),
      );
      return this.componentView(saved);
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new ConflictException('A component with that name already exists on this platform.');
      }
      throw e;
    }
  }

  async updateComponent(
    staff: AuthenticatedStaff,
    platformId: string,
    componentId: string,
    dto: UpdateComponentDto,
  ) {
    this.assertAccess(staff, platformId);
    const row = await this.ownedComponent(platformId, componentId);
    if (dto.name !== undefined) row.name = dto.name.trim();
    if (dto.description !== undefined) row.description = dto.description.trim() || null;
    if (dto.status !== undefined) row.status = dto.status;
    if (dto.position !== undefined) row.position = dto.position;
    try {
      return this.componentView(await this.components.save(row));
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new ConflictException('A component with that name already exists on this platform.');
      }
      throw e;
    }
  }

  async deleteComponent(staff: AuthenticatedStaff, platformId: string, componentId: string) {
    this.assertAccess(staff, platformId);
    await this.components.remove(await this.ownedComponent(platformId, componentId));
    return { ok: true };
  }

  // ── Incidents (staff) ──────────────────────────────────────────────
  async listIncidents(staff: AuthenticatedStaff, platformId: string) {
    this.assertAccess(staff, platformId);
    const rows = await this.incidents.find({
      where: { platform: { id: platformId } },
      relations: { components: true, updates: true },
      order: { startedAt: 'DESC' },
      take: 50,
    });
    return rows.map((i) => this.incidentView(i));
  }

  async createIncident(staff: AuthenticatedStaff, platformId: string, dto: CreateIncidentDto) {
    this.assertAccess(staff, platformId);
    const components = await this.resolveComponents(platformId, dto.componentIds);
    const status = dto.status ?? IncidentStatus.INVESTIGATING;

    const id = await this.dataSource.transaction(async (em) => {
      const incident = await em.save(
        em.create(StatusIncident, {
          platform: { id: platformId } as any,
          title: dto.title.trim(),
          status,
          impact: dto.impact ?? undefined,
          components,
          startedAt: new Date(),
          // An incident opened as already-RESOLVED (a retro-posted note) still
          // needs its terminal timestamp, or the public page shows it ongoing.
          resolvedAt: status === IncidentStatus.RESOLVED ? new Date() : null,
          createdBy: staff.id,
        }),
      );
      // The opening statement is the first timeline entry, so the public
      // timeline is complete from the start rather than beginning at update #2.
      await em.save(
        em.create(StatusIncidentUpdate, {
          incident: { id: incident.id } as any,
          status,
          body: dto.body,
          createdBy: staff.id,
        }),
      );
      return incident.id;
    });
    return this.getIncident(platformId, id);
  }

  // Progress an incident by posting a public update. The incident inherits the
  // update's status — the timeline is the source of truth for where it stands.
  async addIncidentUpdate(
    staff: AuthenticatedStaff,
    platformId: string,
    incidentId: string,
    dto: AddIncidentUpdateDto,
  ) {
    this.assertAccess(staff, platformId);
    const incident = await this.ownedIncident(platformId, incidentId);
    const components = dto.componentIds
      ? await this.resolveComponents(platformId, dto.componentIds)
      : null;

    await this.dataSource.transaction(async (em) => {
      incident.status = dto.status;
      // Re-opening a resolved incident clears the terminal stamp so it shows as
      // ongoing again; resolving stamps it once and keeps the original time.
      incident.resolvedAt = dto.status === IncidentStatus.RESOLVED
        ? (incident.resolvedAt ?? new Date())
        : null;
      if (components) incident.components = components;
      await em.save(incident);
      await em.save(
        em.create(StatusIncidentUpdate, {
          incident: { id: incident.id } as any,
          status: dto.status,
          body: dto.body,
          createdBy: staff.id,
        }),
      );
    });
    return this.getIncident(platformId, incidentId);
  }

  async deleteIncident(staff: AuthenticatedStaff, platformId: string, incidentId: string) {
    this.assertAccess(staff, platformId);
    await this.incidents.remove(await this.ownedIncident(platformId, incidentId));
    return { ok: true };
  }

  // ── Public page (UNAUTHENTICATED) ──────────────────────────────────
  // Everything returned here is staff-authored and deliberately published:
  // component names/statuses and incident titles/updates. No reporter text, no
  // issue references, no internal ids beyond the incident's own.
  async publicStatus(platformKey: string) {
    const platform = await this.platforms.findOne({ where: { key: platformKey } });
    // A disabled platform is treated as non-existent, matching HandoffService.
    if (!platform || platform.status !== PlatformStatus.ACTIVE) {
      throw new NotFoundException('Unknown platform.');
    }

    const [components, incidents] = await Promise.all([
      this.loadComponents(platform.id),
      this.incidents.find({
        where: { platform: { id: platform.id } },
        relations: { components: true, updates: true },
        order: { startedAt: 'DESC' },
        take: PUBLIC_HISTORY_LIMIT,
      }),
    ]);

    const active = incidents.filter((i) => i.status !== IncidentStatus.RESOLVED);
    return {
      platform: { key: platform.key, name: platform.name },
      overall: this.overallStatus(components, active.length > 0),
      components: components.map((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        status: c.status,
      })),
      activeIncidents: active.map((i) => this.incidentView(i)),
      recentIncidents: incidents
        .filter((i) => i.status === IncidentStatus.RESOLVED)
        .map((i) => this.incidentView(i)),
      updatedAt: new Date().toISOString(),
    };
  }

  // Worst component status wins. With no components configured at all, an open
  // incident still has to move the banner off "operational" — otherwise a
  // platform that only posts incidents always reads as green.
  private overallStatus(components: StatusComponent[], hasActiveIncident: boolean): ComponentStatus {
    const worst = components.reduce<ComponentStatus>(
      (acc, c) =>
        (SEVERITY_ORDER.indexOf(c.status) > SEVERITY_ORDER.indexOf(acc) ? c.status : acc),
      ComponentStatus.OPERATIONAL,
    );
    if (worst === ComponentStatus.OPERATIONAL && hasActiveIncident) {
      return ComponentStatus.DEGRADED;
    }
    return worst;
  }

  // ── Helpers ────────────────────────────────────────────────────────
  private loadComponents(platformId: string): Promise<StatusComponent[]> {
    return this.components.find({
      where: { platform: { id: platformId } },
      order: { position: 'ASC', name: 'ASC' },
    });
  }

  private async ownedComponent(platformId: string, componentId: string): Promise<StatusComponent> {
    const row = await this.components.findOne({
      where: { id: componentId },
      relations: { platform: true },
    });
    // Same-platform check: a component id from another platform must be
    // indistinguishable from one that doesn't exist.
    if (!row || row.platform.id !== platformId) throw new NotFoundException('Component not found.');
    return row;
  }

  private async ownedIncident(platformId: string, incidentId: string): Promise<StatusIncident> {
    const row = await this.incidents.findOne({
      where: { id: incidentId },
      relations: { platform: true, components: true },
    });
    if (!row || row.platform.id !== platformId) throw new NotFoundException('Incident not found.');
    return row;
  }

  private async getIncident(platformId: string, incidentId: string) {
    const row = await this.incidents.findOne({
      where: { id: incidentId },
      relations: { components: true, updates: true },
    });
    if (!row) throw new NotFoundException('Incident not found.');
    return this.incidentView(row);
  }

  // Components named on an incident must belong to the SAME platform, or a
  // status page could advertise another tenant's component names.
  private async resolveComponents(
    platformId: string,
    ids: string[] | undefined,
  ): Promise<StatusComponent[]> {
    const wanted = [...new Set(ids ?? [])];
    if (wanted.length === 0) return [];
    const rows = await this.components.find({
      where: { id: In(wanted), platform: { id: platformId } },
    });
    if (rows.length !== wanted.length) {
      throw new BadRequestException('One or more components do not belong to this platform.');
    }
    return rows;
  }

  private componentView(c: StatusComponent) {
    return {
      id: c.id,
      name: c.name,
      description: c.description,
      status: c.status,
      position: c.position,
      updatedAt: c.updatedAt,
    };
  }

  private incidentView(i: StatusIncident) {
    return {
      id: i.id,
      title: i.title,
      status: i.status,
      impact: i.impact,
      startedAt: i.startedAt,
      resolvedAt: i.resolvedAt,
      components: (i.components ?? []).map((c) => ({ id: c.id, name: c.name })),
      updates: (i.updates ?? [])
        .slice()
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .map((u) => ({
          id: u.id, status: u.status, body: u.body, createdAt: u.createdAt,
        })),
    };
  }
}
