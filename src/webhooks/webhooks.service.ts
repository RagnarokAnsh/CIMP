import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import * as crypto from 'crypto';
import { WebhookEndpoint } from '../entities';

// Best-effort, in-process delivery: 5s timeout, 3 detached retries with
// backoff. A durable queue (Redis/BullMQ) is deliberately out of scope — if a
// receiver is down for longer than the retry window, that delivery is lost.
const RETRY_DELAYS_MS = [2_000, 8_000, 30_000];
const SEND_TIMEOUT_MS = 5_000;

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  // Instance copy so tests can shrink the backoff without fake timers.
  private retryDelaysMs = RETRY_DELAYS_MS;

  constructor(
    @InjectRepository(WebhookEndpoint) private readonly endpoints: Repository<WebhookEndpoint>,
  ) {}

  // Fan a payload out to every enabled endpoint subscribed to this event on
  // this platform (or globally). Fire-and-forget per endpoint; never throws.
  async deliver(eventName: string, platformId: string, payload: object): Promise<void> {
    const candidates = await this.endpoints.find({
      where: [
        { enabled: true, platform: IsNull() },
        { enabled: true, platform: { id: platformId } },
      ],
    });
    const body = JSON.stringify(payload);
    for (const ep of candidates) {
      if (ep.events.length > 0 && !ep.events.includes(eventName)) continue;
      this.attempt(ep, eventName, body, 0);
    }
  }

  // Basic SSRF guard: https only, and no loopback/private/link-local targets.
  // Hostname-string checks only — a public DNS name resolving to a private IP
  // is not caught (documented limitation; the endpoint list is admin-only).
  assertSafeUrl(url: string): void {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new BadRequestException('Invalid webhook URL.');
    }
    if (parsed.protocol !== 'https:') {
      throw new BadRequestException('Webhook URLs must use https.');
    }
    const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    const isPrivate =
      host === 'localhost'
      || host.endsWith('.localhost')
      || host === '::1'
      || host === '0.0.0.0'
      || /^127\./.test(host)
      || /^10\./.test(host)
      || /^192\.168\./.test(host)
      || /^172\.(1[6-9]|2\d|3[01])\./.test(host)
      || /^169\.254\./.test(host);
    if (isPrivate) {
      throw new BadRequestException('Webhook URLs must not target private or loopback addresses.');
    }
  }

  generateSecret(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  sign(secret: string, rawBody: string): string {
    return `sha256=${crypto.createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  }

  // One delivery attempt; on failure schedules the next retry detached so the
  // emitting request (and the event loop) is never held hostage.
  private attempt(ep: WebhookEndpoint, eventName: string, body: string, tryIdx: number): void {
    void this.send(ep, eventName, body).catch((err: Error) => {
      if (tryIdx < this.retryDelaysMs.length) {
        const delay = this.retryDelaysMs[tryIdx];
        const timer = setTimeout(() => this.attempt(ep, eventName, body, tryIdx + 1), delay);
        // Don't keep the process alive just for webhook retries.
        if (typeof timer.unref === 'function') timer.unref();
      } else {
        this.logger.warn(`webhook ${ep.id} → ${ep.url} failed after retries: ${err.message}`);
      }
    });
  }

  private async send(ep: WebhookEndpoint, eventName: string, body: string): Promise<void> {
    // Re-check on every send, not just create/update — the row may predate a
    // guard tightening, and it costs nothing.
    this.assertSafeUrl(ep.url);
    const res = await fetch(ep.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-CIMP-Event': eventName,
        'X-CIMP-Signature': this.sign(ep.secret, body),
      },
      body,
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
  }
}
