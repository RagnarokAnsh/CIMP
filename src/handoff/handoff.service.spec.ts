import { UnauthorizedException } from '@nestjs/common';
import * as jwt from 'jsonwebtoken';
import { Repository } from 'typeorm';
import { HandoffService } from './handoff.service';
import { Platform } from '../entities';
import { PlatformStatus } from '../common/enums';

// The reporter-auth trust boundary. HandoffService.verify() is the ONLY thing
// standing between a portal-minted token and another tenant's issues, so every
// rejection path is asserted here: algorithm pinning (no alg:none), wrong
// secret, expiry, unknown/inactive platform, and missing claims. These tests
// would fail loudly if a refactor weakened any of them.
describe('HandoffService.verify', () => {
  const SECRET = 'test-portal-secret-0123456789abcdef0123456789abcdef';
  const activePlatform = {
    id: 'p-1',
    key: 'portal-a',
    handoffSecret: SECRET,
    status: PlatformStatus.ACTIVE,
  } as Platform;

  const validClaims = {
    platformKey: 'portal-a',
    portalUserId: 'u-1',
    name: 'Asha Rao',
    email: 'asha@example.org',
  };

  let findOne: jest.Mock;
  let service: HandoffService;

  const sign = (
    claims: Record<string, unknown>,
    secret = SECRET,
    opts: jwt.SignOptions = {},
  ): string => jwt.sign(claims, secret, { algorithm: 'HS256', expiresIn: '5m', ...opts });

  const b64url = (o: unknown): string =>
    Buffer.from(JSON.stringify(o)).toString('base64url');

  beforeEach(() => {
    findOne = jest.fn().mockResolvedValue(activePlatform);
    service = new HandoffService({ findOne } as unknown as Repository<Platform>);
  });

  it('accepts a valid HS256 token and returns context derived from the DB row', async () => {
    const ctx = await service.verify(sign(validClaims));
    expect(ctx).toEqual({
      platformId: 'p-1',
      platformKey: 'portal-a',
      reporter: { portalUserId: 'u-1', name: 'Asha Rao', email: 'asha@example.org' },
    });
    // platformId/platformKey come from the DB row, not the (attacker-controlled) claims.
    expect(findOne).toHaveBeenCalledWith({ where: { key: 'portal-a' } });
  });

  it('rejects an empty token before any DB lookup', async () => {
    await expect(service.verify('')).rejects.toThrow(UnauthorizedException);
    expect(findOne).not.toHaveBeenCalled();
  });

  it('rejects a token missing the platformKey claim before any DB lookup', async () => {
    const { platformKey, ...noKey } = validClaims;
    await expect(service.verify(sign(noKey))).rejects.toThrow(UnauthorizedException);
    expect(findOne).not.toHaveBeenCalled();
  });

  it('rejects an unsigned alg:none token (algorithm pinning)', async () => {
    const token = `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url(validClaims)}.`;
    await expect(service.verify(token)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a token signed with the wrong secret', async () => {
    await expect(service.verify(sign(validClaims, 'a-different-secret-that-is-also-32ch'))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects an expired token', async () => {
    await expect(service.verify(sign(validClaims, SECRET, { expiresIn: -10 }))).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rejects an unknown platform BEFORE trusting the signature', async () => {
    findOne.mockResolvedValue(null);
    await expect(service.verify(sign(validClaims))).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a token for an inactive (DISABLED) platform', async () => {
    findOne.mockResolvedValue({ ...activePlatform, status: PlatformStatus.DISABLED });
    await expect(service.verify(sign(validClaims))).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a validly-signed token missing required reporter claims', async () => {
    const { email, ...noEmail } = validClaims;
    await expect(service.verify(sign(noEmail))).rejects.toThrow(UnauthorizedException);
    const { portalUserId, ...noUser } = validClaims;
    await expect(service.verify(sign(noUser))).rejects.toThrow(UnauthorizedException);
  });
});
