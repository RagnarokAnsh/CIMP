// Strict parsing for the documented on/off environment switches.
//
// These used to be read as `process.env.X === 'false'`, which fails OPEN: every
// spelling other than the exact lowercase string — `False`, `FALSE`, `0`, `no`,
// `off`, or a typo in the variable name — left the switch ON while the operator
// believed they had turned it off. For a kill switch that is the worst possible
// failure mode, so anything unrecognised is rejected loudly instead.

const TRUE_VALUES = new Set(['true', '1', 'yes', 'on']);
const FALSE_VALUES = new Set(['false', '0', 'no', 'off']);

export class InvalidEnvFlagError extends Error {
  constructor(name: string, raw: string) {
    super(
      `${name} must be a boolean ("true"/"false", also accepts 1/0, yes/no, on/off). `
      + `Received ${JSON.stringify(raw)}. Leave it unset to accept the default.`,
    );
    this.name = 'InvalidEnvFlagError';
  }
}

// Parses one flag. `fallback` applies only when the variable is unset or empty —
// never when it is set to something unrecognised, which throws.
export function parseEnvFlag(
  name: string,
  raw: string | undefined,
  fallback: boolean,
): boolean {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = raw.trim().toLowerCase();
  if (TRUE_VALUES.has(value)) return true;
  if (FALSE_VALUES.has(value)) return false;
  throw new InvalidEnvFlagError(name, raw);
}

// Convenience reader over process.env for the scheduled-job switches.
export function envFlag(name: string, fallback: boolean): boolean {
  return parseEnvFlag(name, process.env[name], fallback);
}

// The boolean switches validated at boot (see config/env.validation.ts) so a
// malformed value aborts startup rather than surfacing as a job that quietly
// keeps running. Defaults are all "on".
export const BOOLEAN_ENV_FLAGS: readonly string[] = [
  'SLA_SWEEP_ENABLED',
  'DIGEST_ENABLED',
  'SCAN_RETRY_ENABLED',
];
