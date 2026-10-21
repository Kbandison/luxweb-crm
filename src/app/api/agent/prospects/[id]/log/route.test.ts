import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  prospect: null as Record<string, unknown> | null,
  inserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
  updates: [] as Array<{ table: string; patch: Record<string, unknown> }>,
  audit: vi.fn(),
}));

function table(name: string) {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq']) q[m] = () => q;
  q.maybeSingle = async () => ({ data: name === 'prospects' ? h.prospect : null });
  q.insert = async (row: Record<string, unknown>) => {
    h.inserts.push({ table: name, row });
    return { error: null };
  };
  q.update = (patch: Record<string, unknown>) => {
    h.updates.push({ table: name, patch });
    return { eq: async () => ({ error: null }) };
  };
  return q;
}

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: () => ({ from: table }) }));
vi.mock('@/lib/queries/outreach', () => ({
  getOwnerUserId: async () => 'owner-1',
  getOutreachSettings: async () => ({ autoRetireAfter: 3 }),
}));
vi.mock('@/lib/audit', () => ({ writeAudit: h.audit }));

import { POST } from './route';
import { __resetRateLimitForTests } from '@/lib/rate-limit';

const savedKey = process.env.AGENT_API_KEY;
const ID = '7d0b1f3e-0b8e-4c55-9d7a-2f1f6c1b9a10';

const log = (body: Record<string, unknown>) =>
  POST(
    new Request(`https://portal.test/api/agent/prospects/${ID}/log`, {
      method: 'POST',
      headers: { authorization: 'Bearer agent-key', 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ id: ID }) },
  );

const prospectUpdate = () => h.updates.find((u) => u.table === 'prospects')?.patch;
const historyRow = () => h.inserts.find((i) => i.table === 'prospect_calls')?.row;

beforeEach(() => {
  process.env.AGENT_API_KEY = 'agent-key';
  __resetRateLimitForTests();
  h.prospect = { status: 'new', attempts: 0, last_contacted_at: null };
  h.inserts = [];
  h.updates = [];
  h.audit.mockReset();
});

afterAll(() => {
  if (savedKey === undefined) delete process.env.AGENT_API_KEY;
  else process.env.AGENT_API_KEY = savedKey;
});

describe('POST /api/agent/prospects/[id]/log', () => {
  it('logs a sent email as an email, not a dial, at the time it went out', async () => {
    const sentAt = new Date(Date.now() - 2 * 60 * 60_000).toISOString();
    const res = await log({ disposition: 'contacted', note: 'Email sent: "Your site"', occurred_at: sentAt });
    expect(res.status).toBe(200);
    expect(historyRow()).toMatchObject({
      channel: 'email',
      disposition: 'contacted',
      setter_id: 'owner-1',
      called_at: sentAt,
    });
    expect(prospectUpdate()).toMatchObject({ status: 'contacted', attempts: 1, last_contacted_at: sentAt });
  });

  it('keeps an interested prospect interested when we email them again', async () => {
    h.prospect = { status: 'interested', attempts: 2, last_contacted_at: null };
    await log({ disposition: 'contacted' });
    expect(prospectUpdate()).toMatchObject({ status: 'interested', attempts: 3 });
  });

  it("records a reply without counting it as one of our attempts", async () => {
    h.prospect = { status: 'contacted', attempts: 1, last_contacted_at: null };
    await log({ disposition: 'interested', note: 'Email reply: wants to talk Thursday' });
    expect(prospectUpdate()).toMatchObject({ status: 'interested', attempts: 1 });
  });

  it("doesn't move last-contacted backwards for a backdated log", async () => {
    const recent = new Date(Date.now() - 60_000).toISOString();
    h.prospect = { status: 'contacted', attempts: 1, last_contacted_at: recent };
    await log({ disposition: 'contacted', occurred_at: new Date(Date.now() - 86_400_000).toISOString() });
    expect(prospectUpdate()?.last_contacted_at).toBe(recent);
  });

  it('refuses a do-not-contact prospect and writes nothing', async () => {
    h.prospect = { status: 'dnc', attempts: 1, last_contacted_at: null };
    const res = await log({ disposition: 'contacted' });
    expect(res.status).toBe(409);
    expect(h.inserts).toEqual([]);
  });

  it("refuses 'booked', which only the booking route may set", async () => {
    const res = await log({ disposition: 'booked' });
    expect(res.status).toBe(400);
  });

  it('retires a prospect after the configured unanswered calls', async () => {
    h.prospect = { status: 'no_answer', attempts: 2, last_contacted_at: null };
    const res = await log({ channel: 'call', disposition: 'no_answer' });
    expect(await res.json()).toMatchObject({ status: 'unreachable', retired: true });
  });
});
