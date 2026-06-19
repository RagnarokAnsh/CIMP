import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StaffUser, UserPlatformRole } from '../entities';
import { AuthenticatedStaff, OidcClaims, StaffRoleGrant } from './auth.types';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(StaffUser) private readonly staff: Repository<StaffUser>,
    @InjectRepository(UserPlatformRole)
    private readonly roles: Repository<UserPlatformRole>,
    private readonly config: ConfigService,
  ) {}

  // Upsert the StaffUser from verified token claims. The IdP masters identity;
  // our DB only mirrors it so we can attach role grants (the source of truth
  // for scope). Called on every authenticated request.
  async upsertFromClaims(claims: OidcClaims): Promise<AuthenticatedStaff> {
    const nameClaim = this.config.get<string>('oidc.nameClaim') ?? 'name';
    const emailClaim = this.config.get<string>('oidc.emailClaim') ?? 'email';
    const name = (claims[nameClaim] as string) ?? claims.sub;
    const email = (claims[emailClaim] as string) ?? '';

    let user = await this.staff.findOne({ where: { idpSubject: claims.sub } });
    if (!user) {
      user = this.staff.create({ idpSubject: claims.sub, name, email });
      user = await this.staff.save(user);
    } else if (user.name !== name || user.email !== email) {
      user.name = name;
      user.email = email;
      user = await this.staff.save(user);
    }

    return { ...this.toAuthenticated(user), roles: await this.loadRoles(user.id) };
  }

  async loadRoles(staffUserId: string): Promise<StaffRoleGrant[]> {
    const grants = await this.roles.find({
      where: { staffUser: { id: staffUserId } },
      relations: { platform: true },
    });
    return grants.map((g) => ({ role: g.role, platformId: g.platform?.id ?? null }));
  }

  private toAuthenticated(user: StaffUser): AuthenticatedStaff {
    return {
      id: user.id,
      idpSubject: user.idpSubject,
      name: user.name,
      email: user.email,
      roles: [],
    };
  }
}
