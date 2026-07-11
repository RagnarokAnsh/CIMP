import {
  CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique,
} from 'typeorm';
import { Issue } from './issue.entity';
import { Reporter } from './reporter.entity';

// "Notify me instead": a reporter chose to follow an existing issue rather
// than file a duplicate. One-shot — emailed and deleted when the issue
// resolves (the deliberate exception to OD-02: a subscriber has no issue of
// their own, so there is no in-app surface to notify them on).
@Entity('reporter_subscriptions')
@Unique('UQ_reporter_subscriptions', ['issue', 'reporter'])
export class ReporterSubscription {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_reporter_subscriptions_issue')
  @ManyToOne(() => Issue, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'issue_id' })
  issue: Issue;

  @ManyToOne(() => Reporter, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reporter_id' })
  reporter: Reporter;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
