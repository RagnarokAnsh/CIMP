import {
  Body, Controller, ForbiddenException, Headers, Post,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JiraInboundService } from './jira-inbound.service';

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
    // Disabled when unconfigured; constant-ish comparison via strict equality.
    if (!secret || token !== secret) {
      throw new ForbiddenException('Invalid or missing webhook token.');
    }
    return this.inbound.applyWebhook(body);
  }
}
