import { describe, expect, it } from 'vitest';
import {
  agentMayMoveDeal,
  agentNextStatus,
  appendNote,
  bookingWindowError,
  countsAsAttempt,
  overlapsAny,
  resolveOccurredAt,
  subtractInterval,
} from './agent-rules';

const NOW = Date.parse('2026-10-20T16:00:00Z');
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

describe('agentNextStatus', () => {
  it('marks a fresh or cold prospect contacted after an email', () => {
    expect(agentNextStatus('new', 'contacted')).toBe('contacted');
    expect(agentNextStatus('no_answer', 'contacted')).toBe('contacted');
    expect(agentNextStatus('unreachable', 'contacted')).toBe('contacted');
  });

  it("doesn't downgrade someone further along when we email them again", () => {
    expect(agentNextStatus('interested', 'contacted')).toBe('interested');
    expect(agentNextStatus('callback', 'contacted')).toBe('callback');
  });

  it('lets a reply set the status', () => {
    expect(agentNextStatus('contacted', 'interested')).toBe('interested');
    expect(agentNextStatus('interested', 'not_interested')).toBe('not_interested');
    expect(agentNextStatus('contacted', 'dnc')).toBe('dnc');
  });

  it('never moves a booked or converted prospect', () => {
    expect(agentNextStatus('booked', 'not_interested')).toBe('booked');
    expect(agentNextStatus('converted', 'contacted')).toBe('converted');
  });
});

describe('countsAsAttempt', () => {
  it('counts every call, like a setter dial', () => {
    expect(countsAsAttempt('no_answer', 'call')).toBe(true);
    expect(countsAsAttempt('interested', 'call')).toBe(true);
  });

  it('counts an email we sent but not a reply we read', () => {
    expect(countsAsAttempt('contacted', 'email')).toBe(true);
    expect(countsAsAttempt('interested', 'email')).toBe(false);
    expect(countsAsAttempt('dnc', 'email')).toBe(false);
  });
});

describe('resolveOccurredAt', () => {
  it('defaults to now', () => {
    expect(resolveOccurredAt(undefined, NOW)).toEqual({
      ok: true,
      iso: new Date(NOW).toISOString(),
    });
  });

  it('accepts a time earlier today, normalized to UTC', () => {
    expect(resolveOccurredAt('2026-10-20T09:30:00-04:00', NOW)).toEqual({
      ok: true,
      iso: '2026-10-20T13:30:00.000Z',
    });
  });

  it('refuses the future and anything older than 30 days', () => {
    expect(resolveOccurredAt(new Date(NOW + HOUR).toISOString(), NOW).ok).toBe(false);
    expect(resolveOccurredAt(new Date(NOW - 31 * DAY).toISOString(), NOW).ok).toBe(false);
  });

  it('tolerates a few minutes of clock skew', () => {
    expect(resolveOccurredAt(new Date(NOW + 60_000).toISOString(), NOW).ok).toBe(true);
  });
});

describe('agentMayMoveDeal', () => {
  it('moves deals that are still opportunities', () => {
    expect(agentMayMoveDeal('lead')).toBe(true);
    expect(agentMayMoveDeal('discovery')).toBe(true);
    expect(agentMayMoveDeal('proposal')).toBe(true);
  });

  it('leaves paid-for deals alone', () => {
    expect(agentMayMoveDeal('active')).toBe(false);
    expect(agentMayMoveDeal('completed')).toBe(false);
    expect(agentMayMoveDeal('retainer')).toBe(false);
  });
});

describe('subtractInterval', () => {
  const own = { start: 10, end: 20 };

  it('drops a busy block that is exactly the call being moved', () => {
    expect(subtractInterval([{ start: 10, end: 20 }], own)).toEqual([]);
  });

  it('keeps the rest of a merged block around it', () => {
    expect(subtractInterval([{ start: 5, end: 25 }], own)).toEqual([
      { start: 5, end: 10 },
      { start: 20, end: 25 },
    ]);
  });

  it("leaves blocks that don't touch it", () => {
    expect(subtractInterval([{ start: 0, end: 5 }, { start: 30, end: 40 }], own)).toEqual([
      { start: 0, end: 5 },
      { start: 30, end: 40 },
    ]);
  });
});

describe('overlapsAny', () => {
  it('treats back-to-back as free', () => {
    expect(overlapsAny([{ start: 0, end: 10 }], { start: 10, end: 20 })).toBe(false);
  });

  it('catches a partial overlap', () => {
    expect(overlapsAny([{ start: 0, end: 15 }], { start: 10, end: 20 })).toBe(true);
  });
});

describe('bookingWindowError', () => {
  it('needs at least an hour of notice', () => {
    expect(bookingWindowError(NOW + 30 * 60_000, NOW)).toMatch(/at least an hour/);
    expect(bookingWindowError(NOW + 2 * HOUR, NOW)).toBeNull();
  });

  it('refuses more than 60 days out', () => {
    expect(bookingWindowError(NOW + 61 * DAY, NOW)).toMatch(/60 days/);
  });

  it('refuses an unparseable time', () => {
    expect(bookingWindowError(Number.NaN, NOW)).toMatch(/not a valid date/);
  });
});

describe('appendNote', () => {
  it('adds a dated line under existing notes', () => {
    expect(appendNote('Owner is Sam.', 'Replied, wants a call', NOW)).toBe(
      'Owner is Sam.\n\n[2026-10-20] Replied, wants a call',
    );
  });

  it('starts the notes when there are none', () => {
    expect(appendNote(null, 'First email sent', NOW)).toBe('[2026-10-20] First email sent');
  });
});
