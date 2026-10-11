import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  row: null as Record<string, unknown> | null,
  prefs: {} as Record<string, boolean>,
  clientUserId: 'client-user' as string | null,
  notify: vi.fn(),
  invite: vi.fn(),
  audit: vi.fn(),
}));

vi.mock('@/lib/auth/guards', () => ({
  requireCapability: vi.fn(async () => ({ userId: 'admin-1', role: 'owner' })),
}));
vi.mock('@/lib/supabase/admin', () => ({
  supabaseAdmin: () => ({
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: table === 'users' ? { email_prefs: h.prefs } : h.row,
          }),
        }),
      }),
    }),
  }),
}));
vi.mock('@/lib/notifications', () => ({
  notify: h.notify,
  getContactUserId: vi.fn(async () => h.clientUserId),
}));
vi.mock('@/lib/invites', () => ({ sendPortalInvite: h.invite }));
vi.mock('@/lib/audit', () => ({ writeAudit: h.audit }));

import { POST } from './route';

const future = new Date(Date.now() + 7 * 86_400_000).toISOString();
let n = 0;

function openContract(overrides: Record<string, unknown> = {}) {
  // A fresh id per test so the per-agreement rate limit starts full.
  n += 1;
  return {
    id: `contract-${n}`,
    status: 'pending_client_signature',
    contact_id: 'contact-1',
    proposal_id: 'proposal-1',
    content_snapshot: { client: { name: 'Jane Doe' } },
    proposals: { title: 'Website build', status: 'sent', expires_at: future, content_json: null },
    ...overrides,
  };
}

const call = (id: string) =>
  POST(new Request(`https://portal.test/api/admin/contracts/${id}/resend`, { method: 'POST' }), {
    params: Promise.resolve({ id }),
  });

beforeEach(() => {
  h.notify.mockReset();
  h.invite.mockReset();
  h.audit.mockReset();
  h.clientUserId = 'client-user';
  h.prefs = {};
});

describe('POST /api/admin/contracts/[id]/resend', () => {
  it('emails a client with portal access the same agreement link again', async () => {
    h.row = openContract();
    const res = await call(h.row.id as string);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, via: 'email' });
    expect(h.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'contract_pending_client_signature',
        userId: 'client-user',
        contractPath: `/portal/contracts/${h.row.id}`,
        clientName: 'Jane Doe',
        title: 'Website build',
        expiresAt: future,
      }),
    );
    expect(h.audit).toHaveBeenCalledWith(expect.objectContaining({ action: 'resend', diff: { via: 'email' } }));
  });

  it('sends a fresh portal invite when the client has no account yet', async () => {
    h.row = openContract();
    h.clientUserId = null;
    h.invite.mockResolvedValue({ ok: true, userId: 'u', resend: true });
    const res = await call(h.row.id as string);
    expect(await res.json()).toEqual({ ok: true, via: 'invite' });
    expect(h.invite).toHaveBeenCalledWith(expect.objectContaining({ contactId: 'contact-1' }));
    expect(h.notify).not.toHaveBeenCalled();
  });

  it("says so when the client turned these emails off, instead of claiming it sent", async () => {
    h.row = openContract();
    h.prefs = { contract_pending_client_signature: false };
    const res = await call(h.row.id as string);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/turned off agreement emails/);
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('refuses a signed agreement', async () => {
    h.row = openContract({ status: 'signed' });
    const res = await call(h.row.id as string);
    expect(res.status).toBe(409);
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('refuses an expired one and points at Revise & resend', async () => {
    h.row = openContract({
      proposals: { title: 'Website build', status: 'sent', expires_at: new Date(Date.now() - 1000).toISOString(), content_json: null },
    });
    const res = await call(h.row.id as string);
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/Revise & resend/);
    expect(h.notify).not.toHaveBeenCalled();
  });

  it('allows three resends an hour per agreement', async () => {
    h.row = openContract();
    const id = h.row.id as string;
    for (let i = 0; i < 3; i++) expect((await call(id)).status).toBe(200);
    expect((await call(id)).status).toBe(429);
    expect(h.notify).toHaveBeenCalledTimes(3);
  });
});
