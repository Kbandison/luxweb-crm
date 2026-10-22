import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { defaultProposalContent } from '@/lib/types/proposal';

const h = vi.hoisted(() => ({
  contact: null as Record<string, unknown> | null,
  // The open-draft lookup on create; the draft itself on edit.
  proposal: null as Record<string, unknown> | null,
  updatedRows: [] as Array<{ id: string }>,
  inserts: [] as Array<{ table: string; row: Record<string, unknown> }>,
  updates: [] as Array<{ table: string; patch: Record<string, unknown>; filters: Array<[string, unknown]> }>,
  audit: vi.fn(),
}));

// Just enough of the query builder for these routes: reads resolve to the
// fixtures above, writes are recorded with their filters.
function table(name: string) {
  const q: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'limit']) q[m] = () => q;
  q.maybeSingle = async () => ({
    data: name === 'contacts' ? h.contact : name === 'proposals' ? h.proposal : null,
  });
  q.insert = (row: Record<string, unknown>) => {
    h.inserts.push({ table: name, row });
    return { select: () => ({ single: async () => ({ data: { id: 'prop-1' }, error: null }) }) };
  };
  q.update = (patch: Record<string, unknown>) => {
    const u = { table: name, patch, filters: [] as Array<[string, unknown]> };
    h.updates.push(u);
    const chain: Record<string, unknown> = {
      eq: (col: string, v: unknown) => (u.filters.push([col, v]), chain),
      in: (col: string, v: unknown) => (u.filters.push([col, v]), chain),
      select: async () => ({ data: h.updatedRows, error: null }),
      then: (resolve: (v: unknown) => void) => resolve({ error: null }),
    };
    return chain;
  };
  return q;
}

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: () => ({ from: table }) }));
vi.mock('@/lib/queries/outreach', () => ({ getOwnerUserId: async () => 'owner-1' }));
vi.mock('@/lib/audit', () => ({ writeAudit: h.audit }));

import { POST } from './route';
import { PATCH } from './[id]/route';
import { __resetRateLimitForTests } from '@/lib/rate-limit';

const savedKey = process.env.AGENT_API_KEY;
const CONTACT = '7d0b1f3e-0b8e-4c55-9d7a-2f1f6c1b9a10';

