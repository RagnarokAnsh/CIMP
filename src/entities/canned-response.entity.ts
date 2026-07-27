import {
  Column, CreateDateColumn, Entity, JoinColumn, ManyToOne,
  PrimaryGeneratedColumn, Unique, UpdateDateColumn,
} from 'typeorm';
import { Platform } from './platform.entity';

// A reply template ("macro") in one platform's support catalog. Staff insert its
// body into the comment composer; simple {{placeholders}} (reporter, reference,
// assignee, platform) are substituted client-side at insert time. Title is
// unique within a platform. Tenant-scoped exactly like Label.
@Entity('canned_responses')
@Unique('UQ_canned_responses_platform_title', ['platform', 'title'])
export class CannedResponse {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Platform, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'platform_id' })
  platform: Platform;

  @Column()
  title: string;

  @Column({ type: 'text' })
  body: string;

  // Author's staff id — a plain column, not an FK, so deleting a staff member
  // never cascade-removes the team's shared templates (matches IssueLink.createdBy).
  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
