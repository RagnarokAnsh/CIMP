import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Brackets, Repository } from 'typeorm';
import { AccountStatus, PlatformStatus, Role } from '../common/enums';
import { OPEN_ISSUE_STATUSES } from '../common/constants';
import { Platform, StaffUser, UserPlatformRole } from '../entities';
import { MailService } from './mail.service';

// SQL literal list built from the shared constant (enum values, injection-safe)
// so the digest can never drift from the canonical open-status definition.
const OPEN_SQL = OPEN_ISSUE_STATUSES.map((s) => `'${s}'`).join(',');

// Monday-morning digest per platform: last week's intake/resolution numbers,
// current open + breached counts, and CSAT — mailed to the platform's focal
// points and watcher-role staff (incl. global watchers). Skips platforms with
// nothing to report. Disable with DIGEST_ENABLED=false.
@Injectable()
export class DigestService {
  private readonly logger = new Logger(DigestService.name);

  constructor(
    @InjectRepository(Platform) private readonly platforms: Repository<Platform>,
    @InjectRepository(UserPlatformRole) private readonly roles: Repository<UserPlatformRole>,
    private readonly mail: MailService,
  ) {}

  @Cron('0 8 * * 1')
  async sendWeeklyDigests(): Promise<number> {
    if (process.env.DIGEST_ENABLED === 'false') return 0;
    let sent = 0;
    try {
      const platforms = await this.platforms.find({ where: { status: PlatformStatus.ACTIVE } });
      for (const platform of platforms) {
        try {
          sent += await this.digestForPlatform(platform);
        } catch (err) {
          this.logger.error(`digest for ${platform.key} failed: ${(err as Error).message}`);
        }
      }
    } catch (err) {
      this.logger.error(`weekly digest sweep failed: ${(err as Error).message}`);
    }
    return sent;
  }

  private async digestForPlatform(platform: Platform): Promise<number> {
    const [stats] = await this.platforms.manager.query(
      `SELECT
         COUNT(*) FILTER (WHERE created_at >= now() - interval '7 days') AS created,
         COUNT(*) FILTER (WHERE resolved_at >= now() - interval '7 days') AS resolved,
         COUNT(*) FILTER (WHERE status IN (${OPEN_SQL})) AS open,
         COUNT(*) FILTER (WHERE status IN (${OPEN_SQL}) AND sla_breached_at IS NOT NULL) AS breached
       FROM issues WHERE platform_id = $1`,
      [platform.id],
    ) as [{ created: string; resolved: string; open: string; breached: string }];
    const created = Number(stats?.created ?? 0);
    const resolved = Number(stats?.resolved ?? 0);
    const open = Number(stats?.open ?? 0);
    const breached = Number(stats?.breached ?? 0);
    if (created === 0 && resolved === 0 && open === 0) return 0; // nothing to say

    const [csat] = await this.platforms.manager.query(
      `SELECT COUNT(*) AS count, COALESCE(AVG(c.score), -1) AS rate
       FROM csat_responses c JOIN issues i ON i.id = c.issue_id
       WHERE i.platform_id = $1 AND c.created_at >= now() - interval '7 days'`,
      [platform.id],
    ) as [{ count: string; rate: string }];
    const csatCount = Number(csat?.count ?? 0);
    const csatLine = csatCount > 0
      ? `CSAT: ${Math.round(Number(csat.rate) * 100)}% positive (${csatCount} rating${csatCount === 1 ? '' : 's'})`
      : 'CSAT: no ratings this week';

    // Focal points scoped to the platform + watcher-role staff (scoped or global).
    const grants = await this.roles
      .createQueryBuilder('upr')
      .innerJoinAndSelect('upr.staffUser', 'su')
      .leftJoin('upr.platform', 'p')
      .where('su.status = :active', { active: AccountStatus.ACTIVE })
      .andWhere(
        new Brackets((w) => {
          w.where('upr.role = :fp AND p.id = :pid', { fp: Role.FOCAL_POINT, pid: platform.id })
            .orWhere('upr.role = :watcher AND (p.id = :pid OR upr.platform_id IS NULL)', {
              watcher: Role.WATCHER, pid: platform.id,
            });
        }),
      )
      .getMany();
    const recipients = new Map<string, StaffUser>();
    for (const g of grants) {
      if (g.staffUser?.email) recipients.set(g.staffUser.id, g.staffUser);
    }
    if (recipients.size === 0) return 0;

    const url = `${this.mail.appUrl()}/staff/dashboard`;
    const text =
      `Weekly support digest for ${platform.name}:\n\n`
      + `  New issues:      ${created}\n`
      + `  Resolved:        ${resolved}\n`
      + `  Open now:        ${open}${breached > 0 ? `  (${breached} past SLA!)` : ''}\n`
      + `  ${csatLine}\n\n`
      + `Dashboard: ${url}`;

    for (const r of recipients.values()) {
      await this.mail.send({
        to: r.email,
        subject: `[${platform.key}] Weekly support digest — ${created} new, ${resolved} resolved${breached > 0 ? `, ${breached} past SLA` : ''}`,
        text,
      });
    }
    return recipients.size;
  }
}
