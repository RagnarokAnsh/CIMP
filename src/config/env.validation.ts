import { plainToInstance } from 'class-transformer';
import {
  IsBooleanString, IsInt, IsOptional, IsString, Max, Min, validateSync,
} from 'class-validator';

// Environment schema. We validate the *raw* process env at boot so a typo or a
// missing required var fails fast with a clear message instead of silently
// defaulting deep inside the app. Most fields are optional (configuration.ts
// supplies dev defaults); the production-safety checks below are what actually
// matter and are enforced separately in `validate()`.
class EnvVars {
  @IsOptional()
  @IsString()
  NODE_ENV?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT?: number;

  @IsOptional()
  @IsString()
  CORS_ORIGINS?: string;

  @IsOptional()
  @IsBooleanString()
  DB_SYNCHRONIZE?: string;

  @IsOptional()
  @IsBooleanString()
  DEV_AUTH?: string;

  @IsOptional()
  @IsString()
  OIDC_ISSUER?: string;

  @IsOptional()
  @IsString()
  OIDC_JWKS_URI?: string;

  @IsOptional()
  @IsString()
  OIDC_AUDIENCE?: string;

  @IsOptional()
  @IsString()
  JWT_SECRET?: string;

  @IsOptional()
  @IsString()
  SCAN_DRIVER?: string;
}

const isTrue = (v: string | undefined): boolean => (v ?? '').toLowerCase() === 'true';

// Wired into ConfigModule.forRoot({ validate }). Returns the (coerced) config on
// success; throws to abort boot on a fatal misconfiguration.
export function validate(config: Record<string, unknown>): Record<string, unknown> {
  const parsed = plainToInstance(EnvVars, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(parsed, {
    skipMissingProperties: true,
    whitelist: false,
  });
  if (errors.length > 0) {
    throw new Error(`Invalid environment configuration:\n${errors.toString()}`);
  }

  const isProd = (parsed.NODE_ENV ?? process.env.NODE_ENV) === 'production';

  // Fail-closed production guards. In dev these are warnings only, so the
  // current local workflow (DB_SYNCHRONIZE=true, DEV_AUTH=true, CORS '*') is
  // untouched.
  const problems: string[] = [];

  // DB_SYNCHRONIZE defaults to true in configuration.ts; auto-syncing the schema
  // against entities in production can silently alter/drop columns.
  if (parsed.DB_SYNCHRONIZE === undefined || isTrue(parsed.DB_SYNCHRONIZE)) {
    problems.push(
      'DB_SYNCHRONIZE must be explicitly "false" in production (use migrations).',
    );
  }

  // A wildcard CORS origin with credentials lets any site call the API.
  if (!parsed.CORS_ORIGINS || parsed.CORS_ORIGINS.trim() === '*') {
    problems.push('CORS_ORIGINS must be set to explicit origin(s) in production (no "*").');
  }

  // The dev staff login bypasses OIDC; it is already neutered at runtime, but we
  // reject the config too so it can never be flipped on in production.
  if (isTrue(parsed.DEV_AUTH)) {
    problems.push('DEV_AUTH must not be enabled in production.');
  }

  // Staff sign-in needs at least one method configured: self-issued JWT
  // (JWT_SECRET), OIDC, or — non-prod only — the dev shim. Without dev-auth and
  // without a JWT secret, a complete OIDC config is required.
  if (!isTrue(parsed.DEV_AUTH) && !parsed.JWT_SECRET) {
    const missing = (['OIDC_ISSUER', 'OIDC_JWKS_URI', 'OIDC_AUDIENCE'] as const).filter(
      (k) => !parsed[k],
    );
    if (missing.length) {
      problems.push(
        'No staff auth configured: set JWT_SECRET (self-issued JWT) or the OIDC_* vars.',
      );
    }
  }

  if (problems.length) {
    const msg = `Production configuration check failed:\n - ${problems.join('\n - ')}`;
    if (isProd) {
      throw new Error(msg);
    }
    // eslint-disable-next-line no-console
    console.warn(`[config] ${msg}\n(These are fatal when NODE_ENV=production.)`);
  }

  // Non-fatal advisory: shipping without real malware scanning in production is
  // risky but may be intentional, so warn rather than block the boot.
  if (isProd && parsed.SCAN_DRIVER !== 'clamav') {
    // eslint-disable-next-line no-console
    console.warn(
      '[config] SCAN_DRIVER is not "clamav" in production — uploaded files are NOT being malware-scanned.',
    );
  }

  return config;
}
