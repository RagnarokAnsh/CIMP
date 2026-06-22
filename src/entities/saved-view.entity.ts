import {
  Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn,
  Unique, UpdateDateColumn,
} from 'typeorm';
import { StaffUser } from './staff-user.entity';

// A staff member's saved issue-list filter set. Persisted server-side so views
// follow the user across devices (previously localStorage-only).
@Entity('saved_views')
@Unique(['staffUser', 'name'])
export class SavedView {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => StaffUser, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'staff_user_id' })
  staffUser: StaffUser;

  @Column()
  name: string;

  // Opaque filter payload owned by the frontend (status, priority, q, etc.).
  @Column({ type: 'jsonb' })
  filters: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
