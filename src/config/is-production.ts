// Fail-CLOSED environment check. Only an explicit 'development' or 'test'
// NODE_ENV relaxes the production hardening; anything else — including an unset
// or misspelled value like 'prod' or 'Production' — is treated as production.
//
// This prevents a single missing/typo'd env var from silently disabling the
// fail-closed config guards (DB_SYNCHRONIZE, CORS, JWT_SECRET) and exposing
// Swagger. Both env.validation.ts and main.ts must use this single source of
// truth so they can never disagree.
export function isProductionEnv(
  nodeEnv: string | undefined = process.env.NODE_ENV,
): boolean {
  const v = (nodeEnv ?? '').toLowerCase();
  return v !== 'development' && v !== 'test';
}
