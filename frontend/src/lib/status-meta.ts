import {
  AlertTriangle, CheckCircle2, CircleSlash, Search, ShieldAlert, Wrench,
  type LucideIcon,
} from 'lucide-react';
import type { ComponentStatus, IncidentImpact, IncidentStatus } from '@/api/types';
import { BADGE_TONE, BANNER_TONE, BANNER_ICON_TONE } from './issue-meta';

// Status-page vocabulary, in the same shape as STATUS_META/PRIORITY_META in
// issue-meta.ts: one source of truth for label + tone + icon, so the public page
// and the staff management UI can never describe the same state differently.
// Tones reuse BADGE_TONE (already contrast-checked in both themes).
//
// `banner`/`bannerIcon` were added because the public page was NOT reading this
// map for its headline surface — it hard-coded `ok ? emerald : amber`, so a
// major outage, a partial outage, degraded performance and a planned
// maintenance window all rendered in the same amber on the one page whose job
// is communicating severity at a glance.

export const COMPONENT_STATUS_META: Record<
  ComponentStatus,
  {
    label: string;
    className: string;
    dot: string;
    icon: LucideIcon;
    banner: string;
    bannerIcon: string;
  }
> = {
  OPERATIONAL: {
    label: 'Operational',
    className: BADGE_TONE.success,
    dot: 'bg-emerald-500',
    icon: CheckCircle2,
    banner: BANNER_TONE.success,
    bannerIcon: BANNER_ICON_TONE.success,
  },
  MAINTENANCE: {
    label: 'Under maintenance',
    className: BADGE_TONE.info,
    dot: 'bg-blue-500',
    icon: Wrench,
    banner: BANNER_TONE.info,
    bannerIcon: BANNER_ICON_TONE.info,
  },
  DEGRADED: {
    label: 'Degraded performance',
    className: BADGE_TONE.warning,
    dot: 'bg-amber-500',
    icon: AlertTriangle,
    banner: BANNER_TONE.warning,
    bannerIcon: BANNER_ICON_TONE.warning,
  },
  PARTIAL_OUTAGE: {
    label: 'Partial outage',
    className: BADGE_TONE.severe,
    dot: 'bg-orange-500',
    icon: ShieldAlert,
    banner: BANNER_TONE.severe,
    bannerIcon: BANNER_ICON_TONE.severe,
  },
  MAJOR_OUTAGE: {
    label: 'Major outage',
    className: BADGE_TONE.danger,
    dot: 'bg-red-500',
    icon: CircleSlash,
    banner: BANNER_TONE.danger,
    bannerIcon: BANNER_ICON_TONE.danger,
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
