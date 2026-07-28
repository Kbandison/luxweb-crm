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
