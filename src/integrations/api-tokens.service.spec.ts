import { ForbiddenException } from '@nestjs/common';
import { createHash } from 'crypto';
import { ApiTokensService } from './api-tokens.service';
import { ScopeService } from '../authz/scope.service';
import { PlatformStatus, Role } from '../common/enums';

describe('ApiTokensService', () => {
  const admin = { id: 's1', roles: [{ role: Role.ADMIN, platformId: null }] } as any;
  let tokens: any;
  let issues: any;
  let audit: any;
  let service: ApiTokensService;

  beforeEach(() => {
    tokens = {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn((x) => x),
      save: jest.fn((x) => ({ ...x, id: 't1', createdAt: new Date() })),
      update: jest.fn().mockResolvedValue({}),
    };
    issues = { findAndCount: jest.fn(), findOne: jest.fn() };
    // Minting/revoking a platform credential must leave an audit trail.
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    service = new ApiTokensService(tokens, issues, new ScopeService(), audit);
  });

  it('forbids creating a token without platform access', async () => {
    const focal = { id: 's2', roles: [{ role: Role.FOCAL_POINT, platformId: 'pA' }] } as any;
    await expect(service.create(focal, 'pB', 'ci')).rejects.toThrow(ForbiddenException);
  });

  it('returns the plaintext token once and stores only its SHA-256 hash', async () => {
    const res = await service.create(admin, 'pA', 'ci');
    expect(res.token).toMatch(/^cimp_[0-9a-f]{48}$/);
    const savedArg = tokens.save.mock.calls[0][0];
    expect(savedArg.tokenHash).toBe(createHash('sha256').update(res.token).digest('hex'));
    expect(savedArg.tokenHash).not.toContain('cimp_');
    expect(res).not.toHaveProperty('tokenHash');
    expect(res.lastFour).toBe(res.token.slice(-4));
  });

  it('authenticates a known active token by hash and rejects an unknown one', async () => {
    tokens.findOne.mockResolvedValueOnce({
      id: 't1',
      platform: { id: 'pA', status: PlatformStatus.ACTIVE },
    });
    await expect(service.authenticate('cimp_whatever')).resolves.toMatchObject({ id: 't1' });
    tokens.findOne.mockResolvedValueOnce(null);
    await expect(service.authenticate('bad')).resolves.toBeNull();
  });

  // Disabling a platform must stop the integration read API too, not just hand-off
  // and self-support — otherwise a retired platform keeps leaking issue descriptions.
  it('rejects an unrevoked token whose platform has been disabled', async () => {
    tokens.findOne.mockResolvedValueOnce({
      id: 't1',
      platform: { id: 'pA', status: PlatformStatus.DISABLED },
    });
    await expect(service.authenticate('cimp_whatever')).resolves.toBeNull();
    // No last-used stamp for a request we refused.
    expect(tokens.update).not.toHaveBeenCalled();
  });

  // The audit trail is the only durable record of who issued a long-lived
  // platform credential — the plaintext is unrecoverable and lastFour is all
  // that identifies it later.
  it('records an audit event when a token is minted, without the plaintext', async () => {
    const admin = { id: 's1', roles: [{ role: Role.ADMIN, platformId: null }] } as any;
    const result = await service.create(admin, 'pA', 'ci-bot');
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      action: 'API_TOKEN_CREATED',
      actorId: 's1',
    }));
    const recorded = JSON.stringify(audit.record.mock.calls[0][0]);
    expect(recorded).not.toContain(result.token);
  });

  it('records an audit event when a token is revoked', async () => {
    const admin = { id: 's1', roles: [{ role: Role.ADMIN, platformId: null }] } as any;
    tokens.findOne.mockResolvedValue({
      id: 't1', name: 'ci-bot', lastFour: 'abcd', revokedAt: null, platform: { id: 'pA' },
    });
    await service.revoke(admin, 'pA', 't1');
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      action: 'API_TOKEN_REVOKED',
      actorId: 's1',
    }));
  });
});
