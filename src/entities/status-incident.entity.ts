import {
  Column, CreateDateColumn, Entity, JoinColumn, JoinTable, ManyToMany, ManyToOne,
  OneToMany, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { IncidentImpact, IncidentStatus } from '../common/enums';
import { Platform } from './platform.entity';
import { StatusComponent } from './status-component.entity';
import { StatusIncidentUpdate } from './status-incident-update.entity';

// A publicly-announced incident on a platform's status page. Everything here is
// staff-authored and public by definition — no reporter text is ever carried in.
@Entity('status_incidents')
export class StatusIncident {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => Platform, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'platform_id' })
  platform: Platform;

  @Column()
  title: string;

  @Column({ type: 'enum', enum: IncidentStatus, default: IncidentStatus.INVESTIGATING })
  status: IncidentStatus;

  @Column({ type: 'enum', enum: IncidentImpact, default: IncidentImpact.MINOR })
  impact: IncidentImpact;

  @ManyToMany(() => StatusComponent, { onDelete: 'CASCADE' })
  @JoinTable({
    name: 'status_incident_components',
    joinColumn: { name: 'incident_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'component_id', referencedColumnName: 'id' },
  })
  components: StatusComponent[];

  @OneToMany(() => StatusIncidentUpdate, (u) => u.incident, { cascade: false })
  updates: StatusIncidentUpdate[];

  @Column({ name: 'started_at', type: 'timestamptz', default: () => 'now()' })
  startedAt: Date;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt: Date | null;

  // Author's staff id — a plain column, not an FK, so removing a staff member
  // never deletes public incident history (matches IssueLink.createdBy).
  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
