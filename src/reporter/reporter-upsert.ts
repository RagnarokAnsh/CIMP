import { QueryFailedError, Repository } from 'typeorm';
import { Reporter } from '../entities';
import { HandoffContext } from '../handoff/handoff.types';

// Auto-provision (or refresh) a reporter identity from a verified hand-off
// token. Shared by issue intake (reporter.service) and deflection
// subscriptions — a subscriber may have never filed an issue.
export async function upsertReporter(
  reporters: Repository<Reporter>,
  ctx: HandoffContext,
): Promise<Reporter | null> {
  const where = {
    platform: { id: ctx.platformId },
    portalUserId: ctx.reporter.portalUserId,
  };

  let reporter = await reporters.findOne({ where });
  if (!reporter) {
    reporter = reporters.create({
      platform: { id: ctx.platformId } as any,
      portalUserId: ctx.reporter.portalUserId,
      name: ctx.reporter.name,
      email: ctx.reporter.email,
    });
  } else {
    // The token is the identity source of truth — refresh name/email drift.
    reporter.name = ctx.reporter.name;
    reporter.email = ctx.reporter.email;
  }

  try {
    return await reporters.save(reporter);
  } catch (e) {
    // Concurrent first contact: another request inserted this reporter between
    // our findOne and save (unique on platform + portalUserId). Use theirs.
    const isUniqueViolation =
      e instanceof QueryFailedError
      && (e as QueryFailedError & { driverError?: { code?: string } }).driverError?.code === '23505';
    if (isUniqueViolation) return reporters.findOne({ where });
    throw e;
  }
}
