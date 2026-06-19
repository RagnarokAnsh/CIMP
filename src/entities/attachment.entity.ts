import {
  Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn,
} from 'typeorm';
import { ScanStatus } from '../common/enums';
import { Issue } from './issue.entity';

@Entity('attachments')
export class Attachment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Issue, (i) => i.attachments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'issue_id' })
  issue: Issue;

  // Reference into object storage (local disk in dev, S3/MinIO in prod).
  @Column({ name: 'storage_key' })
  storageKey: string;

  @Column()
  filename: string;

  @Column({ name: 'content_type' })
  contentType: string;

  @Column({ name: 'size_bytes', type: 'int' })
  sizeBytes: number;

  @Column({ name: 'scan_status', type: 'enum', enum: ScanStatus, default: ScanStatus.PENDING })
  scanStatus: ScanStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
