import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { SentEmail } from '@/lib/outreach/email-sequence';

const h = vi.hoisted(() => ({
  prospect: null as null | { status: string; email: string | null },
  sequence: [] as SentEmail[],
  sender: { ok: true, sender: { email: 'owner@studio.test' } } as
    | { ok: true; sender: { email: string } }
    | { ok: false; error: string },
  send: vi.fn(),
  reserve: vi.fn(),
  markSent: vi.fn(),
  markFailed: vi.fn(),
  importPrevious: vi.fn(),
  audit: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: h.prospect, error: null }) }) }),
    }),
  }),
}));
vi.mock('@/lib/queries/outreach', () => ({
  getOwnerUserId: async () => 'owner-1',
  getOutreachSettings: async () => ({ slotTimezone: 'America/New_York' }),
}));
vi.mock('@/lib/google/gmail', () => ({
  gmailSender: async () => h.sender,
  sendGmailRaw: h.send,
}));
vi.mock('@/lib/outreach/email-record', () => ({
  loadSequence: async () => h.sequence,
  reserveSend: h.reserve,
  markSent: h.markSent,
  markFailed: h.markFailed,
  importPrevious: h.importPrevious,
}));
vi.mock('@/lib/audit', () => ({ writeAudit: h.audit }));

import { POST } from './route';
import { __resetRateLimitForTests } from '@/lib/rate-limit';

const savedKey = process.env.AGENT_API_KEY;

const post = (body: Record<string, unknown>, key = 'agent-key') =>
  POST(
    new Request('https://portal.test/api/agent/prospects/p-1/email', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: 'p-1' }) },
  );

/** The message Gmail was handed, decoded. */
const sentMime = () => Buffer.from(h.send.mock.calls[0][1] as string, 'base64url').toString('utf8');

const firstRow = (over: Partial<SentEmail> = {}): SentEmail => ({
  id: 'row-first',
  touch: 'first',
  status: 'sent',
  to_email: 'info@shop.test',
  subject: 'The quote form on your website',
  html: '<div dir="ltr"><p>First email</p></div>',
  message_id: '<first@studio.test>',
  references_header: null,
  gmail_thread_id: 'thread-1',
  sent_at: '2026-11-20T19:00:00Z',
  updated_at: '2026-11-20T19:00:00Z',
  ...over,
});

const body = '<p>Good morning Sam,</p><p>Short note.</p><p>Thanks,</p>';

beforeEach(() => {
  process.env.AGENT_API_KEY = 'agent-key';
  __resetRateLimitForTests();
  h.prospect = { status: 'new', email: ' info@shop.test ' };
  h.sequence = [];
  h.sender = { ok: true, sender: { email: 'owner@studio.test' } };
  for (const fn of [h.send, h.reserve, h.markSent, h.markFailed, h.importPrevious, h.audit]) fn.mockReset();
  h.send.mockResolvedValue({ ok: true, id: 'gm-1', threadId: 'thread-9' });
  h.reserve.mockResolvedValue('row-new');
  h.markSent.mockResolvedValue(true);
});

afterAll(() => {
  process.env.AGENT_API_KEY = savedKey;
});

