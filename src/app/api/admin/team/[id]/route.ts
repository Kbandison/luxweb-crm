import { requireCapability } from '@/lib/auth/guards';
import { hasCapability } from '@/lib/auth/permissions';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { safeError } from '@/lib/safe-error';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';
import { UpdateTeamMemberSchema } from '@/lib/validation/team';

export const runtime = 'nodejs';

/**
 * PATCH /api/admin/team/[id] — update a team member. Requires `manage_team`.
 * Changing the access role keeps a linked auth user's crm.users.role in sync
 * so access follows the assignment immediately. Promoting to the owner-level
 * `admin` role requires `assign_owner_role`.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireCapability('manage_team');
    const limit = limitByKey(`admin/team/[id]:${session.userId}`, {
      capacity: 60,
      refillPerSec: 60 / 60,
    });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);
    const { id } = await params;

    const raw = await req.json().catch(() => ({}));
    const parsed = UpdateTeamMemberSchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid payload', issues: parsed.error.issues },
        { status: 400 },
      );
    }

    if (parsed.data.role === 'admin' && !hasCapability(session.role, 'assign_owner_role')) {
      return Response.json(
        { error: 'Only an owner can grant the Owner role.' },
        { status: 403 },
      );
    }

    const sb = supabaseAdmin();
    const { data: existing } = await sb
      .from('team_members')
      .select('id, user_id, role')
      .eq('id', id)
      .single();
    if (!existing) {
      return Response.json({ error: 'Team member not found' }, { status: 404 });
    }

    // Only write the fields that were provided.
    const patch: Record<string, unknown> = {};
    for (const key of [
      'full_name',
      'email',
      'phone',
      'title',
      'role',
      'employment_type',
      'status',
      'rate_cents',
      'rate_type',
      'notes',
    ] as const) {
      if (key in parsed.data) patch[key] = parsed.data[key] ?? null;
    }
    if (Object.keys(patch).length === 0) {
      return Response.json({ ok: true });
    }

    const { error } = await sb.from('team_members').update(patch).eq('id', id);
    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    // Keep the linked login's role in sync when the access role changes.
    const newRole = parsed.data.role;
    const linkedUserId = (existing as { user_id: string | null }).user_id;
    if (newRole && newRole !== (existing as { role: string }).role && linkedUserId) {
      await sb.from('users').update({ role: newRole }).eq('id', linkedUserId);
    }

    await writeAudit({
      actor_id: session.userId,
      action: 'update',
      entity_type: 'team_member',
      entity_id: id,
      diff: patch,
    });

    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('admin/team/[id] PATCH', err);
  }
}

/**
 * DELETE /api/admin/team/[id] — remove a team member from the roster.
 * Assignments cascade. If the member had a login, we downgrade their
 * crm.users.role to 'client' so removal revokes internal access immediately
 * (the auth account itself is left for a separate, deliberate deletion).
 * Prefer setting status='inactive' when you only want to hide someone.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireCapability('manage_team');
    const limit = limitByKey(`admin/team/[id]:${session.userId}`, {
      capacity: 60,
      refillPerSec: 60 / 60,
    });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);
    const { id } = await params;

    const sb = supabaseAdmin();
    const { data: member } = await sb
      .from('team_members')
      .select('id, user_id, role')
      .eq('id', id)
      .single();
    if (!member) {
      return Response.json({ error: 'Team member not found' }, { status: 404 });
    }

    const linkedUserId = (member as { user_id: string | null }).user_id;
    if (linkedUserId) {
      await sb.from('users').update({ role: 'client' }).eq('id', linkedUserId);
    }

    const { error } = await sb.from('team_members').delete().eq('id', id);
    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    await writeAudit({
      actor_id: session.userId,
      action: 'delete',
      entity_type: 'team_member',
      entity_id: id,
      diff: { revoked_login: Boolean(linkedUserId) },
    });

    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('admin/team/[id] DELETE', err);
  }
}
