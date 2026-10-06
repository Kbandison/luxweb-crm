/**
 * When to nudge a client about an agreement waiting on their signature.
 *
 *   unopened  3 days after sending, if they still haven't opened it
 *   unsigned  7 days after sending, if they opened it but haven't signed
 *   expiring  2 days before the offer lapses
 *
 * Each goes out at most once (the contract records when), at most one per
 * daily run, and never in the first day after sending — a short expiry
 * shouldn't fire an "expiring soon" email right behind "ready to sign".
 * Expiring wins when several are due: it's the one with a deadline.
 */

export type ReminderKind = 'unopened' | 'unsigned' | 'expiring';

export const REMINDER_RULES = {
  unopenedAfterDays: 3,
  unsignedAfterDays: 7,
  expiringWithinDays: 2,
  quietFirstDays: 1,
} as const;

export type ReminderState = {
  sentAt: string;
  expiresAt: string | null;
  firstViewedAt: string | null;
  remindedUnopenedAt: string | null;
  remindedUnsignedAt: string | null;
  remindedExpiringAt: string | null;
};

const DAY = 86_400_000;

export function reminderDue(state: ReminderState, now: Date): ReminderKind | null {
  const t = now.getTime();
  const sent = new Date(state.sentAt).getTime();
  const sinceSent = t - sent;
  if (sinceSent < REMINDER_RULES.quietFirstDays * DAY) return null;

  if (state.expiresAt) {
    const untilExpiry = new Date(state.expiresAt).getTime() - t;
    if (untilExpiry <= 0) return null; // lapsed — the expiry job takes it from here
    if (untilExpiry <= REMINDER_RULES.expiringWithinDays * DAY && !state.remindedExpiringAt) {
      return 'expiring';
    }
  }

  if (
    state.firstViewedAt &&
    sinceSent >= REMINDER_RULES.unsignedAfterDays * DAY &&
    !state.remindedUnsignedAt
  ) {
    return 'unsigned';
  }

  if (
    !state.firstViewedAt &&
    sinceSent >= REMINDER_RULES.unopenedAfterDays * DAY &&
    !state.remindedUnopenedAt
  ) {
    return 'unopened';
  }

  return null;
}

/** The contract column that records each reminder. */
export const REMINDER_COLUMN: Record<ReminderKind, string> = {
  unopened: 'reminded_unopened_at',
  unsigned: 'reminded_unsigned_at',
  expiring: 'reminded_expiring_at',
};
