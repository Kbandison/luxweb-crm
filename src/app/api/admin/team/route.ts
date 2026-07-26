import { requireCapability } from '@/lib/auth/guards';
import { hasCapability } from '@/lib/auth/permissions';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { safeError } from '@/lib/safe-error';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';
import { CreateTeamMemberSchema } from '@/lib/validation/team';

export const runtime = 'nodejs';

/**
 * POST /api/admin/team — create a team member (roster record). Requires the
 * `manage_team` capability (owner + scoped-admin). Granting the owner-level
 * `admin` role additionally requires `assign_owner_role` (owner only) so a
 * scoped admin can't mint new owners.
 */
export async function POST(req: Request) {
  try {
    const session = await requireCapability('manage_team');
    const limit = limitByKey(`admin/team:${session.userId}`, {
      capacity: 60,
      refillPerSec: 60 / 60,
    });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);

    const raw = await req.json().catch(() => ({}));
    const parsed = CreateTeamMemberSchema.safeParse(raw);
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
    const { data, error } = await sb
      .from('team_members')
      .insert({
        full_name: parsed.data.full_name,
        email: parsed.data.email ?? null,
        phone: parsed.data.phone ?? null,
        title: parsed.data.title ?? null,
        role: parsed.data.role,
        employment_type: parsed.data.employment_type,
        status: parsed.data.status ?? 'active',
        rate_cents: parsed.data.rate_cents ?? null,
        rate_type: parsed.data.rate_type ?? 'hourly',
        notes: parsed.data.notes ?? null,
      })
      .select('id')
      .single();

    if (error || !data) {
      return Response.json(
        { error: error?.message ?? 'Insert failed' },
        { status: 500 },
      );
    }

    const id = (data as { id: string }).id;
    await writeAudit({
      actor_id: session.userId,
      action: 'create',
      entity_type: 'team_member',
      entity_id: id,
      diff: { role: parsed.data.role, employment_type: parsed.data.employment_type },
    });

    return Response.json({ id });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('admin/team POST', err);
  }
}
