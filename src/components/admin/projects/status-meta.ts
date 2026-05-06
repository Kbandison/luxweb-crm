import type { ProjectStatus } from '@/lib/queries/admin';

export const PROJECT_STATUSES: ProjectStatus[] = [
  'planning',
  'in_progress',
  'on_hold',
  'completed',
  'cancelled',
];

export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  planning: 'Planning',
  in_progress: 'In progress',
  on_hold: 'On hold',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const PROJECT_STATUS_DOT: Record<ProjectStatus, string> = {
  planning: 'bg-info',
  in_progress: 'bg-copper',
  on_hold: 'bg-warning',
  completed: 'bg-success',
  cancelled: 'bg-ink-subtle',
};

export type MilestoneStatus =
  | 'inactive'
  | 'pending'
  | 'in_progress'
  | 'done'
  | 'blocked';

export const MILESTONE_STATUSES: MilestoneStatus[] = [
  'inactive',
  'pending',
  'in_progress',
  'done',
  'blocked',
];

export const MILESTONE_STATUS_LABEL: Record<MilestoneStatus, string> = {
  inactive: 'Inactive',
  pending: 'Pending',
  in_progress: 'In review',
  done: 'Done',
  blocked: 'Blocked',
};

export const MILESTONE_STATUS_TONE: Record<MilestoneStatus, string> = {
  inactive: 'bg-ink-subtle/10 text-ink-subtle',
  pending: 'bg-copper/10 text-copper',
  in_progress: 'bg-warning/15 text-warning',
  done: 'bg-success/15 text-success',
  blocked: 'bg-danger/10 text-danger',
};

export type MilestoneSource = 'proposal' | 'manual';
