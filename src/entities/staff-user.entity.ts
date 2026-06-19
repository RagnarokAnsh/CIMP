import {
  Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn,
} from 'typeorm';
import { AccountStatus } from '../common/enums';
import { UserPlatformRole } from './user-platform-role.entity';
import { Issue } from './issue.entity';
import { Comment } from './comment.entity';

@Entity('staff_users')
export class StaffUser {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Subject claim from the identity provider (OIDC). Identity is mastered there.
  @Column({ name: 'idp_subject', unique: true })
  idpSubject: string;

  @Column()
  name: string;

  @Column({ unique: true })
  email: string;

  @Column({ type: 'enum', enum: AccountStatus, default: AccountStatus.ACTIVE })
  status: AccountStatus;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @OneToMany(() => UserPlatformRole, (r) => r.staffUser)
  roleAssignments: UserPlatformRole[];

  @OneToMany(() => Issue, (i) => i.assignee)
  assignedIssues: Issue[];

  @OneToMany(() => Comment, (c) => c.author)
  comments: Comment[];
}
