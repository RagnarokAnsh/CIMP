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
