import type { PipelineStage } from '@/lib/queries/admin';

export const STAGES: PipelineStage[] = [
  'lead',
  'discovery',
  'proposal',
  'active',
  'completed',
  'retainer',
];

export const STAGE_LABEL: Record<PipelineStage, string> = {
  lead: 'Lead',
  discovery: 'Discovery',
  proposal: 'Proposal',
  active: 'Active',
  completed: 'Completed',
  retainer: 'Retainer',
};

// Subtle accent dot per stage. Active gets the copper anchor.
export const STAGE_DOT: Record<PipelineStage, string> = {
  lead: 'bg-ink-subtle',
  discovery: 'bg-info',
  proposal: 'bg-warning',
  active: 'bg-copper',
  completed: 'bg-success',
  retainer: 'bg-success/50',
};
