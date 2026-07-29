import {
  Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, OneToOne,
  PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { Issue } from './issue.entity';
import { Reporter } from './reporter.entity';

// The reporter's one-click rating of a resolution (1 = positive, 0 = negative),
// collected in-portal once an issue is RESOLVED/CLOSED. One row per issue;
// re-rating overwrites (latest wins).
@Entity('csat_responses')
export class CsatResponse {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_csat_responses_issue', { unique: true })
  @OneToOne(() => Issue, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'issue_id' })
  issue: Issue;

  @ManyToOne(() => Reporter, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reporter_id' })
  reporter: Reporter;

  @Column({ type: 'smallint' })
  score: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  comment: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
