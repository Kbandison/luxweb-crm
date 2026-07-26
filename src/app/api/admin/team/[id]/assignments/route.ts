import { requireCapability } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { safeError } from '@/lib/safe-error';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';
import { CreateAssignmentSchema } from '@/lib/validation/team';

export const runtime = 'nodejs';

/**
 * POST /api/admin/team/[id]/assignments — assign a team member to a project.
 * Requires `manage_team`. The (project, member) pair is unique; a duplicate
 * assignment is treated as a no-op success.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireCapability('manage_team');
    const limit = limitByKey(`admin/team/assignments:${session.userId}`, {
      capacity: 120,
      refillPerSec: 120 / 60,
    });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);
    const { id: teamMemberId } = await params;

    const raw = await req.json().catch(() => ({}));
    const parsed = CreateAssignmentSchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid payload', issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const sb = supabaseAdmin();
    // Guard the FK/soft errors with clear messages.
    const { data: member } = await sb
      .from('team_members')
      .select('id')
      .eq('id', teamMemberId)
      .single();
    if (!member) {
      return Response.json({ error: 'Team member not found' }, { status: 404 });
    }

    const { data, error } = await sb
      .from('project_assignments')
      .upsert(
        {
          team_member_id: teamMemberId,
          project_id: parsed.data.project_id,
          role_on_project: parsed.data.role_on_project ?? null,
        },
        { onConflict: 'project_id,team_member_id', ignoreDuplicates: true },
      )
      .select('id')
      .maybeSingle();

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    await writeAudit({
      actor_id: session.userId,
      action: 'create',
      entity_type: 'project_assignment',
      entity_id: (data as { id: string } | null)?.id,
      diff: { team_member_id: teamMemberId, project_id: parsed.data.project_id },
    });

    return Response.json({ ok: true, id: (data as { id: string } | null)?.id ?? null });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('admin/team/[id]/assignments POST', err);
  }
}
