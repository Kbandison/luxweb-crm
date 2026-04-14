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

export type MilestoneStatus = 'pending' | 'in_progress' | 'done' | 'blocked';

export const MILESTONE_STATUSES: MilestoneStatus[] = [
  'pending',
  'in_progress',
  'done',
  'blocked',
];

export const MILESTONE_STATUS_LABEL: Record<MilestoneStatus, string> = {
  pending: 'Pending',
  in_progress: 'In progress',
  done: 'Done',
  blocked: 'Blocked',
};

export const MILESTONE_STATUS_TONE: Record<MilestoneStatus, string> = {
  pending: 'bg-ink/5 text-ink-muted',
  in_progress: 'bg-copper/15 text-copper',
  done: 'bg-success/15 text-success',
  blocked: 'bg-danger/10 text-danger',
};
