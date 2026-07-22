import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { AccountStatus } from '../common/enums';
import { StaffUser, UserPlatformRole } from '../entities';
import {
  AuthenticatedStaff, LOCAL_SUBJECT_PREFIX, StaffRoleGrant, TokenClaims,
} from './auth.types';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(StaffUser) private readonly staff: Repository<StaffUser>,
    @InjectRepository(UserPlatformRole)
    private readonly roles: Repository<UserPlatformRole>,
  ) {}

  // Upsert the StaffUser from verified token claims. The token masters identity;
  // our DB mirrors it so we can attach role grants (the source of truth for
  // scope). Called on every authenticated request.
  //
  // Returns null (→ 401) when the token is revoked: the account is no longer
  // ACTIVE, or its tokenVersion no longer matches (e.g. after a password reset).
  // These are re-checked on EVERY request, so revocation is immediate rather
  // than deferred to token expiry.
  async upsertFromClaims(claims: TokenClaims): Promise<AuthenticatedStaff | null> {
    // Defense in depth (verifyToken already rejects these): an undefined sub
    // must never reach the idpSubject lookup below - TypeORM would drop the
    // condition and match an arbitrary staff row.
    if (!claims.sub) return null;

    let user = await this.staff.findOne({ where: { idpSubject: claims.sub } });
    if (user) {
      if (user.status !== AccountStatus.ACTIVE) return null;
      if (claims.tv !== user.tokenVersion) return null;
      // Refresh ONLY the fields the token actually carries. Partial-claims
      // tokens (the SSE ticket is {sub,tv} only) must never clobber the stored
      // profile: `email` is unique+not-null, so overwriting it to '' both
      // breaks password login and 401-storms once two rows collide on '' — the
      // SSE reconnect loop that surfaced this.
      const name = claims.name ?? user.name;
      const email = claims.email ?? user.email;
      if (user.name !== name || user.email !== email) {
        user.name = name;
        user.email = email;
        user = await this.staff.save(user);
      }
    } else {
      // First sight of this subject (self-issued signature already verified).
      // Only the session-login path (which carries name+email) creates rows;
      // the SSE ticket is minted for an existing user, so it never lands here.
      //
      // `local:` subjects are provisioned exclusively by POST /api/admin/staff,
      // so a missing row means the account was DELETED (or its email re-keyed)
      // while a token was still live. Auto-creating here would resurrect them
      // as a role-less ghost that re-claims the freed email — silently undoing
      // the delete. Reject instead; only external IdP subjects may self-provision.
      if (claims.sub.startsWith(LOCAL_SUBJECT_PREFIX)) return null;
      const name = claims.name ?? claims.sub;
      const email = claims.email ?? '';
      try {
        user = await this.staff.save(this.staff.create({ idpSubject: claims.sub, name, email }));
      } catch (err: unknown) {
        // Concurrent first contact: two requests both findOne → null, both
        // INSERT, one loses on the unique idp_subject. Re-fetch the winner's
        // row. Match the Postgres unique-violation code (23505) — locale- and
        // driver-proof, mirrors reporter-upsert.ts.
        if (!this.isUniqueViolation(err)) throw err;
        user = await this.staff.findOne({ where: { idpSubject: claims.sub } });
        if (!user) return null;
        if (user.status !== AccountStatus.ACTIVE) return null;
        if (claims.tv !== user.tokenVersion) return null;
      }
    }

    return { ...this.toAuthenticated(user), roles: await this.loadRoles(user.id) };
  }

  private isUniqueViolation(err: unknown): boolean {
    return (
      err instanceof QueryFailedError
      && (err as QueryFailedError & { driverError?: { code?: string } }).driverError?.code === '23505'
    );
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
