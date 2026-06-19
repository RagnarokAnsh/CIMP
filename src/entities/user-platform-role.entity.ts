import {
  Column, CreateDateColumn, Entity, JoinColumn, ManyToOne,
  PrimaryGeneratedColumn, Unique,
} from 'typeorm';
import { Role } from '../common/enums';
import { StaffUser } from './staff-user.entity';
import { Platform } from './platform.entity';

// A staff member's role grant. platform = null means GLOBAL scope.
// Focal points are always per-platform; developers may be per-platform OR
// global (OD-03); admins are global.
@Entity('user_platform_roles')
@Unique(['staffUser', 'role', 'platform'])
export class UserPlatformRole {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => StaffUser, (u) => u.roleAssignments, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'staff_user_id' })
  staffUser: StaffUser;

  // Nullable: null = global scope (all platforms).
  @ManyToOne(() => Platform, (p) => p.roleAssignments, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'platform_id' })
  platform: Platform | null;

  @Column({ type: 'enum', enum: Role })
  role: Role;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
