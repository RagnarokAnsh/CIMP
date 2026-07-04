import {
  Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn, Unique,
} from 'typeorm';
import { Issue } from './issue.entity';
import { Label } from './label.entity';

// Join between an issue and a label. Both cascade-delete, and (issue,label) is
// unique so a label can't be attached twice.
@Entity('issue_labels')
@Unique('UQ_issue_labels', ['issue', 'label'])
export class IssueLabel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_issue_labels_issue')
  @ManyToOne(() => Issue, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'issue_id' })
  issue: Issue;

  @ManyToOne(() => Label, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'label_id' })
  label: Label;
}
