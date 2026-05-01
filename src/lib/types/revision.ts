export const REVISION_STATUSES = [
  'open',
  'in_progress',
  'resolved',
  'wont_do',
] as const;

export type RevisionStatus = (typeof REVISION_STATUSES)[number];

export const REVISION_STATUS_LABEL: Record<RevisionStatus, string> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  wont_do: "Won't do",
};

export const REVISION_STATUS_TONE: Record<RevisionStatus, string> = {
  open: 'bg-warning/15 text-warning',
  in_progress: 'bg-copper/15 text-copper',
  resolved: 'bg-success/15 text-success',
  wont_do: 'bg-ink/5 text-ink-muted',
};
