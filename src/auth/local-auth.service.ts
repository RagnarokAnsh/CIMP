import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcryptjs';
import { AccountStatus } from '../common/enums';
import { StaffUser } from '../entities';
import { AuthService } from './auth.service';
import { AuthenticatedStaff } from './auth.types';

// Self-issued JWT staff auth — no external IdP. We mint HS256 tokens signed with
// JWT_SECRET on password login, and verify them the same way on each request.
// The token proves IDENTITY only; authorization always comes from UserPlatformRole
// via ScopeService. Inert unless JWT_SECRET is configured.
@Injectable()
export class LocalAuthService {
  constructor(
    @InjectRepository(StaffUser) private readonly staff: Repository<StaffUser>,
    private readonly config: ConfigService,
    private readonly auth: AuthService,
  ) {}

  get enabled(): boolean {
    return Boolean(this.config.get<string>('auth.jwtSecret'));
  }

  private get secret(): string {
    return this.config.get<string>('auth.jwtSecret') ?? '';
  }

  static hashPassword(plain: string): Promise<string> {
    return bcrypt.hash(plain, 10);
  }

  async login(email: string, password: string): Promise<{ accessToken: string }> {
    if (!this.enabled) throw new UnauthorizedException('Password login is not enabled.');

    // passwordHash is select:false, so fetch it explicitly.
    const user = await this.staff
      .createQueryBuilder('u')
      .addSelect('u.passwordHash')
      .where('LOWER(u.email) = LOWER(:email)', { email })
      .getOne();

    // Always run a compare to avoid leaking which emails exist (timing).
    const hash = user?.passwordHash ?? '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidina';
    const ok = await bcrypt.compare(password, hash);
    if (!user || !user.passwordHash || !ok) {
      throw new UnauthorizedException('Invalid email or password.');
    }
    if (user.status !== AccountStatus.ACTIVE) {
      throw new UnauthorizedException('This account is disabled.');
    }

    const options: jwt.SignOptions = {
      algorithm: 'HS256',
      expiresIn: (this.config.get<string>('auth.jwtExpiresIn') ??
        '8h') as jwt.SignOptions['expiresIn'],
    };
    const accessToken = jwt.sign(
      { sub: user.idpSubject, name: user.name, email: user.email },
      this.secret,
      options,
    );
    return { accessToken };
  }

  // Verifies a self-issued token and resolves the staff (same upsert path as
  // OIDC). Returns null on any failure so the guard can fall through to OIDC.
  async verifyToken(token: string): Promise<AuthenticatedStaff | null> {
    if (!this.enabled) return null;
    try {
      const claims = jwt.verify(token, this.secret, { algorithms: ['HS256'] }) as {
        sub: string;
        name?: string;
        email?: string;
      };
      return await this.auth.upsertFromClaims({
        sub: claims.sub,
        name: claims.name,
        email: claims.email,
      });
    } catch {
      return null;
    }
  }
}
