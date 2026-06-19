import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { passportJwtSecret } from 'jwks-rsa';
import { AuthService } from './auth.service';
import { AuthenticatedStaff, OidcClaims } from './auth.types';

// Validates IdP-issued JWT access tokens via JWKS (the IdP's public signing
// keys), then upserts the StaffUser. `UserPlatformRole` in our DB — not the
// token — is the source of truth for authorization scope.
@Injectable()
export class OidcStrategy extends PassportStrategy(Strategy, 'oidc') {
  constructor(config: ConfigService, private readonly auth: AuthService) {
    const jwksUri = config.get<string>('oidc.jwksUri');
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKeyProvider: passportJwtSecret({
        cache: true,
        rateLimit: true,
        jwksRequestsPerMinute: 10,
        jwksUri: jwksUri ?? 'http://localhost/.well-known/jwks.json',
      }),
      issuer: config.get<string>('oidc.issuer'),
      audience: config.get<string>('oidc.audience'),
      algorithms: ['RS256'],
    });
  }

  // Passport calls this with the verified claims; the return value becomes
  // `req.user`.
  async validate(claims: OidcClaims): Promise<AuthenticatedStaff> {
    if (!claims?.sub) throw new UnauthorizedException('Token missing subject');
    return this.auth.upsertFromClaims(claims);
  }
}
