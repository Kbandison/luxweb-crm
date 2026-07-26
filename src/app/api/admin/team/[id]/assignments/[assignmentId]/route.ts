import { requireCapability } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { safeError } from '@/lib/safe-error';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';

/**
 * DELETE /api/admin/team/[id]/assignments/[assignmentId] — unassign a team
 * member from a project. Requires `manage_team`. Scoped by team member id so
 * an assignment id from another member can't be removed via this path.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; assignmentId: string }> },
) {
  try {
    const session = await requireCapability('manage_team');
    const limit = limitByKey(`admin/team/assignments:${session.userId}`, {
      capacity: 120,
      refillPerSec: 120 / 60,
    });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);
    const { id: teamMemberId, assignmentId } = await params;

    const { error } = await supabaseAdmin()
      .from('project_assignments')
      .delete()
      .eq('id', assignmentId)
      .eq('team_member_id', teamMemberId);
    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    await writeAudit({
      actor_id: session.userId,
      action: 'delete',
      entity_type: 'project_assignment',
      entity_id: assignmentId,
      diff: { team_member_id: teamMemberId },
    });

    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('admin/team/[id]/assignments/[assignmentId] DELETE', err);
  }
}
