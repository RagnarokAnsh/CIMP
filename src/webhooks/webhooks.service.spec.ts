import { BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import { WebhooksService } from './webhooks.service';

describe('WebhooksService', () => {
  let endpoints: any;
  let service: WebhooksService;
  let fetchMock: jest.Mock;

  const ep = (over: Record<string, unknown> = {}) => ({
    id: 'w1',
    url: 'https://example.com/hook',
    secret: 'shh',
    events: [],
    enabled: true,
    platform: null,
    ...over,
  });

  const flush = () => new Promise((r) => setTimeout(r, 25));
  // Deterministic wait: poll until the condition holds (or fail via timeout),
  // then settle a beat longer to catch over-delivery. Fixed sleeps flake here
  // because the detached retry chain's pace varies run to run.
  const until = async (cond: () => boolean, ms = 1000) => {
    const t0 = Date.now();
    while (!cond() && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 5));
    await new Promise((r) => setTimeout(r, 25));
  };

  beforeEach(() => {
    endpoints = { find: jest.fn().mockResolvedValue([]) };
    service = new WebhooksService(endpoints);
    (service as any).retryDelaysMs = [1, 1, 1];
    fetchMock = jest.fn().mockResolvedValue({ ok: true, status: 200 });
    (global as any).fetch = fetchMock;
  });

  describe('assertSafeUrl', () => {
    it.each([
      'http://example.com/hook',
      'https://localhost/hook',
      'https://api.localhost/hook',
      'https://127.0.0.1/hook',
      'https://10.1.2.3/hook',
      'https://192.168.1.5/hook',
      'https://172.16.0.1/hook',
      'https://172.31.255.1/hook',
      'https://169.254.169.254/latest/meta-data',
      'https://100.64.0.1/hook', // carrier-grade NAT, bottom of 100.64.0.0/10
      'https://100.100.1.1/hook',
      'https://100.127.255.255/hook', // top of 100.64.0.0/10
      'https://[::1]/hook',
      'https://[::ffff:169.254.169.254]/latest/meta-data', // IPv4-mapped v6 → metadata IP
      'https://[::ffff:7f00:1]/hook', // IPv4-mapped v6 → 127.0.0.1
      'https://[fe80::1]/hook', // link-local v6
      'https://[fc00::1]/hook', // unique-local v6
      'https://0.0.0.0/hook',
      'not a url',
    ])('rejects %s', (url) => {
      expect(() => service.assertSafeUrl(url)).toThrow(BadRequestException);
    });

    it.each([
      'https://example.com/hook',
      'https://hooks.internal-tools.io/cimp?x=1',
      'https://172.32.0.1/hook', // outside the 172.16-31 private block
      'https://100.63.255.1/hook', // just below 100.64.0.0/10
      'https://100.128.0.1/hook', // just above 100.64.0.0/10
    ])('allows %s', (url) => {
      expect(() => service.assertSafeUrl(url)).not.toThrow();
    });
  });

  describe('deliver', () => {
    it('signs the raw body with HMAC-SHA256 and sets the event header', async () => {
      endpoints.find.mockResolvedValue([ep()]);
      await service.deliver('issue.created', 'pA', { a: 1 });
      await flush();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe('https://example.com/hook');
      const expected = `sha256=${crypto.createHmac('sha256', 'shh').update(init.body).digest('hex')}`;
      expect(init.headers['X-CIMP-Signature']).toBe(expected);
      expect(init.headers['X-CIMP-Event']).toBe('issue.created');
      expect(JSON.parse(init.body)).toEqual({ a: 1 });
    });

    it('skips endpoints whose event filter excludes the event', async () => {
      endpoints.find.mockResolvedValue([
        ep({ id: 'w1', events: ['issue.merged'] }),
        ep({ id: 'w2', url: 'https://two.example.com/', events: [] }),
        ep({ id: 'w3', url: 'https://three.example.com/', events: ['issue.created'] }),
      ]);
      await service.deliver('issue.created', 'pA', {});
      await flush();
      const urls = fetchMock.mock.calls.map((c) => c[0]);
      expect(urls).toEqual(['https://two.example.com/', 'https://three.example.com/']);
    });

    it('retries a failing endpoint then gives up without throwing', async () => {
      endpoints.find.mockResolvedValue([ep()]);
      fetchMock.mockResolvedValue({ ok: false, status: 500 });
      await expect(service.deliver('issue.created', 'pA', {})).resolves.toBeUndefined();
      await until(() => fetchMock.mock.calls.length >= 4);
      expect(fetchMock).toHaveBeenCalledTimes(4); // initial + 3 retries, then gives up
    });

    it('recovers when a retry succeeds', async () => {
      endpoints.find.mockResolvedValue([ep()]);
      fetchMock
        .mockResolvedValueOnce({ ok: false, status: 502 })
        .mockResolvedValue({ ok: true, status: 200 });
      await service.deliver('issue.created', 'pA', {});
      await until(() => fetchMock.mock.calls.length >= 2);
      expect(fetchMock).toHaveBeenCalledTimes(2); // second attempt succeeded → no further retries
    });

    it('never sends to an endpoint whose stored URL is no longer safe', async () => {
      endpoints.find.mockResolvedValue([ep({ url: 'https://127.0.0.1/hook' })]);
      await service.deliver('issue.created', 'pA', {});
      await flush();
      expect(fetchMock).not.toHaveBeenCalled();
    });

    // Following redirects would let the receiver's operator — who is not the admin
    // who added the endpoint — bounce us to an address assertSafeUrl never vetted.
    it('does not follow redirects, and treats a 3xx as a failed delivery', async () => {
      const warn = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => {});
      endpoints.find.mockResolvedValue([ep()]);
      fetchMock.mockResolvedValue({ ok: false, status: 302 });
      await service.deliver('issue.created', 'pA', {});
      await until(() => fetchMock.mock.calls.length >= 4);

      expect(fetchMock.mock.calls[0][1].redirect).toBe('manual');
      expect(fetchMock).toHaveBeenCalledTimes(4); // 3xx is a failure: retried, then given up on
      // The operator can tell a redirect from a 500 without reading the code.
      expect(warn.mock.calls[0][0]).toMatch(/redirected \(HTTP 302\)/);
    });
  });

  // A dead host used to cost 4 doomed requests and one WARN for EVERY event —
  // a bulk change over 30 issues buried the log in ~120 requests and 30
  // identical lines.
  describe('circuit breaker', () => {
    beforeEach(() => {
      (service as any).muteAfterFailures = 2;
      (service as any).muteCooldownMs = 10_000;
      endpoints.find.mockResolvedValue([ep()]);
      fetchMock.mockResolvedValue({ ok: false, status: 500 });
    });

    it('stops attempting once consecutive deliveries have been exhausted', async () => {
      for (let i = 0; i < 2; i++) {
        await service.deliver('issue.created', 'pA', {});
        await until(() => fetchMock.mock.calls.length >= 4 * (i + 1));
      }
      expect(fetchMock).toHaveBeenCalledTimes(8); // 2 events × (initial + 3 retries)

      // Everything after the threshold is skipped outright, not retried.
      for (let i = 0; i < 5; i++) await service.deliver('issue.created', 'pA', {});
      await flush();
      expect(fetchMock).toHaveBeenCalledTimes(8);
    });

    it('logs once when it mutes, not once per suppressed event', async () => {
      const warn = jest.spyOn((service as any).logger, 'warn').mockImplementation(() => {});
      for (let i = 0; i < 2; i++) {
        await service.deliver('issue.created', 'pA', {});
        await until(() => fetchMock.mock.calls.length >= 4 * (i + 1));
      }
      for (let i = 0; i < 5; i++) await service.deliver('issue.created', 'pA', {});
      await flush();

      expect(warn).toHaveBeenCalledTimes(2); // one per exhausted delivery, then silence
      expect(warn.mock.calls[1][0]).toMatch(/pausing deliveries/);
    });

    it('lets one event through as a probe after the cooldown, and recovers on success', async () => {
      for (let i = 0; i < 2; i++) {
        await service.deliver('issue.created', 'pA', {});
        await until(() => fetchMock.mock.calls.length >= 4 * (i + 1));
      }
      expect(fetchMock).toHaveBeenCalledTimes(8);

      // Cooldown lapses; the receiver is healthy again.
      (service as any).health.get('w1').mutedUntil = Date.now() - 1;
      fetchMock.mockResolvedValue({ ok: true, status: 200 });
      await service.deliver('issue.created', 'pA', {});
      await until(() => fetchMock.mock.calls.length >= 9);
      expect(fetchMock).toHaveBeenCalledTimes(9);

      // Health is cleared, so normal delivery resumes with no cooldown.
      expect((service as any).health.has('w1')).toBe(false);
      await service.deliver('issue.created', 'pA', {});
      await until(() => fetchMock.mock.calls.length >= 10);
      expect(fetchMock).toHaveBeenCalledTimes(10);
    });

    it('does not mute an endpoint that keeps succeeding', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 200 });
      for (let i = 0; i < 4; i++) {
        await service.deliver('issue.created', 'pA', {});
        await until(() => fetchMock.mock.calls.length >= i + 1);
      }
      expect(fetchMock).toHaveBeenCalledTimes(4);
      expect((service as any).health.size).toBe(0);
    });
  });
});
