import {
  Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToMany,
  PrimaryGeneratedColumn, UpdateDateColumn, VersionColumn,
} from 'typeorm';
import { IssueStatus, JiraSyncStatus, Priority } from '../common/enums';
import { Platform } from './platform.entity';
import { Reporter } from './reporter.entity';
import { StaffUser } from './staff-user.entity';
import { Attachment } from './attachment.entity';
import { Comment } from './comment.entity';
import { ReporterIssueView } from './reporter-issue-view.entity';

@Entity('issues')
export class Issue {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ name: 'reference_no' })
  referenceNo: string;

  @ManyToOne(() => Platform, (p) => p.issues, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'platform_id' })
  platform: Platform;

  @ManyToOne(() => Reporter, (r) => r.issues, { onDelete: 'RESTRICT' })
  @JoinColumn({ name: 'reporter_id' })
  reporter: Reporter;

  @ManyToOne(() => StaffUser, (u) => u.assignedIssues, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assignee_id' })
  assignee: StaffUser | null;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'enum', enum: IssueStatus, default: IssueStatus.NEW })
  status: IssueStatus;

  @Column({ type: 'enum', enum: Priority, default: Priority.MEDIUM })
  priority: Priority;

  @Column({ name: 'jira_issue_key', type: 'varchar', nullable: true })
  jiraIssueKey: string | null;

  @Column({ name: 'jira_sync_status', type: 'enum', enum: JiraSyncStatus, default: JiraSyncStatus.NOT_SYNCED })
  jiraSyncStatus: JiraSyncStatus;

  // Optimistic locking: bumped on every save; a stale version triggers a
  // 409 Conflict instead of silently overwriting a concurrent change.
  @VersionColumn({ default: 1 })
  version: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  @Column({ name: 'closed_at', type: 'timestamptz', nullable: true })
  closedAt: Date | null;

  @OneToMany(() => Attachment, (a) => a.issue)
  attachments: Attachment[];

  @OneToMany(() => Comment, (c) => c.issue)
  comments: Comment[];

  @OneToMany(() => ReporterIssueView, (v) => v.issue)
  views: ReporterIssueView[];
}
