import { QueryFailedError } from 'typeorm';

// Postgres unique-violation (23505). Centralised so the error-shape detection
// lives in one place (the 22P02 sibling is handled in AllExceptionsFilter). New
// code should import this rather than re-deriving the driverError cast.
export function isUniqueViolation(e: unknown): boolean {
  return (
    e instanceof QueryFailedError
    && (e as QueryFailedError & { driverError?: { code?: string } }).driverError?.code === '23505'
  );
}
