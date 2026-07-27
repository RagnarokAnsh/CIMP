import {
  Column, CreateDateColumn, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn,
} from 'typeorm';
import { IncidentStatus } from '../common/enums';
import { StatusIncident } from './status-incident.entity';

// One entry in an incident's public timeline ("Identified — a bad deploy…").
// Append-only: the incident's current status is the status of its latest update.
@Entity('status_incident_updates')
export class StatusIncidentUpdate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ManyToOne(() => StatusIncident, (i) => i.updates, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'incident_id' })
  incident: StatusIncident;

  @Column({ type: 'enum', enum: IncidentStatus })
  status: IncidentStatus;

  @Column({ type: 'text' })
  body: string;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;
}
