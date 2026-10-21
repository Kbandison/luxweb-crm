import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  prospect: null as Record<string, unknown> | null,
  existing: null as Record<string, unknown> | null,
  inserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
  updates: [] as Array<{ table: string; patch: Record<string, unknown> }>,
  busy: [] as Array<{ start: number; end: number }>,
  createEvent: vi.fn(),
  promote: vi.fn(),
  audit: vi.fn(),
}));

// Just enough of the query builder for this route: reads resolve to the
// fixtures above, writes are recorded.
function table(name: string) {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'ilike', 'in', 'limit']) q[m] = () => q;
  q.maybeSingle = async () => ({
    data: name === 'prospects' ? h.prospect : name === 'appointments' ? h.existing : null,
  });
  q.insert = (row: Record<string, unknown>) => {
    h.inserts.push({ table: name, row });
    return {
      select: () => ({ single: async () => ({ data: { id: 'appt-1' }, error: null }) }),
      then: (resolve: (v: unknown) => void) => resolve({ error: null }),
    };
  };
  q.update = (patch: Record<string, unknown>) => {
    h.updates.push({ table: name, patch });
    return { eq: async () => ({ error: null }) };
  };
  return q;
}

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: () => ({ from: table }) }));
vi.mock('@/lib/queries/outreach', () => ({ getOwnerUserId: async () => 'owner-1' }));
vi.mock('@/lib/google/calendar', () => ({
  createCalendarEvent: h.createEvent,
  freeBusy: async () => h.busy,
}));
vi.mock('@/lib/outreach/promote', () => ({ promoteProspectToLead: h.promote }));
vi.mock('@/lib/audit', () => ({ writeAudit: h.audit }));

import { POST } from './route';
import { __resetRateLimitForTests } from '@/lib/rate-limit';

const savedKey = process.env.AGENT_API_KEY;
const PROSPECT = '7d0b1f3e-0b8e-4c55-9d7a-2f1f6c1b9a10';
const inTwoDays = new Date(Date.now() + 2 * 86_400_000);
inTwoDays.setUTCMinutes(0, 0, 0);
const START = inTwoDays.toISOString();

const book = (body: Record<string, unknown>, key = 'agent-key') =>
  POST(
    new Request('https://portal.test/api/agent/appointments', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );

const valid = {
  prospect_id: PROSPECT,
  contact_name: 'Sam Lee',
  business_name: 'Acme Lawn',
  email: 'sam@acme.com',
  scheduled_at: START,
  notes: 'Wants a quote before spring',
};

beforeEach(() => {
  process.env.AGENT_API_KEY = 'agent-key';
  __resetRateLimitForTests();
  h.prospect = { status: 'interested' };
  h.existing = null;
  h.inserts = [];
  h.updates = [];
  h.busy = [];
  h.createEvent.mockReset().mockResolvedValue('evt-1');
  h.promote.mockReset().mockResolvedValue('contact-1');
  h.audit.mockReset();
});

afterAll(() => {
  if (savedKey === undefined) delete process.env.AGENT_API_KEY;
  else process.env.AGENT_API_KEY = savedKey;
});

describe('POST /api/agent/appointments', () => {
  it('refuses a request without the agent key', async () => {
    const res = await book(valid, 'wrong');
    expect(res.status).toBe(401);
    expect(h.createEvent).not.toHaveBeenCalled();
  });

  it('refuses a time without an offset, which would land on the wrong hour', async () => {
    const res = await book({ ...valid, scheduled_at: START.replace('.000Z', '') });
    expect(res.status).toBe(400);
  });

  it('refuses a time less than an hour out', async () => {
    const res = await book({ ...valid, scheduled_at: new Date(Date.now() + 10 * 60_000).toISOString() });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/at least an hour/);
  });

  it('books a free slot the way a setter would', async () => {
    const res = await book(valid);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 'appt-1', synced: true, converted_contact_id: 'contact-1' });

    // Calendar invite to the prospect, without the internal notes.
    expect(h.createEvent).toHaveBeenCalledWith(
      'owner-1',
      expect.objectContaining({ summary: 'Discovery call — Acme Lawn', attendeeEmail: 'sam@acme.com' }),
    );
    expect(h.createEvent.mock.calls[0][1].description).not.toMatch(/quote before spring/);

    const appt = h.inserts.find((i) => i.table === 'appointments')?.row;
    expect(appt).toMatchObject({
      prospect_id: PROSPECT,
      assigned_to: 'owner-1',
      google_event_id: 'evt-1',
      notes: 'Wants a quote before spring',
    });
    expect(h.inserts.find((i) => i.table === 'prospect_calls')?.row).toMatchObject({
      channel: 'email',
      disposition: 'booked',
    });
    expect(h.updates.find((u) => u.table === 'prospects')?.patch).toMatchObject({ status: 'booked' });
    expect(h.promote).toHaveBeenCalledWith(PROSPECT, 'owner-1');
  });

  it('returns the existing booking on a retry instead of booking twice', async () => {
    h.existing = { id: 'appt-0', google_event_id: 'evt-0' };
    const res = await book(valid);
    expect(await res.json()).toEqual({ id: 'appt-0', synced: true, already_booked: true });
    expect(h.createEvent).not.toHaveBeenCalled();
    expect(h.inserts).toEqual([]);
  });

  it("won't book over something already on Kevin's calendar", async () => {
    const t = inTwoDays.getTime();
    h.busy = [{ start: t - 15 * 60_000, end: t + 15 * 60_000 }];
    const res = await book(valid);
    expect(res.status).toBe(409);
    expect(h.createEvent).not.toHaveBeenCalled();
  });

  it("won't book a do-not-contact prospect", async () => {
    h.prospect = { status: 'dnc' };
    const res = await book(valid);
    expect(res.status).toBe(409);
    expect(h.createEvent).not.toHaveBeenCalled();
  });

  it('books someone who is not on the call list without touching prospects', async () => {
    const res = await book({ ...valid, prospect_id: undefined });
    expect(res.status).toBe(200);
    expect(h.promote).not.toHaveBeenCalled();
    expect(h.inserts.map((i) => i.table)).toEqual(['appointments']);
  });
});
