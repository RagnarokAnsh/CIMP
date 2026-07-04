import {
  Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne,
  PrimaryGeneratedColumn, Unique,
} from 'typeorm';
import { IssueLinkType } from '../common/enums';
import { Issue } from './issue.entity';

// A directional relationship between two issues (source --type--> target), e.g.
// "A BLOCKS B". Listing an issue's links shows outward (issue is source) and
// inward (issue is target, presented as the inverse). Both sides cascade-delete
// with their issue. Links are constrained to a single platform (see the service)
// so they never cross tenant boundaries.
@Entity('issue_links')
@Unique('UQ_issue_links_pair_type', ['sourceIssue', 'targetIssue', 'type'])
export class IssueLink {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_issue_links_source')
  @ManyToOne(() => Issue, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'source_issue_id' })
  sourceIssue: Issue;

  @Index('idx_issue_links_target')
  @ManyToOne(() => Issue, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'target_issue_id' })
  targetIssue: Issue;

  @Column({ type: 'enum', enum: IssueLinkType })
  type: IssueLinkType;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
