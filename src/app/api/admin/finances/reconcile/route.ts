import { z } from 'zod';
import { requireCapability } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { safeError } from '@/lib/safe-error';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';

/**
 * Link a bank deposit to the invoices it paid, or unlink it.
 *
 * A deposit can cover several invoices (Stripe batches its payouts), so this
 * writes rows in `invoice_reconciliations` rather than setting a column. The
 * gross invoice amount is snapshotted at match time — the gap between that
 * total and the deposit is the processor's fee, derived rather than assumed.
 */
const Schema = z.object({
  transaction_id: z.string().min(1),
  invoice_ids: z.array(z.string().uuid()).min(1).max(50),
});

export async function POST(req: Request) {
  try {
    const session = await requireCapability('view_finance');
    const limit = limitByKey(`finances/reconcile:${session.userId}`, {
      capacity: 60,
      refillPerSec: 1,
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
    const { transaction_id, invoice_ids } = parsed.data;
    const sb = supabaseAdmin();

    // Snapshot the gross amounts, and refuse anything that isn't a paid
    // invoice — reconciling against a draft would silently invent revenue.
    const { data: invoices } = await sb
      .from('invoices')
      .select('id, amount_cents, status')
      .in('id', invoice_ids);
    const rows = ((invoices ?? []) as Record<string, unknown>[]).filter(
      (i) => i.status === 'paid',
    );
    if (rows.length !== invoice_ids.length) {
      return Response.json(
        { error: 'Some invoices are missing or not marked paid.' },
        { status: 400 },
      );
    }

    const { error } = await sb.from('invoice_reconciliations').insert(
      rows.map((i) => ({
        transaction_id,
        invoice_id: i.id as string,
        amount_cents: Number(i.amount_cents ?? 0),
        matched_by: session.userId,
      })),
    );
    if (error) {
      // The unique constraint on invoice_id is the real guard here: an invoice
      // already attributed to another deposit can't be counted twice.
      const duplicate = error.message.toLowerCase().includes('duplicate');
      return Response.json(
        {
          error: duplicate
            ? 'One of those invoices is already matched to another deposit.'
            : error.message,
        },
        { status: duplicate ? 409 : 500 },
      );
    }

    await sb
      .from('bank_transactions')
      .update({ reconciled_at: new Date().toISOString() })
      .eq('id', transaction_id);

    await writeAudit({
      actor_id: session.userId,
      action: 'update',
      entity_type: 'bank_reconciliation',
      entity_id: transaction_id,
      diff: { invoice_ids },
    });

    return Response.json({ ok: true, matched: rows.length });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('admin/finances/reconcile POST', err);
  }
}

/** Undo a match, so a mistake can be corrected rather than lived with. */
export async function DELETE(req: Request) {
  try {
    const session = await requireCapability('view_finance');
    const transactionId = new URL(req.url).searchParams.get('transaction_id');
    if (!transactionId) {
      return Response.json({ error: 'transaction_id required' }, { status: 400 });
    }

    const sb = supabaseAdmin();
    const { error } = await sb
      .from('invoice_reconciliations')
      .delete()
      .eq('transaction_id', transactionId);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    await sb
      .from('bank_transactions')
      .update({ reconciled_at: null })
      .eq('id', transactionId);

    await writeAudit({
      actor_id: session.userId,
      action: 'update',
      entity_type: 'bank_reconciliation',
      entity_id: transactionId,
      diff: { unmatched: true },
    });

    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('admin/finances/reconcile DELETE', err);
  }
}
