import { z } from 'zod';
import { requireCapability } from '@/lib/auth/guards';
import { hasCapability, type Role } from '@/lib/auth/permissions';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { safeError } from '@/lib/safe-error';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';

// owner_id: a user id to assign, or null to unassign.
const Schema = z.object({
  owner_id: z.string().uuid().nullable(),
});

/**
 * PATCH /api/admin/contacts/[id]/owner — (re)assign a lead's owner. Requires
 * `manage_leads`. Sets contacts.owner_id and keeps the contact's deals'
 * owner_id in sync so the pipeline reflects the same owner. The target must
 * be an internal user who can own leads (or null to unassign).
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireCapability('manage_leads');
    const limit = limitByKey(`admin/contacts/owner:${session.userId}`, {
      capacity: 60,
      refillPerSec: 60 / 60,
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

    const sb = supabaseAdmin();
    const newOwnerId = parsed.data.owner_id;

    // Validate the target can own a lead (defense against assigning to a
    // client or a non-existent user).
    if (newOwnerId) {
      const { data: user } = await sb
        .from('users')
        .select('role')
        .eq('id', newOwnerId)
        .maybeSingle();
      const role = (user as { role: Role } | null)?.role;
      const canOwn =
        !!role &&
        (hasCapability(role, 'manage_leads') ||
          hasCapability(role, 'manage_own_leads'));
      if (!canOwn) {
        return Response.json(
          { error: 'That person can’t be a lead owner.' },
          { status: 400 },
        );
      }
    }

    const { error } = await sb
      .from('contacts')
      .update({ owner_id: newOwnerId })
      .eq('id', id);
    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    // Keep the pipeline in sync — the contact's deals share the owner.
    await sb.from('deals').update({ owner_id: newOwnerId }).eq('contact_id', id);

    await writeAudit({
      actor_id: session.userId,
      action: 'update',
      entity_type: 'contact',
      entity_id: id,
      diff: { owner_id: newOwnerId },
    });

    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('admin/contacts/[id]/owner PATCH', err);
  }
}
