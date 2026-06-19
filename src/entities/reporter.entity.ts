import {
  Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, OneToMany,
  PrimaryGeneratedColumn, Unique, UpdateDateColumn,
} from 'typeorm';
import { Platform } from './platform.entity';
import { Issue } from './issue.entity';
import { ReporterIssueView } from './reporter-issue-view.entity';

// A reporter is NOT an account. It is a lightweight identity, created
// automatically on first submission, keyed by (platform, portalUserId).
// It exists only to group a person's issues for the tracking view.
@Entity('reporters')
@Unique(['platform', 'portalUserId'])
export class Reporter {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Platform, (p) => p.reporters, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'platform_id' })
  platform: Platform;

  @Column({ name: 'portal_user_id' })
  portalUserId: string;

  @Column()
  name: string;

  @Column()
  email: string;

  @CreateDateColumn({ name: 'first_seen_at', type: 'timestamptz' })
  firstSeenAt: Date;

  @UpdateDateColumn({ name: 'last_seen_at', type: 'timestamptz' })
  lastSeenAt: Date;

  @OneToMany(() => Issue, (i) => i.reporter)
  issues: Issue[];

  @OneToMany(() => ReporterIssueView, (v) => v.reporter)
  views: ReporterIssueView[];
}
