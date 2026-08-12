import { z } from 'zod';
import { requireCapability } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { safeError } from '@/lib/safe-error';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';
import {
  MAX_PAYOUT_CENTS,
  PAYMENT_METHODS,
  paymentsEnabled,
  requestSendMoney,
} from '@/lib/mercury/payments';

export const runtime = 'nodejs';

/**
 * POST /api/admin/finances/payments — queue a payout for approval in Mercury.
 *
 * The row is written FIRST and its id is sent to Mercury as the idempotency
 * key, so a retry, a double-click, or a network timeout that actually
 * succeeded can never produce a second payout. If Mercury rejects it the row
 * stays as 'failed' with the reason rather than disappearing — a payment
 * that might have been sent must never vanish from the record.
 *
 * Requires `manage_billing`, which is stricter than the read-only finance
 * pages: accountants can see the books but can't queue money.
 */
const Schema = z.object({
  account_id: z.string().min(1),
  recipient_id: z.string().min(1),
  recipient_name: z.string().max(200).optional().nullable(),
  amount_cents: z.number().int().positive().max(MAX_PAYOUT_CENTS),
  payment_method: z.enum(PAYMENT_METHODS).default('ach'),
  memo: z.string().max(300).optional().nullable(),
  note: z.string().max(2000).optional().nullable(),
  team_member_id: z.string().uuid().optional().nullable(),
});

export async function POST(req: Request) {
  try {
    const session = await requireCapability('manage_billing');
    // Invisible unless deliberately switched on — same answer as an unknown
    // route, so a probe learns nothing about whether payouts exist.
    if (!paymentsEnabled()) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    const limit = limitByKey(`finances/payments:${session.userId}`, {
      capacity: 10,
      refillPerSec: 10 / 60,
    });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);

    const raw = await req.json().catch(() => ({}));
    const parsed = Schema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid payload', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const d = parsed.data;
    const sb = supabaseAdmin();

    // 1. Record the intent before touching Mercury.
    const { data: created, error: insertErr } = await sb
      .from('payment_requests')
      .insert({
        amount_cents: d.amount_cents,
        memo: d.memo ?? null,
        note: d.note ?? null,
        account_id: d.account_id,
        recipient_id: d.recipient_id,
        recipient_name: d.recipient_name ?? null,
        payment_method: d.payment_method,
        team_member_id: d.team_member_id ?? null,
        requested_by: session.userId,
        status: 'draft',
      })
      .select('id')
      .single();
    if (insertErr || !created) {
      return Response.json(
        { error: insertErr?.message ?? 'Could not record the request' },
        { status: 500 },
      );
    }
    const id = (created as { id: string }).id;

    // 2. Queue it with Mercury, using the row id as the idempotency key.
    try {
      const result = await requestSendMoney({
        accountId: d.account_id,
        recipientId: d.recipient_id,
        amountCents: d.amount_cents,
        paymentMethod: d.payment_method,
        idempotencyKey: id,
        note: d.note,
        externalMemo: d.memo,
      });

      await sb
        .from('payment_requests')
        .update({
          status: 'submitted',
          mercury_request_id: result.requestId,
          submitted_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', id);

      await writeAudit({
        actor_id: session.userId,
        action: 'create',
        entity_type: 'payment_request',
        entity_id: id,
        diff: {
          amount_cents: d.amount_cents,
          recipient: d.recipient_name ?? d.recipient_id,
          mercury_request_id: result.requestId,
        },
      });

      return Response.json({
        id,
        status: result.status,
        mercury_request_id: result.requestId,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Mercury rejected the request';
      // Keep the row. A vanished payment request is worse than a failed one.
      await sb
        .from('payment_requests')
        .update({ status: 'failed', error: message, updated_at: new Date().toISOString() })
        .eq('id', id);
      return Response.json({ id, error: message }, { status: 502 });
    }
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('admin/finances/payments', err);
  }
}
