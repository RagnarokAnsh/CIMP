import {
  Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn,
} from 'typeorm';
import { ActorType, CommentVisibility } from '../common/enums';
import { Issue } from './issue.entity';
import { StaffUser } from './staff-user.entity';

@Entity('comments')
export class Comment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Issue, (i) => i.comments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'issue_id' })
  issue: Issue;

  // Staff author (null for reporter-authored comments — see authorType).
  @ManyToOne(() => StaffUser, (u) => u.comments, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'author_id' })
  author: StaffUser | null;

  // Who wrote this — STAFF (default) or REPORTER. Lets reporters reply via the
  // portal without a StaffUser row.
  @Column({ name: 'author_type', type: 'enum', enum: ActorType, default: ActorType.STAFF })
  authorType: ActorType;

  // Snapshot of the reporter's display name (only set for REPORTER comments).
  @Column({ name: 'author_name', type: 'varchar', nullable: true })
  authorName: string | null;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'enum', enum: CommentVisibility, default: CommentVisibility.INTERNAL })
  visibility: CommentVisibility;

  // Language `body` was written in (base code, e.g. 'es'), when known. Declared
  // by the reporter's portal or detected by the translation provider.
  @Column({ name: 'source_locale', type: 'varchar', length: 8, nullable: true })
  sourceLocale: string | null;

  // Cached machine translations keyed by base locale: { es: '…', fr: '…' }.
  // A cache, never the source of truth — `body` is always the original, and an
  // empty/missing entry simply means "show the original".
  @Column({ type: 'jsonb', nullable: true })
  translations: Record<string, string> | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @Column({ name: 'edited_at', type: 'timestamptz', nullable: true })
  editedAt: Date | null;
}
