import { describe, expect, it } from 'vitest';
import { reminderDue, type ReminderState } from './reminders';

const SENT = '2026-10-01T15:00:00.000Z';
const day = (n: number) => new Date(new Date(SENT).getTime() + n * 86_400_000);

function state(over: Partial<ReminderState> = {}): ReminderState {
  return {
    sentAt: SENT,
    // The standard 14-day offer.
    expiresAt: day(14).toISOString(),
    firstViewedAt: null,
    remindedUnopenedAt: null,
    remindedUnsignedAt: null,
    remindedExpiringAt: null,
    ...over,
  };
}

describe('reminderDue — a standard 14-day agreement', () => {
  it('stays quiet for the first days', () => {
    expect(reminderDue(state(), day(0.5))).toBeNull();
    expect(reminderDue(state(), day(2.9))).toBeNull();
  });

  it('nudges on day 3 if it was never opened', () => {
    expect(reminderDue(state(), day(3))).toBe('unopened');
  });

  it('does not repeat the unopened nudge', () => {
    expect(reminderDue(state({ remindedUnopenedAt: day(3).toISOString() }), day(4))).toBeNull();
  });

  it('skips the unopened nudge once they have opened it', () => {
    expect(reminderDue(state({ firstViewedAt: day(1).toISOString() }), day(3))).toBeNull();
  });

  it('nudges on day 7 if opened but unsigned', () => {
    expect(reminderDue(state({ firstViewedAt: day(1).toISOString() }), day(7))).toBe('unsigned');
  });

  it('warns 2 days before it expires', () => {
    expect(
      reminderDue(
        state({
          firstViewedAt: day(1).toISOString(),
          remindedUnsignedAt: day(7).toISOString(),
        }),
        day(12),
      ),
    ).toBe('expiring');
  });

  it('prefers the expiry warning when several are due', () => {
    expect(reminderDue(state(), day(12.5))).toBe('expiring');
  });

  it('says nothing once it has lapsed', () => {
    expect(reminderDue(state(), day(14.1))).toBeNull();
  });

  it('sends nothing more after all three', () => {
    expect(
      reminderDue(
        state({
          firstViewedAt: day(1).toISOString(),
          remindedUnsignedAt: day(7).toISOString(),
          remindedExpiringAt: day(12).toISOString(),
        }),
        day(13),
      ),
    ).toBeNull();
  });
});

describe('reminderDue — shorter and open-ended offers', () => {
  it('a 1-day offer gets no expiry warning right behind the send', () => {
    expect(reminderDue(state({ expiresAt: day(1).toISOString() }), day(0.2))).toBeNull();
  });

  it('a 7-day offer: unopened on day 3, expiring on day 5', () => {
    const seven = state({ expiresAt: day(7).toISOString() });
    expect(reminderDue(seven, day(3))).toBe('unopened');
    expect(reminderDue({ ...seven, remindedUnopenedAt: day(3).toISOString() }, day(5))).toBe(
      'expiring',
    );
  });

  it('an agreement with no expiry still gets the unopened and unsigned nudges', () => {
    expect(reminderDue(state({ expiresAt: null }), day(3))).toBe('unopened');
    expect(
      reminderDue(state({ expiresAt: null, firstViewedAt: day(1).toISOString() }), day(8)),
    ).toBe('unsigned');
  });
});
