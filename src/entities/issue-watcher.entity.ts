import {
  CreateDateColumn, Entity, Index, JoinColumn, ManyToOne,
  PrimaryGeneratedColumn, Unique,
} from 'typeorm';
import { Issue } from './issue.entity';
import { StaffUser } from './staff-user.entity';

// A staff member watching an issue — they receive its status-change notifications
// even if they aren't the assignee or a focal point. Both sides cascade-delete.
@Entity('issue_watchers')
@Unique('UQ_issue_watchers', ['issue', 'staffUser'])
export class IssueWatcher {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_issue_watchers_issue')
  @ManyToOne(() => Issue, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'issue_id' })
  issue: Issue;

  @ManyToOne(() => StaffUser, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'staff_user_id' })
  staffUser: StaffUser;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