const call = (method: 'POST' | 'PATCH', body: Record<string, unknown>, key = 'agent-key') => {
  const req = new Request('https://portal.test/api/agent/proposals', {
    method,
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return method === 'POST' ? POST(req) : PATCH(req, { params: Promise.resolve({ id: 'prop-1' }) });
};

// A plan that adds up: a deposit plus the three default phases.
const ready = {
  investment: {
    total_cents: 250000,
    milestones: [
      { kind: 'deposit', label: 'Deposit', percent: 50, amount_cents: 125000, due: 'On signing' },
      { kind: 'phase', phase_id: 'p0', label: 'Discovery & Design', percent: 25, amount_cents: 62500, due: 'On approval' },
      { kind: 'phase', phase_id: 'p1', label: 'Build', percent: 0, amount_cents: 0, due: 'On approval' },
      { kind: 'phase', phase_id: 'p2', label: 'Test & Launch', percent: 25, amount_cents: 62500, due: 'On approval' },
    ],
  },
};

beforeEach(() => {
  process.env.AGENT_API_KEY = 'agent-key';
  __resetRateLimitForTests();
  h.contact = { id: CONTACT, full_name: 'Sam Lee', email: 'sam@acme.com', company: 'Acme Lawn' };
  h.proposal = null;
  h.updatedRows = [{ id: 'prop-1' }];
  h.inserts = [];
  h.updates = [];
  h.audit.mockReset();
});

afterAll(() => {
  if (savedKey === undefined) delete process.env.AGENT_API_KEY;
  else process.env.AGENT_API_KEY = savedKey;
});

describe('POST /api/agent/proposals', () => {
  it('refuses a request without the agent key', async () => {
    const res = await call('POST', { contact_id: CONTACT, title: 'Acme Lawn website' }, 'wrong');
    expect(res.status).toBe(401);
    expect(h.inserts).toEqual([]);
  });

  it('refuses a payment marked collected, which would record money at signing', async () => {
    const res = await call('POST', {
      contact_id: CONTACT,
      title: 'Acme Lawn website',
      content: {
        investment: {
          milestones: [{ ...ready.investment.milestones[0], collected: true, collected_on: '2026-10-01' }],
        },
      },
    });
    expect(res.status).toBe(400);
    expect(h.inserts).toEqual([]);
  });

  it('404s an unknown contact', async () => {
    h.contact = null;
    const res = await call('POST', { contact_id: CONTACT, title: 'Acme Lawn website' });
    expect(res.status).toBe(404);
  });

  it('points at the open draft instead of making a second one', async () => {
    h.proposal = { id: 'prop-0' };
    const res = await call('POST', { contact_id: CONTACT, title: 'Acme Lawn website' });
    expect(res.status).toBe(409);
    expect((await res.json()).id).toBe('prop-0');
    expect(h.inserts).toEqual([]);
  });

  it('saves a draft from the defaults plus what was sent, and never sends it', async () => {
    const res = await call('POST', {
      contact_id: CONTACT,
      title: 'Acme Lawn website',
      content: { ...ready, scope: { pages_count: 6, site_deliverables: ['Online booking'] } },
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ id: 'prop-1', url: '/admin/proposals/prop-1', problems: [] });

    const row = h.inserts.find((i) => i.table === 'proposals')?.row;
    expect(row).toMatchObject({ contact_id: CONTACT, title: 'Acme Lawn website', status: 'draft', total_cents: 250000 });
    const content = row?.content_json as ReturnType<typeof defaultProposalContent>;
    expect(content.client).toMatchObject({ name: 'Sam Lee', contact_email: 'sam@acme.com' });
    expect(content.scope).toMatchObject({ pages_count: 6, site_deliverables: ['Online booking'] });
    expect(content.scope.design).toBe(defaultProposalContent({ clientName: '', clientEmail: '' }).scope.design);

    // Nothing but the draft and the deal stage is written: no contract, no invoice.
    expect(h.inserts.map((i) => i.table)).toEqual(['proposals']);
    expect(h.updates).toEqual([
      expect.objectContaining({
        table: 'deals',
        patch: expect.objectContaining({ stage: 'proposal' }),
        filters: [
          ['contact_id', CONTACT],
          ['stage', ['lead', 'discovery']],
        ],
      }),
    ]);
    expect(h.audit).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'create', entity_type: 'proposal', diff: expect.objectContaining({ via: 'agent' }) }),
    );
  });

  it('lists what still blocks Sign & send', async () => {
    const res = await call('POST', { contact_id: CONTACT, title: 'Acme Lawn website' });
    expect((await res.json()).problems).toContain('Set the project total.');
  });
});

describe('PATCH /api/agent/proposals/[id]', () => {
  const stored = () => defaultProposalContent({ clientName: 'Sam Lee', clientEmail: 'sam@acme.com' });

  it('refuses an agreement that was already sent', async () => {
    h.proposal = { status: 'sent', content_json: stored() };
    const res = await call('PATCH', { title: 'New title' });
    expect(res.status).toBe(409);
    expect(h.updates).toEqual([]);
  });

  it('404s an unknown draft', async () => {
    const res = await call('PATCH', { title: 'New title' });
    expect(res.status).toBe(404);
  });

  it('lays the edit over the stored draft, only while it is still a draft', async () => {
    h.proposal = { status: 'draft', content_json: { ...stored(), note_to_client: 'Kept' } };
    const res = await call('PATCH', { content: ready });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, problems: [] });

    const u = h.updates.find((x) => x.table === 'proposals');
    expect(u?.filters).toEqual([
      ['id', 'prop-1'],
      ['status', 'draft'],
    ]);
    expect(u?.patch.total_cents).toBe(250000);
    expect((u?.patch.content_json as { note_to_client: string }).note_to_client).toBe('Kept');
  });

  it('409s when the draft was sent between the read and the write', async () => {
    h.proposal = { status: 'draft', content_json: stored() };
    h.updatedRows = [];
    const res = await call('PATCH', { title: 'New title' });
    expect(res.status).toBe(409);
    expect(h.audit).not.toHaveBeenCalled();
  });

  it('needs a title or content', async () => {
    h.proposal = { status: 'draft', content_json: stored() };
    const res = await call('PATCH', {});
    expect(res.status).toBe(400);
  });
});
