export const REVISION_STATUSES = [
  // New milestone-approval flow.
  'pending_review',
  'approved',
  'changes_requested',
  // Legacy free-form revisions; existing rows keep these.
  'open',
  'in_progress',
  'resolved',
  'wont_do',
] as const;

export type RevisionStatus = (typeof REVISION_STATUSES)[number];

export const REVISION_STATUS_LABEL: Record<RevisionStatus, string> = {
  pending_review: 'Awaiting your review',
  approved: 'Approved',
  changes_requested: 'Changes requested',
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  wont_do: "Won't do",
};

export const REVISION_STATUS_TONE: Record<RevisionStatus, string> = {
  pending_review: 'bg-copper/15 text-copper',
  approved: 'bg-success/15 text-success',
  changes_requested: 'bg-warning/15 text-warning',
  open: 'bg-warning/15 text-warning',
  in_progress: 'bg-copper/15 text-copper',
  resolved: 'bg-success/15 text-success',
  wont_do: 'bg-ink/5 text-ink-muted',
};

/**
 * The new approval-flow statuses, in order of progression. Use this when
 * we need to distinguish "milestone review" rows from the legacy free-form
 * revisions in the same table.
 */
export const APPROVAL_STATUSES = [
  'pending_review',
  'approved',
  'changes_requested',
] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];
export function isApprovalStatus(s: RevisionStatus): s is ApprovalStatus {
  return (APPROVAL_STATUSES as readonly string[]).includes(s);
}
