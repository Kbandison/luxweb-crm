import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { withdrawUnsigned } from '@/lib/contracts/after-sign';

export const runtime = 'nodejs';

/**
 * Cron: flip `sent` agreements past their `expires_at` to `expired`, and
 * void the unsigned contracts that went out with them. Send sets the expiry
 * (14 days by default); signing also refuses an expired agreement on its
 * own, so the window between expiry and this daily run is closed too.
 *
 * Scheduled daily via vercel.json. Protected by `CRON_SECRET` env var
 * (Vercel-style Bearer token). Without the secret set, the endpoint
 * fails closed to avoid arbitrary callers triggering a mass status flip.
 */
export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return Response.json(
      { error: 'CRON_SECRET not configured' },
      { status: 500 },
    );
  }
  if (req.headers.get('authorization') !== `Bearer ${expected}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = supabaseAdmin();
  const nowIso = new Date().toISOString();

  // Find sent proposals past their expiry. expires_at is nullable — only
  // those with an explicit expiry are eligible.
  const { data, error } = await sb
    .from('proposals')
    .select('id')
    .eq('status', 'sent')
    .not('expires_at', 'is', null)
    .lt('expires_at', nowIso);

  if (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }

  // Change orders lapse the same way. Nothing else changes when one does —
  // the agreement it would have amended stands as signed.
  const { data: lapsedOrders } = await sb
    .from('change_orders')
    .update({ status: 'expired' })
    .eq('status', 'sent')
    .not('expires_at', 'is', null)
    .lt('expires_at', nowIso)
    .select('id');
  for (const order of (lapsedOrders ?? []) as { id: string }[]) {
    await writeAudit({
      actor_id: null,
      action: 'update',
      entity_type: 'change_order',
      entity_id: order.id,
      diff: { auto_expired: true, at: nowIso },
    });
  }
  const expiredOrders = (lapsedOrders ?? []).length;

  const rows = (data ?? []) as { id: string }[];
  if (rows.length === 0) {
    return Response.json({ ok: true, expired: 0, expired_change_orders: expiredOrders });
  }

  const ids = rows.map((r) => r.id);
  const { error: updErr } = await sb
    .from('proposals')
    .update({ status: 'expired' })
    .in('id', ids);

  if (updErr) {
    return Response.json({ error: updErr.message }, { status: 500 });
  }

  // An expired offer can't be signed: void the unsigned contract that went
  // out with it. The client was told the expiry date when it was sent, and
  // the agreement page shows it as expired, so no email.
  for (const id of ids) {
    await withdrawUnsigned({
      proposalId: id,
      reason: 'Expired',
      actorId: null,
      notifyClient: false,
    });
  }

  // Audit log each expiration so the admin trail explains the status
  // change. Non-throwing — best effort.
  for (const id of ids) {
    await writeAudit({
      // Cron has no actor; AuditEntry.actor_id type is fixed in batch R-H.
      actor_id: null,
      action: 'update',
      entity_type: 'proposal',
      entity_id: id,
      diff: { auto_expired: true, at: nowIso },
    });
  }

  return Response.json({ ok: true, expired: ids.length, expired_change_orders: expiredOrders });
}
