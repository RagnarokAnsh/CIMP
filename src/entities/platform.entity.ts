import {
  Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn,
} from 'typeorm';
import { PlatformStatus } from '../common/enums';
import { Reporter } from './reporter.entity';
import { Issue } from './issue.entity';
import { UserPlatformRole } from './user-platform-role.entity';

@Entity('platforms')
export class Platform {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  key: string;

  @Column()
  name: string;

  @Column({ type: 'enum', enum: PlatformStatus, default: PlatformStatus.ACTIVE })
  status: PlatformStatus;

  @Column({ name: 'jira_project_key', type: 'varchar', nullable: true })
  jiraProjectKey: string | null;

  @Column({ name: 'jira_enabled', default: false })
  jiraEnabled: boolean;

  // DEV ONLY: in production resolve the per-portal signing key from a secrets
  // manager (KMS / Vault) by reference, not from a database column.
  @Column({ name: 'handoff_secret' })
  handoffSecret: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @OneToMany(() => Reporter, (r) => r.platform)
  reporters: Reporter[];

  @OneToMany(() => Issue, (i) => i.platform)
  issues: Issue[];

  @OneToMany(() => UserPlatformRole, (r) => r.platform)
  roleAssignments: UserPlatformRole[];
}