describe('POST /api/agent/prospects/[id]/email', () => {
  it('refuses a request without the key', async () => {
    const res = await post({ touch: 'first', subject: 'Hi', html: body }, 'wrong');
    expect(res.status).toBe(401);
    expect(h.send).not.toHaveBeenCalled();
  });

  it('sends a first email from the owner, in a new thread, and records it', async () => {
    const res = await post({ touch: 'first', subject: 'The quote form on your website', html: body });
    expect(res.status).toBe(200);
    const out = await res.json();
    expect(out).toMatchObject({
      ok: true,
      touch: 'first',
      to: 'info@shop.test',
      subject: 'The quote form on your website',
      gmail_message_id: 'gm-1',
      gmail_thread_id: 'thread-9',
    });
    expect(out.message_id).toMatch(/^<[0-9a-f-]{36}@studio\.test>$/);

    expect(h.send).toHaveBeenCalledWith('owner-1', expect.any(String), null);
    const mime = sentMime();
    expect(mime).toContain('From: LuxWeb Studio <owner@studio.test>');
    expect(mime).toContain('To: info@shop.test');
    expect(mime).toContain('Subject: The quote form on your website');
    expect(mime).toContain(`Message-ID: ${out.message_id}`);
    expect(mime).not.toContain('In-Reply-To');
    expect(mime).not.toContain('gmail_quote');

    expect(h.reserve).toHaveBeenCalledWith(
      'p-1',
      'first',
      expect.objectContaining({ to_email: 'info@shop.test', html: `<div dir="ltr">${body}</div>`, references_header: null }),
      null,
    );
    expect(h.markSent).toHaveBeenCalledWith('row-new', { ok: true, id: 'gm-1', threadId: 'thread-9' }, out.sent_at);
    expect(h.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'send', entity_id: 'p-1' }));
  });

  it('replies in the first email’s thread with Re:, the quote, and threading headers', async () => {
    h.prospect = { status: 'contacted', email: 'info@shop.test' };
    h.sequence = [firstRow()];
    const res = await post({ touch: 'follow_up_1', html: body });
    expect(res.status).toBe(200);
    expect(h.send).toHaveBeenCalledWith('owner-1', expect.any(String), 'thread-1');
    const mime = sentMime();
    expect(mime).toContain('Subject: Re: The quote form on your website');
    expect(mime).toContain('In-Reply-To: <first@studio.test>');
    expect(mime).toContain('References: <first@studio.test>');
    const reserved = h.reserve.mock.calls[0][2] as { html: string; subject: string };
    expect(reserved.subject).toBe('Re: The quote form on your website');
    expect(reserved.html).toContain('class="gmail_quote"');
    expect(reserved.html).toContain('On Fri, Nov 20, 2026 at 2:00 PM LuxWeb Studio');
    expect(reserved.html).toContain('<p>First email</p></div></blockquote>');
  });

  it('picks up a thread that started in Gmail when the earlier email is passed as previous', async () => {
    h.prospect = { status: 'contacted', email: 'info@shop.test' };
    const imported = firstRow({ id: 'row-imported', gmail_thread_id: 'gmail-thread', message_id: '<CAx@mail.gmail.com>' });
    h.importPrevious.mockResolvedValue(imported);
    const previous = {
      touch: 'first',
      gmail_thread_id: 'gmail-thread',
      message_id: '<CAx@mail.gmail.com>',
      subject: 'The quote form on your website',
      html: '<div dir="ltr"><p>First email</p></div>',
      sent_at: '2026-11-20T14:00:00-05:00',
    };
    const res = await post({ touch: 'follow_up_1', html: body, previous });
    expect(res.status).toBe(200);
    expect(h.importPrevious).toHaveBeenCalledWith('p-1', expect.objectContaining({ ...previous, to_email: 'info@shop.test' }));
    expect(h.send).toHaveBeenCalledWith('owner-1', expect.any(String), 'gmail-thread');
    expect(sentMime()).toContain('In-Reply-To: <CAx@mail.gmail.com>');
  });

  it('refuses a follow-up with no earlier email on record and none passed', async () => {
    h.prospect = { status: 'contacted', email: 'info@shop.test' };
    const res = await post({ touch: 'follow_up_1', html: body });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('no_earlier_email');
    expect(h.send).not.toHaveBeenCalled();
  });

  it('never emails a prospect who is done with us', async () => {
    h.prospect = { status: 'dnc', email: 'info@shop.test' };
    const res = await post({ touch: 'first', subject: 'Hi', html: body });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('closed');
    expect(h.reserve).not.toHaveBeenCalled();
  });

  it('never sends the same touch twice', async () => {
    h.sequence = [firstRow()];
    const res = await post({ touch: 'first', subject: 'Hi', html: body });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('already_sent');
    expect(h.send).not.toHaveBeenCalled();
  });

  it('says so when the Google connection can’t send yet', async () => {
    h.sender = { ok: false, error: 'Reconnect Google on /admin/outreach and allow sending.' };
    const res = await post({ touch: 'first', subject: 'Hi', html: body });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('gmail_not_connected');
  });

  it('backs off when another call already claimed the touch', async () => {
    h.reserve.mockResolvedValue(null);
    const res = await post({ touch: 'first', subject: 'Hi', html: body });
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe('in_progress');
    expect(h.send).not.toHaveBeenCalled();
  });

  it('marks a refused send failed so it can be retried', async () => {
    h.send.mockResolvedValue({ ok: false, status: 400, error: 'Gmail answered 400: Invalid To header' });
    const res = await post({ touch: 'first', subject: 'Hi', html: body });
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe('send_failed');
    expect(h.markFailed).toHaveBeenCalledWith('row-new', 'Gmail answered 400: Invalid To header');
    expect(h.markSent).not.toHaveBeenCalled();
  });

  it('keeps the claim when the send died in flight, so nothing resends it blind', async () => {
    h.send.mockResolvedValue({ ok: false, status: 502, error: 'No answer from Gmail', unknown: true });
    const res = await post({ touch: 'first', subject: 'Hi', html: body });
    expect(res.status).toBe(502);
    expect((await res.json()).code).toBe('unknown_result');
    expect(h.markFailed).not.toHaveBeenCalled();
  });

  it('rejects a subject on a follow-up and a header-breaking subject', async () => {
    h.prospect = { status: 'contacted', email: 'info@shop.test' };
    expect((await post({ touch: 'follow_up_1', subject: 'Hi', html: body })).status).toBe(400);
    expect((await post({ touch: 'first', subject: 'Hi\r\nBcc: x@evil.test', html: body })).status).toBe(400);
    expect(h.send).not.toHaveBeenCalled();
  });
});
