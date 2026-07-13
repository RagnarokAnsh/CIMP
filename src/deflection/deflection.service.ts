import {
  BadRequestException, Injectable, NotFoundException, UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as jwt from 'jsonwebtoken';
import { ActorType, IssueStatus, PlatformStatus } from '../common/enums';
import { OPEN_ISSUE_STATUSES } from '../common/constants';
import { Issue, Platform, Reporter, ReporterSubscription } from '../entities';
import { HandoffContext } from '../handoff/handoff.types';
import { AuthenticatedStaff } from '../auth/auth.types';
import { AuditService } from '../audit/audit.service';
import { buildPrefixTsQuery } from '../issues/search-terms';
import { upsertReporter } from '../reporter/reporter-upsert';
import { PublishIssueDto } from './dto/publish-issue.dto';

const OPEN_STATUSES = OPEN_ISSUE_STATUSES;

// Deflection: steer reporters to already-tracked problems before they file a
// duplicate, and let connected apps show staff-published known issues.
//
// Privacy invariants:
//  - similar-search never returns another issue's id, reference, description
//    or reporter — only status/age/report-count plus an OPAQUE subscribe token
//    (short-lived JWT carrying the issue id server-side).
//  - the public known-issues feed returns ONLY staff-curated public titles of
//    explicitly published issues.
@Injectable()
export class DeflectionService {
  constructor(
    @InjectRepository(Issue) private readonly issues: Repository<Issue>,
    @InjectRepository(Reporter) private readonly reporters: Repository<Reporter>,
    @InjectRepository(ReporterSubscription) private readonly subscriptions: Repository<ReporterSubscription>,
    @InjectRepository(Platform) private readonly platforms: Repository<Platform>,
    private readonly config: ConfigService,
    private readonly audit: AuditService,
  ) {}

  private secret(): string {
    return this.config.get<string>('auth.jwtSecret') ?? '';
  }

  async findSimilar(ctx: HandoffContext, q: string) {
    const tsq = buildPrefixTsQuery(q);
    if (!tsq) return [];
    // Dev fallback terms: the longest words of the query, individually ILIKEd
    // (any-match). Production matches via the FTS vector instead.
    const terms = q
      .toLowerCase()
      .split(/\s+/)
      .map((t) => t.replace(/[^a-z0-9]/g, ''))
      .filter((t) => t.length >= 4)
      .sort((a, b) => b.length - a.length)
      .slice(0, 5);
    const likeParams = Object.fromEntries(terms.map((t, i) => [`like${i}`, `%${t}%`]));
    const likeClause = terms.length
      ? terms.map((_, i) => `issue.description ILIKE :like${i}`).join(' OR ')
      : 'false';

    const rows = await this.issues
      .createQueryBuilder('issue')
      .where('issue.platform_id = :pid', { pid: ctx.platformId })
      .andWhere('issue.status IN (:...open)', { open: OPEN_STATUSES })
      .andWhere('issue.duplicate_of_id IS NULL')
      .andWhere(
        // FTS in production; dev synchronize has no search_vector triggers, so
        // fall back to per-term ILIKE there (worse ranking, same privacy shape).
        `(issue.search_vector @@ to_tsquery('english', :tsq)
          OR (issue.search_vector IS NULL AND (${likeClause})))`,
        { tsq, ...likeParams },
      )
      .addSelect(
        `COALESCE(ts_rank(issue.search_vector, to_tsquery('english', :tsq)), 0)`,
        'rank',
      )
      .orderBy('rank', 'DESC')
      .addOrderBy('issue.created_at', 'DESC')
      .take(3)
      .getMany();
    if (rows.length === 0) return [];

    const counts = await this.issues
      .createQueryBuilder('dup')
      .select('dup.duplicate_of_id', 'canonicalId')
      .addSelect('COUNT(*)', 'count')
      .where('dup.duplicate_of_id IN (:...ids)', { ids: rows.map((r) => r.id) })
      .groupBy('dup.duplicate_of_id')
      .getRawMany<{ canonicalId: string; count: string }>();
    const dupCount = new Map(counts.map((c) => [c.canonicalId, Number(c.count)]));

    return rows.map((issue) => ({
      status: issue.status,
      firstReportedAt: issue.createdAt,
      reportCount: 1 + (dupCount.get(issue.id) ?? 0),
      subscribeToken: jwt.sign(
        { purpose: 'subscribe', issueId: issue.id, platformId: ctx.platformId },
        this.secret(),
        { algorithm: 'HS256', expiresIn: '30m' },
      ),
    }));
  }

  async subscribe(ctx: HandoffContext, token: string) {
    let claims: { purpose?: string; issueId?: string; platformId?: string };
    try {
      claims = jwt.verify(token, this.secret(), { algorithms: ['HS256'] }) as typeof claims;
    } catch {
      throw new UnauthorizedException('Invalid or expired subscribe token.');
    }
    if (claims.purpose !== 'subscribe' || !claims.issueId) {
      throw new UnauthorizedException('Invalid subscribe token.');
    }
    // Tenant check: the token must have been minted for THIS reporter's platform.
    if (claims.platformId !== ctx.platformId) throw new NotFoundException('Issue not found');

    const issue = await this.issues.findOne({
      where: { id: claims.issueId, platform: { id: ctx.platformId } },
    });
    if (!issue) throw new NotFoundException('Issue not found');

    const reporter = await this.upsertReporter(ctx);
    await this.subscriptions
      .createQueryBuilder()
      .insert()
      .values({ issue: { id: issue.id } as any, reporter: { id: reporter.id } as any })
      .orIgnore()
      .execute();
    return { subscribed: true };
  }

  // Guard note: PlatformAccessGuard + write roles ran on the route; this only
  // validates payload shape and records the change.
  async publish(staff: AuthenticatedStaff, issueId: string, dto: PublishIssueDto) {
    const issue = await this.issues.findOne({ where: { id: issueId } });
    if (!issue) throw new NotFoundException('Issue not found');

    const title = dto.publicTitle?.trim();
    if (dto.publiclyVisible && !title && !issue.publicTitle) {
      throw new BadRequestException('A public title is required to publish a known issue.');
    }

    issue.publiclyVisible = dto.publiclyVisible;
    if (title !== undefined && title !== '') issue.publicTitle = title;
    await this.issues.save(issue);

    await this.audit.record({
      issueId,
      actorType: ActorType.STAFF,
      actorId: staff.id,
      action: 'PUBLISH_CHANGED',
      field: 'publiclyVisible',
      newValue: String(dto.publiclyVisible),
    });
    return { publiclyVisible: issue.publiclyVisible, publicTitle: issue.publicTitle };
  }

  async publicKnownIssues(platformKey: string) {
    const platform = await this.platforms.findOne({ where: { key: platformKey } });
    if (!platform || platform.status !== PlatformStatus.ACTIVE) {
      throw new NotFoundException('Unknown platform');
    }
    const rows = await this.issues.find({
      where: { platform: { id: platform.id }, publiclyVisible: true },
      order: { updatedAt: 'DESC' },
      take: 10,
    });
    return rows.map((i) => ({
      title: i.publicTitle ?? 'Known issue',
      status: i.status,
      updatedAt: i.updatedAt,
    }));
  }

  private async upsertReporter(ctx: HandoffContext): Promise<Reporter> {
    const reporter = await upsertReporter(this.reporters, ctx);
    if (!reporter) throw new NotFoundException('Issue not found');
    return reporter;
  }
}
