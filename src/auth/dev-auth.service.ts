import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as jwt from 'jsonwebtoken';
import { StaffUser } from '../entities';
import { AuthService } from './auth.service';
import { AuthenticatedStaff } from './auth.types';

// DEV ONLY. Mints and verifies locally-signed HS256 tokens so the staff
// workspace can be used without a real OIDC provider. Everything here is inert
// unless `devAuth.enabled` is true (DEV_AUTH=true and not production).
@Injectable()
export class DevAuthService {
  constructor(
    @InjectRepository(StaffUser) private readonly staff: Repository<StaffUser>,
    private readonly config: ConfigService,
    private readonly auth: AuthService,
  ) {}

  get enabled(): boolean {
    return Boolean(this.config.get<boolean>('devAuth.enabled'));
  }

  private get secret(): string {
    return this.config.get<string>('devAuth.secret') ?? 'dev-only';
  }

  // Seeded staff for the dev login picker, with their role grants.
  async listStaff() {
    const users = await this.staff.find({ order: { createdAt: 'ASC' } });
    return Promise.all(
      users.map(async (u) => ({
        idpSubject: u.idpSubject,
        name: u.name,
        email: u.email,
        roles: await this.auth.loadRoles(u.id),
      })),
    );
  }

  // Issues a token impersonating an existing staff member.
  async mintToken(idpSubject: string): Promise<{ accessToken: string }> {
    const user = await this.staff.findOne({ where: { idpSubject } });
    if (!user) throw new NotFoundException('Unknown staff member');
    const accessToken = jwt.sign(
      { sub: user.idpSubject, name: user.name, email: user.email },
      this.secret,
      { algorithm: 'HS256', expiresIn: '8h' },
    );
    return { accessToken };
  }

  // Verifies a dev token and resolves the authenticated staff (same upsert path
  // as the OIDC strategy). Returns null on any failure so the guard can fall
  // back to OIDC.
  async verifyToken(token: string): Promise<AuthenticatedStaff | null> {
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
