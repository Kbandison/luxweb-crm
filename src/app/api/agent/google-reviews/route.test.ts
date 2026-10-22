import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  stored: [] as Array<Record<string, unknown>>,
  contacts: [] as Array<{ id: string; full_name: string }>,
  inserts: [] as Array<Record<string, unknown>>,
  updates: [] as Array<{ patch: Record<string, unknown>; where: unknown }>,
  record: vi.fn(),
  audit: vi.fn(),
}));

// Just enough of the query builder for this route: reads resolve to the
// fixtures above, writes are recorded.
function table(name: string) {
  return {
    select: () =>
      Promise.resolve({ data: name === 'contacts' ? h.contacts : h.stored, error: null }),
    insert: (row: Record<string, unknown>) => {
      h.inserts.push(row);
      return {
        select: () => ({
          single: async () => ({
            data: { id: `row-${h.inserts.length}`, contact_id: null, show_on_site: null, removed_at: null, ...row },
            error: null,
          }),
        }),
      };
    },
    update: (patch: Record<string, unknown>) => ({
      eq: async (_col: string, id: string) => {
        h.updates.push({ patch, where: id });
        return { error: null };
      },
      in: async (_col: string, ids: string[]) => {
        h.updates.push({ patch, where: ids });
        return { error: null };
      },
    }),
  };
}

vi.mock('@/lib/supabase/admin', () => ({ supabaseAdmin: () => ({ from: table }) }));
vi.mock('@/lib/queries/outreach', () => ({ getOwnerUserId: async () => 'owner-1' }));
vi.mock('@/lib/google-reviews/record', () => ({ recordReviewOnContact: h.record }));
vi.mock('@/lib/audit', () => ({ writeAudit: h.audit }));

import { POST } from './route';
import { __resetRateLimitForTests } from '@/lib/rate-limit';

const savedKey = process.env.AGENT_API_KEY;

const send = (body: Record<string, unknown>, key = 'agent-key') =>
  POST(
    new Request('https://portal.test/api/agent/google-reviews', {
      method: 'POST',
      headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );

const review = (over: Record<string, unknown> = {}) => ({
  google_review_id: 'g-1',
  reviewer_name: 'Sam Lee',
  rating: 5,
  body: 'Fast and easy to work with.',
  reviewed_at: '2026-10-30T14:00:00-04:00',
  replied: false,
  ...over,
});

const storedRow = (over: Record<string, unknown> = {}) => ({
  id: 'row-1',
  google_review_id: 'g-1',
  reviewer_name: 'Sam Lee',
  reviewer_photo_url: null,
  rating: 5,
  body: 'Fast and easy to work with.',
  reviewed_at: '2026-10-30T18:00:00Z',
  replied: false,
  contact_id: 'contact-1',
  show_on_site: null,
  removed_at: null,
  ...over,
});

beforeEach(() => {
  process.env.AGENT_API_KEY = 'agent-key';
  __resetRateLimitForTests();
  h.stored = [];
  h.contacts = [{ id: 'contact-1', full_name: 'Sam Lee' }];
  h.inserts = [];
  h.updates = [];
  h.record.mockReset();
  h.audit.mockReset();
});

afterAll(() => {
  process.env.AGENT_API_KEY = savedKey;
});

describe('POST /api/agent/google-reviews', () => {
  it('refuses a request without the key', async () => {
    const res = await send({ reviews: [] }, 'wrong');
    expect(res.status).toBe(401);
  });

  it('stores a new review and notes it on the one matching client', async () => {
    const res = await send({ reviews: [review()] });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results).toEqual([
      expect.objectContaining({ status: 'new', contact_id: 'contact-1', on_site: true }),
    ]);
    expect(h.inserts[0]).toMatchObject({ google_review_id: 'g-1' });
    expect(h.record).toHaveBeenCalledWith(
      'contact-1',
      expect.objectContaining({ rating: 5 }),
      'owner-1',
      { via: 'agent' },
    );
    expect(h.updates).toEqual([{ patch: { contact_id: 'contact-1' }, where: 'row-1' }]);
  });

  it('leaves the review unlinked when the client note fails', async () => {
    h.record.mockRejectedValueOnce(new Error('Google review note: db down'));
    const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await send({ reviews: [review()] });
    quiet.mockRestore();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.results[0]).toMatchObject({ status: 'new', contact_id: null });
    expect(h.updates).toEqual([]);
  });

  it('leaves an unmatched reviewer for Kevin and a 3-star review off the site', async () => {
    const res = await send({ reviews: [review({ reviewer_name: 'Pat Kim', rating: 3 })] });
    const body = await res.json();
    expect(body.results[0]).toMatchObject({ status: 'new', contact_id: null, on_site: false });
    expect(h.record).not.toHaveBeenCalled();
  });

  it("updates what changed on Google and keeps Kevin's switch", async () => {
    h.stored = [storedRow({ show_on_site: false })];
    const res = await send({ reviews: [review({ rating: 4, replied: true })] });
    const body = await res.json();
    expect(body.results[0]).toMatchObject({ status: 'updated', on_site: false });
    expect(h.updates).toEqual([{ patch: { rating: 4, replied: true }, where: 'row-1' }]);
    expect(h.record).not.toHaveBeenCalled();
  });

  it('reports an unchanged review without writing', async () => {
    h.stored = [storedRow()];
    const body = await (await send({ reviews: [review()] })).json();
    expect(body.results[0].status).toBe('unchanged');
    expect(h.updates).toEqual([]);
  });

  it('marks a review Google no longer shows as removed', async () => {
    h.stored = [storedRow(), storedRow({ id: 'row-2', google_review_id: 'g-2' })];
    const body = await (await send({ reviews: [review()], complete: true })).json();
    expect(body.removed).toEqual([
      { google_review_id: 'g-2', id: 'row-2', reviewer_name: 'Sam Lee' },
    ]);
    expect(h.updates[0]).toMatchObject({ where: ['row-2'] });
  });

  it('never removes anything on an empty list', async () => {
    h.stored = [storedRow()];
    const body = await (await send({ reviews: [], complete: true })).json();
    expect(body.removed).toEqual([]);
    expect(h.updates).toEqual([]);
  });
});
