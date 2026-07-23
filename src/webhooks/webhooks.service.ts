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

// Circuit breaker. An endpoint whose host simply does not exist fails for every
// event forever: a bulk status change over 30 issues meant ~120 doomed requests
// and 30 identical WARN lines, which buries anything real in the log. After this
// many consecutive exhausted deliveries the endpoint is skipped until the
// cooldown lapses, then one event is let through as a probe — so a receiver that
// comes back heals itself without an admin touching anything.
const MUTE_AFTER_FAILURES = 3;
const MUTE_COOLDOWN_MS = 5 * 60_000;

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);
  // Instance copy so tests can shrink the backoff without fake timers.
  private retryDelaysMs = RETRY_DELAYS_MS;
  private muteAfterFailures = MUTE_AFTER_FAILURES;
  private muteCooldownMs = MUTE_COOLDOWN_MS;
  /** Per-endpoint consecutive-failure state. In memory only: a restart retries. */
  private readonly health = new Map<string, { failures: number; mutedUntil: number }>();

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
    const now = Date.now();
    for (const ep of candidates) {
      if (ep.events.length > 0 && !ep.events.includes(eventName)) continue;
      // Skip endpoints inside their cooldown; the first event after it lapses
      // acts as the probe.
      const state = this.health.get(ep.id);
      if (state && state.mutedUntil > now) continue;
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
    // IPv6 literals are rejected wholesale: classifying every non-global v6
    // range (IPv4-mapped ::ffff:a9fe:a9fe reaches the cloud metadata IP,
    // fc00::/7, fe80::/10, ...) is error-prone, and real webhook receivers
    // are reached by DNS name. IPv4 literals keep the explicit checks below.
    if (host.includes(':')) {
      throw new BadRequestException(
        'Webhook URLs must use a DNS hostname or public IPv4 address (IPv6 literals are not supported).',
      );
    }
    const isPrivate =
      host === 'localhost'
      || host.endsWith('.localhost')
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
    void this.send(ep, eventName, body).then(
      () => this.onDelivered(ep),
      (err: Error) => {
        if (tryIdx < this.retryDelaysMs.length) {
          const delay = this.retryDelaysMs[tryIdx];
          const timer = setTimeout(() => this.attempt(ep, eventName, body, tryIdx + 1), delay);
          // Don't keep the process alive just for webhook retries.
          if (typeof timer.unref === 'function') timer.unref();
          return;
        }
        this.onExhausted(ep, err);
      },
    );
  }

  private onDelivered(ep: WebhookEndpoint): void {
    const state = this.health.get(ep.id);
    if (!state) return;
    this.health.delete(ep.id);
    if (state.failures >= this.muteAfterFailures) {
      this.logger.log(`webhook ${ep.id} → ${ep.url} recovered; deliveries resumed`);
    }
  }

  private onExhausted(ep: WebhookEndpoint, err: Error): void {
    const state = this.health.get(ep.id) ?? { failures: 0, mutedUntil: 0 };
    state.failures += 1;

    if (state.failures < this.muteAfterFailures) {
      this.logger.warn(`webhook ${ep.id} → ${ep.url} failed after retries: ${err.message}`);
    } else if (state.failures === this.muteAfterFailures) {
      // One line explaining the silence that follows, rather than N identical ones.
      this.logger.warn(
        `webhook ${ep.id} → ${ep.url} failed ${state.failures}x consecutively (${err.message}); `
        + `pausing deliveries for ${Math.round(this.muteCooldownMs / 1000)}s, then retrying once`,
      );
    }
    // Every exhausted delivery from the threshold onward re-arms the cooldown,
    // so a still-dead endpoint costs one probe per cooldown rather than one per event.
    if (state.failures >= this.muteAfterFailures) {
      state.mutedUntil = Date.now() + this.muteCooldownMs;
    }
    this.health.set(ep.id, state);
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
