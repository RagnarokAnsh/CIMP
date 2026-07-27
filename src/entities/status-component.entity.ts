import {
  Column, CreateDateColumn, Entity, JoinColumn, ManyToOne,
  PrimaryGeneratedColumn, Unique, UpdateDateColumn,
} from 'typeorm';
import { ComponentStatus } from '../common/enums';
import { Platform } from './platform.entity';

// One named part of a platform on its public status page ("API", "Login").
// Tenant-scoped like Label; name unique within a platform.
@Entity('status_components')
@Unique('UQ_status_components_platform_name', ['platform', 'name'])
export class StatusComponent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Platform, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'platform_id' })
  platform: Platform;

  @Column()
  name: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'enum', enum: ComponentStatus, default: ComponentStatus.OPERATIONAL })
  status: ComponentStatus;

  // Display order on the public page; ties break by name.
  @Column({ type: 'int', default: 0 })
  position: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
