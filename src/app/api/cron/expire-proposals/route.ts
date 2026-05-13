import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';

export const runtime = 'nodejs';

/**
 * Cron: flip `sent` proposals past their `expires_at` to `expired`.
 *
 * Scheduled hourly via vercel.json. Protected by `CRON_SECRET` env var
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

  const rows = (data ?? []) as { id: string }[];
  if (rows.length === 0) {
    return Response.json({ ok: true, expired: 0 });
  }

  const ids = rows.map((r) => r.id);
  const { error: updErr } = await sb
    .from('proposals')
    .update({ status: 'expired' })
    .in('id', ids);

  if (updErr) {
    return Response.json({ error: updErr.message }, { status: 500 });
  }

  // Audit log each expiration so the admin trail explains the status
  // change. Non-throwing — best effort.
  for (const id of ids) {
    await writeAudit({
      // Cron has no actor; AuditEntry.actor_id type is fixed in batch R-H.
      actor_id: null as unknown as string,
      action: 'update',
      entity_type: 'proposal',
      entity_id: id,
      diff: { auto_expired: true, at: nowIso },
    });
  }

  return Response.json({ ok: true, expired: ids.length });
}
