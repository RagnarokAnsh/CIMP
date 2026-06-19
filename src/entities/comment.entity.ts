import {
  Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn,
} from 'typeorm';
import { CommentVisibility } from '../common/enums';
import { Issue } from './issue.entity';
import { StaffUser } from './staff-user.entity';

@Entity('comments')
export class Comment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Issue, (i) => i.comments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'issue_id' })
  issue: Issue;

  @ManyToOne(() => StaffUser, (u) => u.comments, { onDelete: 'SET NULL' })
  @JoinColumn({ name: 'author_id' })
  author: StaffUser;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'enum', enum: CommentVisibility, default: CommentVisibility.INTERNAL })
  visibility: CommentVisibility;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'edited_at', type: 'timestamptz', nullable: true })
  editedAt: Date | null;
}
