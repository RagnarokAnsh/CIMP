import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcryptjs';
import { UnauthorizedException } from '@nestjs/common';
import { DUMMY_PASSWORD_HASH, LocalAuthService } from './local-auth.service';
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

// Regression: the unknown-email path compares against DUMMY_PASSWORD_HASH purely
// to burn the same CPU a real hash would. That only works if the constant is a
// STRUCTURALLY VALID bcrypt hash — `bcrypt.compare` short-circuits on a malformed
// one and returns in ~0 ms, turning the defence into a clean binary oracle for
// "does this email exist". The original constant was 59 characters (a real hash
// is 60) and measured 0.00 ms vs 83 ms for a known email.
describe('DUMMY_PASSWORD_HASH', () => {
  it('is a structurally valid bcrypt hash, so the compare cannot short-circuit', () => {
    expect(DUMMY_PASSWORD_HASH).toHaveLength(60);
    expect(DUMMY_PASSWORD_HASH).toMatch(/^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/);
  });

  it('actually costs real work to compare against', async () => {
    // A malformed hash resolves near-instantly; a valid one runs the KDF.
    const started = Date.now();
    await bcrypt.compare('any-guess', DUMMY_PASSWORD_HASH);
    expect(Date.now() - started).toBeGreaterThan(5);
  });
});
