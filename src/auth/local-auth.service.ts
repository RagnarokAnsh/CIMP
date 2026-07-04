import { Injectable, Logger, UnauthorizedException } from '@nestjs/common';
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
  private readonly logger = new Logger(LocalAuthService.name);

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
      // Auditable auth event (A09): failed login. Never log the password.
      this.logger.warn(`Failed staff login for "${email}"`);
      throw new UnauthorizedException('Invalid email or password.');
    }
    if (user.status !== AccountStatus.ACTIVE) {
      this.logger.warn(`Login blocked (disabled account) for "${user.email}"`);
      throw new UnauthorizedException('This account is disabled.');
    }
    this.logger.log(`Staff login succeeded: ${user.email}`);

    const options: jwt.SignOptions = {
      algorithm: 'HS256',
      expiresIn: (this.config.get<string>('auth.jwtExpiresIn') ??
        '8h') as jwt.SignOptions['expiresIn'],
    };
    const accessToken = jwt.sign(
      { sub: user.idpSubject, name: user.name, email: user.email, tv: user.tokenVersion },
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
        tv?: number;
      };
      return await this.auth.upsertFromClaims({
        sub: claims.sub,
        name: claims.name,
        email: claims.email,
        tv: claims.tv,
      });
    } catch {
      return null;
    }
  }

  // Mint a short-lived, single-purpose ticket for the SSE stream. EventSource
  // can't send Authorization headers, so it rides in the URL — keeping it to
  // ~30s and audience-scoped means a leaked stream URL is not a usable session
  // token (unlike the full 8h JWT it replaces). Minted only for an ACTIVE user.
  async signSseTicket(idpSubject: string): Promise<string | null> {
    if (!this.enabled) return null;
    const user = await this.staff.findOne({ where: { idpSubject } });
    if (!user || user.status !== AccountStatus.ACTIVE) return null;
    return jwt.sign(
      { sub: idpSubject, tv: user.tokenVersion },
      this.secret,
      { algorithm: 'HS256', expiresIn: '30s', audience: 'sse' },
    );
  }

  // Verify an SSE ticket. The `audience: 'sse'` requirement means a normal
  // session token (no audience) is rejected here, and the ticket is rejected on
  // normal routes — so the two are not interchangeable.
  async verifySseTicket(ticket: string): Promise<AuthenticatedStaff | null> {
    if (!this.enabled) return null;
    try {
      const claims = jwt.verify(ticket, this.secret, {
        algorithms: ['HS256'],
        audience: 'sse',
        maxAge: '30s',
      }) as { sub: string; tv?: number };
      return await this.auth.upsertFromClaims({ sub: claims.sub, tv: claims.tv });
    } catch {
      return null;
    }
  }
}
