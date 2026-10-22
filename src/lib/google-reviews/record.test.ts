import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  insertResult: { data: null as { id: string } | null, error: null as { message: string } | null },
  audit: vi.fn(),
}));

vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: () => ({
    from: () => ({
      insert: () => ({ select: () => ({ single: async () => h.insertResult }) }),
    }),
  }),
}));
vi.mock('@/lib/audit', () => ({ writeAudit: h.audit }));

import { recordReviewOnContact } from './record';

const review = { id: 'rev-1', rating: 5, body: 'Great work.', reviewed_at: '2026-10-30T18:00:00Z' };

beforeEach(() => {
  h.audit.mockReset();
});

describe('recordReviewOnContact', () => {
  it('writes the Activity line with the new note', async () => {
    h.insertResult = { data: { id: 'note-1' }, error: null };
    await recordReviewOnContact('contact-1', review, 'owner-1', { via: 'agent' });
    expect(h.audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'google_review',
        entity_id: 'contact-1',
        diff: expect.objectContaining({ note_id: 'note-1', google_review: 'rev-1' }),
      }),
    );
  });

  it('throws without an Activity line when the note is not saved', async () => {
    h.insertResult = { data: null, error: { message: 'db down' } };
    await expect(
      recordReviewOnContact('contact-1', review, 'owner-1', { via: 'agent' }),
    ).rejects.toThrow('db down');
    expect(h.audit).not.toHaveBeenCalled();
  });
});
