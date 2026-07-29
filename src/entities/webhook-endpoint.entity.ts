import {
  Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn,
} from 'typeorm';
import { Platform } from './platform.entity';

// An outbound webhook target: CIMP POSTs signed JSON to `url` when issue
// events happen. `platform` scopes it to one platform's events (null = all).
// The HMAC `secret` is generated server-side and returned exactly once on
// create — receivers verify `X-CIMP-Signature: sha256=<hex>` over the raw body.
@Entity('webhook_endpoints')
export class WebhookEndpoint {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_webhook_endpoints_platform')
  @ManyToOne(() => Platform, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'platform_id' })
  platform: Platform | null;

  @Column()
  url: string;

  @Column()
  secret: string;

  // Subset of IssueEvents values this endpoint wants; empty = all events.
  @Column({ type: 'jsonb', default: () => "'[]'" })
  events: string[];

  @Column({ default: true })
  enabled: boolean;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
