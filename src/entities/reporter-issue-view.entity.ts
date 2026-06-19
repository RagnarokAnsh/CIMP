import {
  Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique,
} from 'typeorm';
import { Reporter } from './reporter.entity';
import { Issue } from './issue.entity';

// Tracks when a reporter last viewed an issue, powering the in-app
// "new updates" indicator (OD-02) — no email involved.
@Entity('reporter_issue_views')
@Unique(['reporter', 'issue'])
export class ReporterIssueView {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Reporter, (r) => r.views, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reporter_id' })
  reporter: Reporter;

  @ManyToOne(() => Issue, (i) => i.views, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'issue_id' })
  issue: Issue;

  @Column({ name: 'last_viewed_at', type: 'timestamptz' })
  lastViewedAt: Date;
}
