import {
  BadRequestException, ConflictException, Injectable, NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { Issue, IssueLink } from '../entities';
import { AuthenticatedStaff } from '../auth/auth.types';
import { CreateIssueLinkDto } from './dto/create-issue-link.dto';

@Injectable()
export class IssueLinksService {
  constructor(
    @InjectRepository(IssueLink) private readonly links: Repository<IssueLink>,
    @InjectRepository(Issue) private readonly issues: Repository<Issue>,
  ) {}

  // Access to `issueId` (the source) is already enforced by PlatformAccessGuard.
  async create(staff: AuthenticatedStaff, issueId: string, dto: CreateIssueLinkDto) {
    if (issueId === dto.targetIssueId) {
      throw new BadRequestException('An issue cannot be linked to itself.');
    }
    const source = await this.issues.findOne({ where: { id: issueId }, relations: { platform: true } });
    const target = await this.issues.findOne({ where: { id: dto.targetIssueId }, relations: { platform: true } });
    if (!source || !target) throw new NotFoundException('Issue not found.');
    // Constrain links to a single platform so they never cross tenant boundaries
    // (and so the source-access check the guard did also covers the target).
    if (source.platform.id !== target.platform.id) {
      throw new BadRequestException('Issues can only be linked within the same platform.');
    }
    try {
      const saved = await this.links.save(
        this.links.create({
          sourceIssue: { id: source.id } as Issue,
          targetIssue: { id: target.id } as Issue,
          type: dto.type,
          createdBy: staff.id,
        }),
      );
      return this.toView(issueId, await this.reload(saved.id));
    } catch (e) {
      if (e instanceof QueryFailedError && (e as QueryFailedError & { driverError?: { code?: string } }).driverError?.code === '23505') {
        throw new ConflictException('That link already exists.');
      }
      throw e;
    }
  }

  async listForIssue(issueId: string) {
    const rows = await this.links.find({
      where: [{ sourceIssue: { id: issueId } }, { targetIssue: { id: issueId } }],
      relations: { sourceIssue: true, targetIssue: true },
      order: { createdAt: 'ASC' },
    });
    return rows.map((l) => this.toView(issueId, l));
  }

  async remove(issueId: string, linkId: string) {
    const link = await this.links.findOne({
      where: { id: linkId },
      relations: { sourceIssue: true, targetIssue: true },
    });
    if (!link || (link.sourceIssue.id !== issueId && link.targetIssue.id !== issueId)) {
      throw new NotFoundException('Link not found.');
    }
    await this.links.remove(link);
    return { ok: true };
  }

  private reload(id: string): Promise<IssueLink> {
    return this.links.findOneOrFail({
      where: { id },
      relations: { sourceIssue: true, targetIssue: true },
    });
  }

  // Present a link relative to the viewing issue: `outward` when it is the
  // source, `inward` otherwise, always naming the OTHER issue.
  private toView(issueId: string, l: IssueLink) {
    const outward = l.sourceIssue.id === issueId;
    const other = outward ? l.targetIssue : l.sourceIssue;
    return {
      id: l.id,
      type: l.type,
      direction: outward ? 'outward' : 'inward',
      issue: { id: other.id, referenceNo: other.referenceNo, status: other.status },
      createdAt: l.createdAt,
    };
  }
}
