import {
  Body, Controller, ForbiddenException, Headers, Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { createHash, timingSafeEqual } from 'crypto';
import { JiraInboundService } from './jira-inbound.service';

// Constant-time secret comparison. Hashing first equalizes length so
// timingSafeEqual never throws on mismatched sizes and no length is leaked.
function secretsMatch(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest();
  const hb = createHash('sha256').update(b).digest();
  return timingSafeEqual(ha, hb);
}

// Inbound Jira automation webhook. Unauthenticated by JWT (Jira can't carry our
// staff token) but gated by a shared secret sent as `X-Webhook-Token`. Disabled
// unless JIRA_WEBHOOK_SECRET is configured.
@ApiTags('integrations')
@Controller('integrations/jira')
export class JiraWebhookController {
  constructor(
    private readonly inbound: JiraInboundService,
    private readonly config: ConfigService,
  ) {}

  @Post('webhook')
  @ApiOperation({ summary: 'Inbound Jira status webhook (shared-secret gated).' })
  async webhook(@Headers('x-webhook-token') token: string | undefined, @Body() body: any) {
    const secret = this.config.get<string>('jira.webhookSecret');
    // Disabled when unconfigured; constant-time comparison to avoid leaking the
    // secret via response-timing on this unauthenticated endpoint.
    if (!secret || !token || !secretsMatch(token, secret)) {
      throw new ForbiddenException('Invalid or missing webhook token.');
    }
    return this.inbound.applyWebhook(body);
  }
}
