import * as jwt from 'jsonwebtoken';
import { UnauthorizedException } from '@nestjs/common';
import { LocalAuthService } from './local-auth.service';
import { AccountStatus } from '../common/enums';

const SECRET = 'test-secret';

describe('LocalAuthService.login', () => {
  function make(user: any, secret: string = SECRET) {
    const qb = {
      addSelect: () => qb,
      where: () => qb,
      getOne: async () => user,
    };
    const staff = { createQueryBuilder: () => qb } as any;
    const config = {
      get: (k: string) => (k === 'auth.jwtSecret' ? secret : k === 'auth.jwtExpiresIn' ? '8h' : undefined),
    } as any;
    return new LocalAuthService(staff, config, {} as any);
  }

  it('mints a verifiable token on valid credentials', async () => {
    const passwordHash = await LocalAuthService.hashPassword('correct-horse');
    const user = {
      idpSubject: 'local:p@x.com', name: 'P', email: 'p@x.com',
      status: AccountStatus.ACTIVE, passwordHash,
    };
    const svc = make(user);

    const { accessToken } = await svc.login('p@x.com', 'correct-horse');
    const decoded = jwt.verify(accessToken, SECRET) as any;
    expect(decoded.sub).toBe('local:p@x.com');
  });

  it('rejects a wrong password', async () => {
    const passwordHash = await LocalAuthService.hashPassword('correct-horse');
    const user = { idpSubject: 's', name: 'P', email: 'p@x.com', status: AccountStatus.ACTIVE, passwordHash };
    await expect(make(user).login('p@x.com', 'wrong')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects a disabled account', async () => {
    const passwordHash = await LocalAuthService.hashPassword('correct-horse');
    const user = { idpSubject: 's', name: 'P', email: 'p@x.com', status: AccountStatus.DISABLED, passwordHash };
    await expect(make(user).login('p@x.com', 'correct-horse')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects an unknown email without leaking existence', async () => {
    await expect(make(null).login('nobody@x.com', 'whatever')).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('is disabled when no JWT secret is configured', async () => {
    const svc = make(null, '');
    expect(svc.enabled).toBe(false);
    await expect(svc.login('p@x.com', 'x')).rejects.toBeInstanceOf(UnauthorizedException);
  });
});

// Token-shape hardening: several single-purpose tokens share JWT_SECRET.
// verifyToken must accept ONLY the session-token shape (sub, no audience).
describe('LocalAuthService.verifyToken', () => {
  let upsertFromClaims: jest.Mock;

  function make() {
    upsertFromClaims = jest.fn(async (claims: any) => ({ id: 'u1', sub: claims.sub }));
    const config = { get: (k: string) => (k === 'auth.jwtSecret' ? SECRET : undefined) } as any;
    return new LocalAuthService({} as any, config, { upsertFromClaims } as any);
  }

  it('accepts a plain session token', async () => {
    const token = jwt.sign({ sub: 'local:p@x.com', tv: 1 }, SECRET, { algorithm: 'HS256' });
    expect(await make().verifyToken(token)).toBeTruthy();
    expect(upsertFromClaims).toHaveBeenCalledWith(expect.objectContaining({ sub: 'local:p@x.com' }));
  });

  it('rejects audience-scoped tokens — an SSE ticket is not a session', async () => {
    // Exact shape signSseTicket mints: sub + valid tv + audience 'sse'.
    const ticket = jwt.sign({ sub: 'local:p@x.com', tv: 1 }, SECRET, {
      algorithm: 'HS256', expiresIn: '30s', audience: 'sse',
    });
    expect(await make().verifyToken(ticket)).toBeNull();
    expect(upsertFromClaims).not.toHaveBeenCalled();
  });

  it('rejects sub-less tokens — deflection subscribe tokens share the secret', async () => {
    const subscribe = jwt.sign({ purpose: 'subscribe', issueId: 'i1' }, SECRET, {
      algorithm: 'HS256', expiresIn: '30m',
    });
    expect(await make().verifyToken(subscribe)).toBeNull();
    expect(upsertFromClaims).not.toHaveBeenCalled();
  });
});
