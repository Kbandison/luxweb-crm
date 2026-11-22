import { describe, expect, it } from 'vitest';
import {
  importableTouches,
  planTouch,
  referencesFor,
  STALE_SENDING_MS,
  statusRefusal,
  type SentEmail,
  type Touch,
} from './email-sequence';

const NOW = Date.parse('2026-11-23T14:00:00Z');

const row = (touch: Touch, over: Partial<SentEmail> = {}): SentEmail => ({
  id: `row-${touch}`,
  touch,
  status: 'sent',
  to_email: 'info@shop.test',
  subject: touch === 'first' ? 'The quote form' : 'Re: The quote form',
  html: `<p>${touch}</p>`,
  message_id: `<${touch}@studio.test>`,
  references_header: null,
  gmail_thread_id: 't-1',
  sent_at: '2026-11-20T14:00:00Z',
  updated_at: '2026-11-20T14:00:00Z',
  ...over,
});

describe('statusRefusal', () => {
  it('stops every touch for prospects who are done with us', () => {
    for (const status of ['dnc', 'not_interested', 'bad_number', 'booked', 'converted'] as const) {
      expect(statusRefusal('first', status)?.code).toBe('closed');
      expect(statusRefusal('follow_up_2', status)?.code).toBe('closed');
    }
  });

  it('sends a first email only to new prospects', () => {
    expect(statusRefusal('first', 'new')).toBeNull();
    expect(statusRefusal('first', 'contacted')?.code).toBe('not_new');
  });

  it('sends follow-ups only to contacted or no_answer prospects', () => {
    expect(statusRefusal('follow_up_1', 'contacted')).toBeNull();
    expect(statusRefusal('follow_up_2', 'no_answer')).toBeNull();
    expect(statusRefusal('follow_up_1', 'new')?.code).toBe('not_awaiting');
    expect(statusRefusal('follow_up_1', 'interested')?.code).toBe('not_awaiting');
  });
});

describe('planTouch', () => {
  it('lets a first email go when nothing is on record', () => {
    expect(planTouch('first', [], NOW)).toEqual({ ok: true, parent: null, retry: null });
  });

  it('never sends the same touch twice', () => {
    const r = planTouch('first', [row('first')], NOW);
    expect(r.ok === false && r.code).toBe('already_sent');
  });

  it('holds off while a send is in flight, and flags one that never finished', () => {
    const fresh = row('first', { status: 'sending', updated_at: new Date(NOW - 60_000).toISOString() });
    const stale = row('first', { status: 'sending', updated_at: new Date(NOW - STALE_SENDING_MS - 1).toISOString() });
    const a = planTouch('first', [fresh], NOW);
    const b = planTouch('first', [stale], NOW);
    expect(a.ok === false && a.code).toBe('in_progress');
    expect(b.ok === false && b.code).toBe('unknown_result');
  });

  it('retries a failed attempt in place', () => {
    const failed = row('first', { status: 'failed', sent_at: null });
    expect(planTouch('first', [failed], NOW)).toEqual({ ok: true, parent: null, retry: failed });
  });

  it('answers the first email with follow-up 1', () => {
    const first = row('first');
    expect(planTouch('follow_up_1', [first], NOW)).toEqual({ ok: true, parent: first, retry: null });
  });

  it('needs a sent first email before follow-up 1', () => {
    const r = planTouch('follow_up_1', [row('first', { status: 'failed' })], NOW);
    expect(r.ok === false && r.code).toBe('no_earlier_email');
    const none = planTouch('follow_up_1', [], NOW);
    expect(none.ok === false && none.code).toBe('no_earlier_email');
  });

  it('answers follow-up 1 with follow-up 2, or the first email when follow-up 1 was skipped', () => {
    const first = row('first');
    const fu1 = row('follow_up_1');
    expect(planTouch('follow_up_2', [first, fu1], NOW)).toMatchObject({ ok: true, parent: fu1 });
    expect(planTouch('follow_up_2', [first], NOW)).toMatchObject({ ok: true, parent: first });
  });

  it('refuses follow-up 1 once follow-up 2 is out', () => {
    const r = planTouch('follow_up_1', [row('first'), row('follow_up_2')], NOW);
    expect(r.ok === false && r.code).toBe('out_of_order');
  });
});

describe('referencesFor', () => {
  it("chains the parent's references and its own id", () => {
    expect(referencesFor({ message_id: '<a@x>', references_header: null })).toBe('<a@x>');
    expect(referencesFor({ message_id: '<b@x>', references_header: '<a@x>' })).toBe('<a@x> <b@x>');
    expect(referencesFor({ message_id: '<b@x>', references_header: '<a@x> <b@x>' })).toBe('<a@x> <b@x>');
  });
});

describe('importableTouches', () => {
  it('lets a follow-up stand on an earlier email sent from Gmail', () => {
    expect(importableTouches('first')).toEqual([]);
    expect(importableTouches('follow_up_1')).toEqual(['first']);
    expect(importableTouches('follow_up_2')).toEqual(['first', 'follow_up_1']);
  });
});
