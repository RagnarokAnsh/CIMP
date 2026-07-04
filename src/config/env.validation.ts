import { plainToInstance } from 'class-transformer';
import {
  IsBooleanString, IsIn, IsInt, IsOptional, IsString, Max, Min, validateSync,
} from 'class-validator';
import { isProductionEnv } from './is-production';

// Environment schema. We validate the *raw* process env at boot so a typo or a
// missing required var fails fast with a clear message instead of silently
// defaulting deep inside the app. Most fields are optional (configuration.ts
// supplies dev defaults); the production-safety checks below are what actually
// matter and are enforced separately in `validate()`.

// Minimum length for the HS256 staff-token signing key (256 bits as hex).
const MIN_JWT_SECRET_LENGTH = 32;

class EnvVars {
  // Only 'development'/'test' relax the fail-closed guards; anything else
  // (including unset or a typo) is treated as production (see isProductionEnv).
  // A *present but invalid* value fails boot here rather than silently
  // downgrading protections.
  @IsOptional()
  @IsIn(['development', 'test', 'production'], {
    message: "NODE_ENV must be one of 'development', 'test', or 'production'.",
  })
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
  @IsString()
  JWT_SECRET?: string;

  @IsOptional()
  @IsString()
  SCAN_DRIVER?: string;

  // Conscious opt-out to serve unscanned uploads in production when no real
  // malware scanner is configured. Defaults to off (fail closed).
  @IsOptional()
  @IsBooleanString()
  ALLOW_UNSCANNED_UPLOADS?: string;
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

  // Fail CLOSED: unset or unrecognized NODE_ENV counts as production, so a
  // missing env var can never silently disable the hardening below.
  const isProd = isProductionEnv(
    parsed.NODE_ENV ?? (process.env.NODE_ENV as string | undefined),
  );

  const problems: string[] = [];

  // DB_SYNCHRONIZE defaults to true in configuration.ts; auto-syncing the schema
  // against entities in production can silently alter/drop columns.
  if (parsed.DB_SYNCHRONIZE === undefined || isTrue(parsed.DB_SYNCHRONIZE)) {
    problems.push('DB_SYNCHRONIZE must be explicitly "false" in production (use migrations).');
  }

  // A wildcard CORS origin with credentials lets any site call the API.
  if (!parsed.CORS_ORIGINS || parsed.CORS_ORIGINS.trim() === '*') {
    problems.push('CORS_ORIGINS must be set to explicit origin(s) in production (no "*").');
  }

  // Staff auth is a self-issued HS256 JWT — a weak signing key is offline
  // brute-forceable and lets an attacker forge admin tokens.
  if (!parsed.JWT_SECRET) {
    problems.push('JWT_SECRET must be set (staff auth signs/verifies with it).');
  } else if (parsed.JWT_SECRET.length < MIN_JWT_SECRET_LENGTH) {
    problems.push(
      `JWT_SECRET must be at least ${MIN_JWT_SECRET_LENGTH} characters of high-entropy `
      + 'randomness (generate with `openssl rand -hex 32`).',
    );
  }

  // Uploaded files are served to staff and reporters. Without a real scanner the
  // no-op driver marks everything SKIPPED (= servable), so require clamav in
  // production unless the operator consciously opts out.
  if (isProd && parsed.SCAN_DRIVER !== 'clamav' && !isTrue(parsed.ALLOW_UNSCANNED_UPLOADS)) {
    problems.push(
      'SCAN_DRIVER must be "clamav" in production (uploads are otherwise served '
      + 'unscanned). Set ALLOW_UNSCANNED_UPLOADS=true to consciously accept this risk.',
    );
  }

  if (problems.length) {
    const msg = `Production configuration check failed:\n - ${problems.join('\n - ')}`;
    if (isProd) {
      throw new Error(msg);
    }
    // eslint-disable-next-line no-console
    console.warn(
      `[config] ${msg}\n(These are fatal in production; set NODE_ENV=development for local dev.)`,
    );
  }

  return config;
}
