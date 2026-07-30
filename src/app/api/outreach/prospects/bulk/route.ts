import { requireCapability } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { safeError } from '@/lib/safe-error';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';
import { BulkProspectSchema } from '@/lib/validation/outreach';

export const runtime = 'nodejs';

/**
 * POST /api/outreach/prospects/bulk — act on a selection from the call list.
 * Retiring 200 bad rows from an import shouldn't mean 200 clicks.
 *
 * A setter's selection is silently narrowed to prospects they own, so a
 * crafted request can't reach someone else's list. Reassignment is
 * owner/manager only.
 */
export async function POST(req: Request) {
  try {
    const session = await requireCapability('manage_outreach');
    const limit = limitByKey(`outreach/bulk:${session.userId}`, {
      capacity: 20,
      refillPerSec: 20 / 60,
    });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);

    const raw = await req.json().catch(() => ({}));
    const parsed = BulkProspectSchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid payload', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const { ids, action } = parsed.data;

    if (action === 'reassign') {
      if (session.role === 'setter') {
        return Response.json(
          { error: 'Only the owner can reassign prospects.' },
          { status: 403 },
        );
      }
      if (!parsed.data.owner_id) {
        return Response.json({ error: 'Pick a setter to reassign to.' }, { status: 400 });
      }
    }

    const sb = supabaseAdmin();
    // Narrow to what this session may actually touch.
    let scope = sb.from('prospects').select('id').in('id', ids);
    if (session.role === 'setter') scope = scope.eq('owner_id', session.userId);
    const { data: allowed } = await scope;
    const allowedIds = ((allowed ?? []) as { id: string }[]).map((r) => r.id);
    if (allowedIds.length === 0) {
      return Response.json({ affected: 0 });
    }

    if (action === 'delete') {
      const { error } = await sb.from('prospects').delete().in('id', allowedIds);
      if (error) return Response.json({ error: error.message }, { status: 500 });
    } else {
      const patch: Record<string, unknown> =
        action === 'reassign'
          ? { owner_id: parsed.data.owner_id }
          : { status: action };
      const { error } = await sb.from('prospects').update(patch).in('id', allowedIds);
      if (error) return Response.json({ error: error.message }, { status: 500 });
    }

    await writeAudit({
      actor_id: session.userId,
      action: action === 'delete' ? 'delete' : 'update',
      entity_type: 'prospect_bulk',
      diff: { action, count: allowedIds.length, owner_id: parsed.data.owner_id ?? null },
    });

    return Response.json({ affected: allowedIds.length });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('outreach/prospects/bulk', err);
  }
}
