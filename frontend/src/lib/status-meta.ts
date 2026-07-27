import {
  AlertTriangle, CheckCircle2, CircleSlash, Search, ShieldAlert, Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { ComponentStatus, IncidentImpact, IncidentStatus } from '@/api/types';
import { BADGE_TONE } from './issue-meta';

// Status-page vocabulary, in the same shape as STATUS_META/PRIORITY_META in
// issue-meta.ts: one source of truth for label + tone + icon, so the public page
// and the staff management UI can never describe the same state differently.
// Tones reuse BADGE_TONE (already contrast-checked in both themes).

export const COMPONENT_STATUS_META: Record<
  ComponentStatus,
  { label: string; className: string; dot: string; icon: LucideIcon }
> = {
  OPERATIONAL: {
    label: 'Operational',
    className: BADGE_TONE.success,
    dot: 'bg-emerald-500',
    icon: CheckCircle2,
  },
  MAINTENANCE: {
    label: 'Under maintenance',
    className: BADGE_TONE.info,
    dot: 'bg-blue-500',
    icon: Wrench,
  },
  DEGRADED: {
    label: 'Degraded performance',
    className: BADGE_TONE.warning,
    dot: 'bg-amber-500',
    icon: AlertTriangle,
  },
  PARTIAL_OUTAGE: {
    label: 'Partial outage',
    className: BADGE_TONE.warning,
    dot: 'bg-orange-500',
    icon: ShieldAlert,
  },
  MAJOR_OUTAGE: {
    label: 'Major outage',
    className: BADGE_TONE.danger,
    dot: 'bg-red-500',
    icon: CircleSlash,
  },
};

/** Headline shown on the public page banner for the overall state. */
export const OVERALL_HEADLINE: Record<ComponentStatus, string> = {
  OPERATIONAL: 'All systems operational',
  MAINTENANCE: 'Maintenance in progress',
  DEGRADED: 'Degraded performance',
  PARTIAL_OUTAGE: 'Partial service outage',
  MAJOR_OUTAGE: 'Major service outage',
};

export const INCIDENT_STATUS_META: Record<
  IncidentStatus,
  { label: string; className: string; icon: LucideIcon }
> = {
  INVESTIGATING: { label: 'Investigating', className: BADGE_TONE.warning, icon: Search },
  IDENTIFIED: { label: 'Identified', className: BADGE_TONE.warning, icon: AlertTriangle },
  MONITORING: { label: 'Monitoring', className: BADGE_TONE.info, icon: ShieldAlert },
  RESOLVED: { label: 'Resolved', className: BADGE_TONE.success, icon: CheckCircle2 },
};

export const INCIDENT_IMPACT_META: Record<
  IncidentImpact,
  { label: string; className: string }
> = {
  MINOR: { label: 'Minor', className: BADGE_TONE.warning },
  MAJOR: { label: 'Major', className: BADGE_TONE.warning },
  CRITICAL: { label: 'Critical', className: BADGE_TONE.danger },
  MAINTENANCE: { label: 'Maintenance', className: BADGE_TONE.info },
};

/** Ordered for pickers — matches the server enum order (worst last). */
export const COMPONENT_STATUSES: ComponentStatus[] = [
  'OPERATIONAL', 'MAINTENANCE', 'DEGRADED', 'PARTIAL_OUTAGE', 'MAJOR_OUTAGE',
];
export const INCIDENT_STATUSES: IncidentStatus[] = [
  'INVESTIGATING', 'IDENTIFIED', 'MONITORING', 'RESOLVED',
];
export const INCIDENT_IMPACTS: IncidentImpact[] = [
  'MINOR', 'MAJOR', 'CRITICAL', 'MAINTENANCE',
];
