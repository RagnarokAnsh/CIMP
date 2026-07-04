import {
  Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn,
} from 'typeorm';
import {
  AutomationAction, AutomationTrigger, IssueStatus,
} from '../common/enums';
import { Platform } from './platform.entity';

// A per-platform "when X then Y" rule. Applied by AutomationListener off the
// domain-event bus. Actions (priority/assign/label) never change status, so a
// rule can't re-trigger a create/status-change rule — no loops.
@Entity('automation_rules')
export class AutomationRule {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_automation_rules_platform')
  @ManyToOne(() => Platform, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'platform_id' })
  platform: Platform;

  @Column()
  name: string;

  @Column({ default: true })
  enabled: boolean;

  @Column({ type: 'enum', enum: AutomationTrigger })
  trigger: AutomationTrigger;

  // For STATUS_CHANGED: apply only when the new status equals this (null = any).
  @Column({ name: 'trigger_status', type: 'enum', enum: IssueStatus, nullable: true })
  triggerStatus: IssueStatus | null;

  @Column({ type: 'enum', enum: AutomationAction })
  action: AutomationAction;

  // Priority value | assignee staff id | label id, per `action`.
  @Column({ name: 'action_value' })
  actionValue: string;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
