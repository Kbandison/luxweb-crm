import type { ProspectStatus } from '@/lib/outreach/meta';

/**
 * Which outreach emails may go to a prospect, and which earlier one a
 * follow-up answers. Pure, so the rules are tested without a database.
 *
 * A sequence is a first email and up to two follow-ups in its thread. Each
 * touch goes out once. The CRM can't see replies or bounces (those land in
 * Gmail), so the caller checks for them; these rules are the backstop that
 * keeps a bad call from emailing someone who's done with us, or emailing
 * anyone twice.
 */

export const TOUCHES = ['first', 'follow_up_1', 'follow_up_2'] as const;
export type Touch = (typeof TOUCHES)[number];

export type SendStatus = 'sending' | 'sent' | 'failed';

export type SentEmail = {
  id: string;
  touch: Touch;
  status: SendStatus;
  to_email: string;
  subject: string;
  html: string;
  message_id: string;
  references_header: string | null;
  gmail_thread_id: string | null;
  sent_at: string | null;
  /** When the row last changed: a send starting, finishing, or failing. */
  updated_at: string;
};

export type Refusal = { ok: false; code: string; error: string };

/** Statuses that end outreach for good, until a person in the CRM changes them. */
const CLOSED: readonly ProspectStatus[] = ['dnc', 'not_interested', 'bad_number', 'booked', 'converted'];

/** Statuses a follow-up may go to: we emailed them and haven't heard back. */
const AWAITING: readonly ProspectStatus[] = ['contacted', 'no_answer'];

export function statusRefusal(touch: Touch, status: ProspectStatus): Refusal | null {
  if (CLOSED.includes(status)) {
    return { ok: false, code: 'closed', error: `This prospect is ${status}; no outreach email goes to them.` };
  }
  if (touch === 'first' && status !== 'new') {
    return {
      ok: false,
      code: 'not_new',
      error: `A first email only goes to a prospect whose status is new (this one is ${status}).`,
    };
  }
  if (touch !== 'first' && !AWAITING.includes(status)) {
    return {
      ok: false,
      code: 'not_awaiting',
      error: `A follow-up only goes to a prospect whose status is contacted or no_answer (this one is ${status}). Log the earlier email first.`,
    };
  }
  return null;
}

/** A send that started this long ago and never finished has an unknown result. */
export const STALE_SENDING_MS = 15 * 60 * 1000;

/**
 * Whether `touch` may go out given what's already recorded, and the earlier
 * email it replies to (null for a first email). A failed attempt may be
 * retried; a sent or in-flight one may not.
 */
export function planTouch(
  touch: Touch,
  rows: SentEmail[],
  now: number,
): { ok: true; parent: SentEmail | null; retry: SentEmail | null } | Refusal {
  const byTouch = (t: Touch) => rows.find((r) => r.touch === t) ?? null;
  const sent = (t: Touch) => {
    const r = byTouch(t);
    return r && r.status === 'sent' ? r : null;
  };

  const existing = byTouch(touch);
  if (existing?.status === 'sent') {
    return { ok: false, code: 'already_sent', error: `This prospect's ${touch} email already went out (${existing.sent_at}).` };
  }
  if (existing?.status === 'sending') {
    const stale = now - new Date(existing.updated_at).getTime() > STALE_SENDING_MS;
    return stale
      ? {
          ok: false,
          code: 'unknown_result',
          error: `A ${touch} send started at ${existing.updated_at} and its result was never recorded. Check Gmail Sent for ${existing.to_email} before anything else goes to them.`,
        }
      : { ok: false, code: 'in_progress', error: `A ${touch} send for this prospect is already in progress.` };
  }
  const retry = existing?.status === 'failed' ? existing : null;

  if (touch === 'first') {
    if (rows.some((r) => r.touch !== 'first' && r.status !== 'failed')) {
      return { ok: false, code: 'out_of_order', error: 'This prospect already has follow-ups on record.' };
    }
    return { ok: true, parent: null, retry };
  }

  if (touch === 'follow_up_1') {
    const later = byTouch('follow_up_2');
    if (later && later.status !== 'failed') {
      return { ok: false, code: 'out_of_order', error: 'Follow-up 2 is already on record; the sequence is over.' };
    }
    const parent = sent('first');
    if (!parent) return noEarlier('first');
    return { ok: true, parent, retry };
  }

  // Follow-up 2 answers follow-up 1, or the first email when follow-up 1 was skipped.
  const parent = sent('follow_up_1') ?? sent('first');
  if (!parent) return noEarlier('first');
  return { ok: true, parent, retry };
}

function noEarlier(touch: Touch): Refusal {
  return {
    ok: false,
    code: 'no_earlier_email',
    error: `There's no ${touch} email on record for this prospect. If it went out from Gmail, send it as "previous".`,
  };
}

/** The References header for a reply to `parent`: its chain, then its own id. */
export function referencesFor(parent: Pick<SentEmail, 'message_id' | 'references_header'>): string {
  const chain = (parent.references_header ?? '').split(/\s+/).filter(Boolean);
  if (!chain.includes(parent.message_id)) chain.push(parent.message_id);
  return chain.join(' ');
}

/** The earlier touch an imported "previous" email may stand for. */
export function importableTouches(touch: Touch): Touch[] {
  if (touch === 'follow_up_1') return ['first'];
  if (touch === 'follow_up_2') return ['first', 'follow_up_1'];
  return [];
}
