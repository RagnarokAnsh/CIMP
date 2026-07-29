import {
  Body, Controller, Delete, Get, NotFoundException, Param, ParseUUIDPipe, Patch, Post, UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Role } from '../common/enums';
import { Platform, WebhookEndpoint } from '../entities';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentStaff } from '../auth/current-staff.decorator';
import { AuthenticatedStaff } from '../auth/auth.types';
import { Roles } from '../authz/roles.decorator';
import { RolesGuard } from '../authz/roles.guard';
import { WebhooksService } from './webhooks.service';
import { CreateWebhookDto, UpdateWebhookDto } from './dto/webhook.dto';

// Admin-only CRUD for outbound webhook endpoints. RolesGuard (not
// PlatformAccessGuard) — same rationale as AdminController. No config UI yet;
// manage via Swagger/curl.
@ApiTags('admin-webhooks')
@ApiBearerAuth('staff')
@Controller('admin/webhooks')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
export class WebhooksController {
  constructor(
    @InjectRepository(WebhookEndpoint) private readonly endpoints: Repository<WebhookEndpoint>,
    private readonly webhooks: WebhooksService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'List webhook endpoints (secrets never returned).' })
  async list() {
    const rows = await this.endpoints.find({
      relations: { platform: true },
      order: { createdAt: 'ASC' },
    });
    return rows.map((e) => this.toView(e));
  }

  @Post()
  @ApiOperation({ summary: 'Create a webhook endpoint. The signing secret is returned ONCE.' })
  async create(@CurrentStaff() staff: AuthenticatedStaff, @Body() dto: CreateWebhookDto) {
    this.webhooks.assertSafeUrl(dto.url);
    const secret = this.webhooks.generateSecret();
    const saved = await this.endpoints.save(
      this.endpoints.create({
        url: dto.url,
        secret,
        events: dto.events ?? [],
        platform: dto.platformId ? ({ id: dto.platformId } as Platform) : null,
        createdBy: staff.id,
      }),
    );
    // The only response that ever carries the secret — store it receiver-side.
    return { ...this.toView(saved, dto.platformId ?? null), secret };
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update url/events/enabled.' })
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateWebhookDto) {
    const ep = await this.endpoints.findOne({ where: { id }, relations: { platform: true } });
    if (!ep) throw new NotFoundException('Webhook endpoint not found.');
    if (dto.url !== undefined) {
      this.webhooks.assertSafeUrl(dto.url);
      ep.url = dto.url;
    }
    if (dto.events !== undefined) ep.events = dto.events;
    if (dto.enabled !== undefined) ep.enabled = dto.enabled;
    return this.toView(await this.endpoints.save(ep));
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete a webhook endpoint.' })
  async remove(@Param('id', ParseUUIDPipe) id: string) {
    const ep = await this.endpoints.findOne({ where: { id } });
    if (!ep) throw new NotFoundException('Webhook endpoint not found.');
    await this.endpoints.remove(ep);
    return { ok: true };
  }

  private toView(e: WebhookEndpoint, platformIdFallback: string | null = null) {
    return {
      id: e.id,
      url: e.url,
      events: e.events,
      enabled: e.enabled,
      platformId: e.platform?.id ?? platformIdFallback,
      createdAt: e.createdAt,
    };
  }
}
