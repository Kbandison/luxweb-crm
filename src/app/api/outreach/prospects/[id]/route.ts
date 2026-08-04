import { requireCapability } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { safeError } from '@/lib/safe-error';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';
import { UpdateProspectSchema } from '@/lib/validation/outreach';
import type { Session } from '@/lib/supabase/session';

export const runtime = 'nodejs';

/**
 * A setter may only touch prospects on their own list; owner/manager (who
 * also hold manage_outreach but aren't setters) may touch any. Returns the
 * prospect's owner_id, or null when access is denied / the row is missing.
 */
async function accessibleOwnerId(
  session: Session,
  prospectId: string,
): Promise<string | null | undefined> {
  const { data } = await supabaseAdmin()
    .from('prospects')
    .select('owner_id')
    .eq('id', prospectId)
    .maybeSingle();
  if (!data) return undefined; // not found
  const ownerId = (data as { owner_id: string | null }).owner_id;
  if (session.role === 'setter' && ownerId !== session.userId) return undefined;
  return ownerId;
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireCapability('manage_outreach');
    const limit = limitByKey(`outreach/prospects/[id]:${session.userId}`, {
      capacity: 120,
      refillPerSec: 120 / 60,
    });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);
    const { id } = await params;

    if ((await accessibleOwnerId(session, id)) === undefined) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    const raw = await req.json().catch(() => ({}));
    const parsed = UpdateProspectSchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid payload', issues: parsed.error.issues },
        { status: 400 },
      );
    }

    // Reassignment is an owner/manager call — a setter can't move a prospect
    // off their list or pull one onto it.
    if ('owner_id' in parsed.data && session.role === 'setter') {
      return Response.json(
        { error: 'Only the owner can reassign a prospect.' },
        { status: 403 },
      );
    }

    const patch: Record<string, unknown> = {};
    if ('owner_id' in parsed.data) patch.owner_id = parsed.data.owner_id ?? null;
    for (const key of [
      'full_name',
      'company',
      'phone',
      'email',
      'industry',
      'website',
      'website_problem',
      'source',
      'notes',
      'next_action',
      'next_action_at',
      'status',
    ] as const) {
      if (key in parsed.data) patch[key] = parsed.data[key] ?? null;
    }
    if (Object.keys(patch).length === 0) return Response.json({ ok: true });

    const { error } = await supabaseAdmin()
      .from('prospects')
      .update(patch)
      .eq('id', id);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    await writeAudit({
      actor_id: session.userId,
      action: 'update',
      entity_type: 'prospect',
      entity_id: id,
      diff: patch,
    });
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('outreach/prospects/[id] PATCH', err);
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireCapability('manage_outreach');
    const limit = limitByKey(`outreach/prospects/[id]:${session.userId}`, {
      capacity: 120,
      refillPerSec: 120 / 60,
    });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);
    const { id } = await params;

    if ((await accessibleOwnerId(session, id)) === undefined) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    const { error } = await supabaseAdmin().from('prospects').delete().eq('id', id);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    await writeAudit({
      actor_id: session.userId,
      action: 'delete',
      entity_type: 'prospect',
      entity_id: id,
    });
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('outreach/prospects/[id] DELETE', err);
  }
}
