import { Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as jwt from 'jsonwebtoken';
import { Platform } from '../entities';
import { PlatformStatus } from '../common/enums';
import { HandoffClaims, HandoffContext } from './handoff.types';

@Injectable()
export class HandoffService {
  constructor(
    @InjectRepository(Platform)
    private readonly platforms: Repository<Platform>,
  ) {}

  // Verifies a hand-off token. The identity is trusted ONLY because the
  // signature proves it came from the portal's backend — never from the
  // browser. Steps: read the (unverified) platformKey, load that portal's
  // secret, then verify signature + expiry against it.
  async verify(token: string): Promise<HandoffContext> {
    if (!token) throw new UnauthorizedException('Missing hand-off token');

    const decoded = jwt.decode(token) as HandoffClaims | null;
    if (!decoded?.platformKey) {
      throw new UnauthorizedException('Token missing platformKey claim');
    }

    const platform = await this.platforms.findOne({ where: { key: decoded.platformKey } });
    if (!platform || platform.status !== PlatformStatus.ACTIVE) {
      throw new UnauthorizedException('Unknown or inactive platform');
    }

    let claims: HandoffClaims;
    try {
      // HS256 with the per-portal secret. To support RS256 (OD-06), verify
      // with the portal's public key here instead.
      claims = jwt.verify(token, platform.handoffSecret, {
        algorithms: ['HS256'],
      }) as HandoffClaims;
    } catch {
      throw new UnauthorizedException('Invalid or expired hand-off token');
    }

    if (!claims.portalUserId || !claims.email || !claims.name) {
      throw new UnauthorizedException('Token missing required reporter claims');
    }

    return {
      platformId: platform.id,
      platformKey: platform.key,
      reporter: {
        portalUserId: claims.portalUserId,
        name: claims.name,
        email: claims.email,
      },
    };
  }
}
