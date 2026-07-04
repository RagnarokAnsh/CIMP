import {
  Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn,
} from 'typeorm';
import { Platform } from './platform.entity';

// A scoped, hashed API token granting READ access to one platform's issues (a
// programmatic surface separate from staff JWT auth). Only the SHA-256 hash is
// stored; the plaintext is shown once at creation.
@Entity('api_tokens')
export class ApiToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_api_tokens_platform')
  @ManyToOne(() => Platform, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'platform_id' })
  platform: Platform;

  @Column()
  name: string;

  @Index('idx_api_tokens_hash', { unique: true })
  @Column({ name: 'token_hash' })
  tokenHash: string;

  // Last 4 chars of the plaintext, for identifying a token in the UI.
  @Column({ name: 'last_four' })
  lastFour: string;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @Column({ name: 'last_used_at', type: 'timestamptz', nullable: true })
  lastUsedAt: Date | null;

  @Column({ name: 'revoked_at', type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
