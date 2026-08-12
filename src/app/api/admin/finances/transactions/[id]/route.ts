import { z } from 'zod';
import { requireCapability } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { safeError } from '@/lib/safe-error';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';
import { EXPENSE_CATEGORIES } from '@/lib/finances/categories';

export const runtime = 'nodejs';

/**
 * PATCH /api/admin/finances/transactions/[id] — the CRM-owned fields on a
 * mirrored transaction.
 *
 * Only touches columns the Mercury sync deliberately leaves alone, so a
 * categorization survives every future sync. Nothing here writes back to
 * Mercury — the mirror is one-way.
 */
const Schema = z.object({
  category: z.enum(EXPENSE_CATEGORIES).nullable().optional(),
  crm_note: z.string().max(2000).nullable().optional(),
  // Who this payment was for — feeds the payout ledger.
  team_member_id: z.string().uuid().nullable().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireCapability('view_finance');
    const limit = limitByKey(`finances/tx:${session.userId}`, {
      capacity: 120,
      refillPerSec: 2,
    });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);
    const { id } = await params;

    const raw = await req.json().catch(() => ({}));
    const parsed = Schema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid payload', issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const patch: Record<string, unknown> = {};
    if ('category' in parsed.data) patch.category = parsed.data.category ?? null;
    if ('crm_note' in parsed.data) patch.crm_note = parsed.data.crm_note ?? null;
    if ('team_member_id' in parsed.data) {
      patch.team_member_id = parsed.data.team_member_id ?? null;
    }
    if (Object.keys(patch).length === 0) return Response.json({ ok: true });

    const { error } = await supabaseAdmin()
      .from('bank_transactions')
      .update(patch)
      .eq('id', id);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    await writeAudit({
      actor_id: session.userId,
      action: 'update',
      entity_type: 'bank_transaction',
      entity_id: id,
      diff: patch,
    });
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('admin/finances/transactions PATCH', err);
  }
}
