export const CARE_PLAN_STATUSES = [
  'incomplete',
  'incomplete_expired',
  'trialing',
  'active',
  'past_due',
  'canceled',
  'unpaid',
  'paused',
] as const;

export type CarePlanStatus = (typeof CARE_PLAN_STATUSES)[number];

export const CARE_PLAN_STATUS_LABEL: Record<CarePlanStatus, string> = {
  incomplete: 'Pending activation',
  incomplete_expired: 'Activation expired',
  trialing: 'Trial',
  active: 'Active',
  past_due: 'Past due',
  canceled: 'Canceled',
  unpaid: 'Unpaid',
  paused: 'Paused',
};

export const CARE_PLAN_STATUS_TONE: Record<CarePlanStatus, string> = {
  incomplete: 'bg-warning/15 text-warning',
  incomplete_expired: 'bg-ink/5 text-ink-muted',
  trialing: 'bg-copper/15 text-copper',
  active: 'bg-success/15 text-success',
  past_due: 'bg-danger/15 text-danger',
  canceled: 'bg-ink/5 text-ink-muted',
  unpaid: 'bg-danger/15 text-danger',
  paused: 'bg-ink/5 text-ink-muted',
};
