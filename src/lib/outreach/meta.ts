/**
 * Client-safe outreach metadata (labels + badge tones). No server-only
 * imports so both the setter portal and admin view can use it.
 */
export type ProspectStatus =
  | 'new'
  | 'no_answer'
  | 'callback'
  | 'interested'
  | 'booked'
  | 'converted'
  | 'not_interested'
  | 'bad_number'
  | 'dnc';

export const STATUS_LABEL: Record<ProspectStatus, string> = {
  new: 'New',
  no_answer: 'No answer',
  callback: 'Callback',
  interested: 'Interested',
  booked: 'Booked',
  converted: 'Converted',
  not_interested: 'Not interested',
  bad_number: 'Bad number',
  dnc: 'Do not call',
};

export const STATUS_TONE: Record<ProspectStatus, string> = {
  new: 'bg-surface-2 text-ink-muted',
  no_answer: 'bg-surface-2 text-ink-subtle',
  callback: 'bg-warning/15 text-warning',
  interested: 'bg-copper-soft text-copper',
  booked: 'bg-success/15 text-success',
  converted: 'bg-success/15 text-success',
  not_interested: 'bg-surface-2 text-ink-subtle',
  bad_number: 'bg-danger/10 text-danger',
  dnc: 'bg-danger/10 text-danger',
};

export type DueState = 'overdue' | 'today' | 'upcoming';

/**
 * Where a scheduled callback sits relative to now. A callback that was due
 * three days ago should not look the same as one due next Tuesday. `now` is
 * passed in so server and client renders agree.
 */
export function dueState(
  nextActionAt: string | null | undefined,
  now: Date,
): DueState | null {
  if (!nextActionAt) return null;
  const due = new Date(nextActionAt);
  if (Number.isNaN(due.getTime())) return null;
  if (due.getTime() <= now.getTime()) return 'overdue';
  const endOfDay = new Date(now);
  endOfDay.setHours(23, 59, 59, 999);
  return due.getTime() <= endOfDay.getTime() ? 'today' : 'upcoming';
}

export const DUE_LABEL: Record<DueState, string> = {
  overdue: 'Overdue',
  today: 'Due today',
  upcoming: 'Scheduled',
};

export const DUE_TONE: Record<DueState, string> = {
  overdue: 'bg-danger/10 text-danger',
  today: 'bg-warning/15 text-warning',
  upcoming: 'bg-surface-2 text-ink-muted',
};

/** Disposition buttons a setter taps after a dial (no 'new'/'converted'). */
export const LOG_DISPOSITIONS: ProspectStatus[] = [
  'no_answer',
  'callback',
  'interested',
  'booked',
  'not_interested',
  'bad_number',
  'dnc',
];
