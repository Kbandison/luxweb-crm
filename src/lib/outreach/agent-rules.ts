import type { ProspectStatus } from '@/lib/outreach/meta';

/**
 * Decisions the assistant's routes (/api/agent) make, kept pure so they can be
 * tested without a database.
 */

export type Channel = 'call' | 'email';

/** Earlier statuses an outbound email may replace with 'contacted'. */
const OPEN_STATUSES: readonly ProspectStatus[] = ['new', 'no_answer', 'unreachable', 'contacted'];

/** Outcomes that only a booking (or a person in the CRM) may change. */
const SETTLED_STATUSES: readonly ProspectStatus[] = ['booked', 'converted'];

/**
 * The prospect's status after a logged touch.
 *
 * An outbound email ('contacted') never downgrades a prospect who is further
 * along — emailing someone already 'interested' leaves them interested. A
 * reply (interested, not interested, dnc, ...) is what they told us, so it
 * wins, except over a booking already made.
 */
export function agentNextStatus(
  current: ProspectStatus,
  disposition: ProspectStatus,
): ProspectStatus {
  if (SETTLED_STATUSES.includes(current)) return current;
  if (disposition === 'contacted' && !OPEN_STATUSES.includes(current)) return current;
  return disposition;
}

/**
 * Whether a touch counts toward `attempts`. A call always does (it's a dial,
 * the way setters log them). An email only does when it's one we sent, not a
 * reply we received.
 */
export function countsAsAttempt(disposition: ProspectStatus, channel: Channel): boolean {
  if (channel === 'call') return true;
  return disposition === 'contacted';
}

const MAX_BACKDATE_MS = 30 * 24 * 60 * 60 * 1000;
const CLOCK_SKEW_MS = 5 * 60 * 1000;

/**
 * When a touch happened. Backdating lets the assistant log an email at the
 * time it was actually sent; the window keeps a bad date from rewriting
 * history or landing in the future.
 */
export function resolveOccurredAt(
  occurredAt: string | null | undefined,
  now: number,
): { ok: true; iso: string } | { ok: false; error: string } {
  if (!occurredAt) return { ok: true, iso: new Date(now).toISOString() };
  const t = new Date(occurredAt).getTime();
  if (!Number.isFinite(t)) return { ok: false, error: 'occurred_at is not a valid date' };
  if (t > now + CLOCK_SKEW_MS) return { ok: false, error: 'occurred_at is in the future' };
  if (t < now - MAX_BACKDATE_MS) return { ok: false, error: 'occurred_at is more than 30 days ago' };
  return { ok: true, iso: new Date(t).toISOString() };
}

/** Pipeline stages the assistant may move a deal to. Money stages stay manual. */
export const AGENT_DEAL_STAGES = ['lead', 'discovery', 'proposal'] as const;
export type AgentDealStage = (typeof AGENT_DEAL_STAGES)[number];

/** A deal past these has been paid for; the assistant never moves it back. */
export function agentMayMoveDeal(currentStage: string): boolean {
  return (AGENT_DEAL_STAGES as readonly string[]).includes(currentStage);
}

export type Interval = { start: number; end: number };

/**
 * Busy blocks with `own` cut out — so moving a call by half an hour doesn't
 * collide with the call's current slot. Google merges touching busy blocks,
 * so the old slot can sit inside a bigger block rather than match it exactly.
 */
export function subtractInterval(busy: Interval[], own: Interval): Interval[] {
  const out: Interval[] = [];
  for (const b of busy) {
    if (b.end <= own.start || b.start >= own.end) {
      out.push(b);
      continue;
    }
    if (b.start < own.start) out.push({ start: b.start, end: own.start });
    if (b.end > own.end) out.push({ start: own.end, end: b.end });
  }
  return out;
}

export function overlapsAny(busy: Interval[], slot: Interval): boolean {
  return busy.some((b) => slot.start < b.end && slot.end > b.start);
}

/** Bookings must start at least an hour out — the same lead time setters get. */
export const BOOKING_LEAD_MS = 60 * 60 * 1000;
/** And no further out than this, so a typo'd year doesn't book next spring. */
export const BOOKING_HORIZON_MS = 60 * 24 * 60 * 60 * 1000;

export function bookingWindowError(startMs: number, now: number): string | null {
  if (!Number.isFinite(startMs)) return 'scheduled_at is not a valid date';
  if (startMs < now + BOOKING_LEAD_MS) return 'scheduled_at must be at least an hour from now';
  if (startMs > now + BOOKING_HORIZON_MS) return 'scheduled_at is more than 60 days out';
  return null;
}

/** "[2026-01-05] note" appended under any existing notes, never over them. */
export function appendNote(existing: string | null, note: string, now: number): string {
  const stamp = new Date(now).toISOString().slice(0, 10);
  const line = `[${stamp}] ${note.trim()}`;
  return existing && existing.trim() ? `${existing.trimEnd()}\n\n${line}` : line;
}
