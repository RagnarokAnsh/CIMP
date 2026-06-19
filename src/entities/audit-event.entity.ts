import {
  Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn,
} from 'typeorm';
import { ActorType } from '../common/enums';
import { Issue } from './issue.entity';

// Immutable record of significant actions (status changes, assignments, edits).
@Entity('audit_events')
export class AuditEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Issue, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'issue_id' })
  issue: Issue | null;

  @Column({ name: 'actor_type', type: 'enum', enum: ActorType })
  actorType: ActorType;

  // StaffUser id, reporter id, or null for SYSTEM.
  @Column({ name: 'actor_id', type: 'varchar', nullable: true })
  actorId: string | null;

  @Column()
  action: string;

  @Column({ type: 'varchar', nullable: true })
  field: string | null;

  @Column({ name: 'old_value', type: 'varchar', nullable: true })
  oldValue: string | null;

  @Column({ name: 'new_value', type: 'varchar', nullable: true })
  newValue: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
