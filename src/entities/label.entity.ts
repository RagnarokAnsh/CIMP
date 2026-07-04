import {
  Column, CreateDateColumn, Entity, JoinColumn, ManyToOne,
  PrimaryGeneratedColumn, Unique,
} from 'typeorm';
import { Platform } from './platform.entity';

// A label belongs to one platform (tenant-scoped catalog); an issue can carry
// several via the issue_labels join. Name is unique within a platform.
@Entity('labels')
@Unique('UQ_labels_platform_name', ['platform', 'name'])
export class Label {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Platform, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'platform_id' })
  platform: Platform;

  @Column()
  name: string;

  @Column({ default: '#6b7280' })
  color: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
