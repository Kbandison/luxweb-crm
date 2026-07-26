import { requireCapability } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { revalidateProject } from '@/lib/cache/revalidate-project';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';

/**
 * Void a contract.
 *
 * - Signed contracts can be voided (e.g. mutual termination) but the
 *   record is preserved for legal trail.
 * - Voiding unblocks proposal deletion (DELETE /api/admin/proposals/[id]
 *   refuses while any contract still references the proposal).
 * - We use DELETE semantics in the URL but set status = 'void' instead of
 *   hard-deleting; the row remains queryable by audit/compliance.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireCapability('manage_contracts');
    const { id } = await params;

    const limit = limitByKey(`contract-void:${session.userId}`, {
      capacity: 20,
      refillPerSec: 20 / 60,
    });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);

    const sb = supabaseAdmin();
    const { data: current } = await sb
      .from('contracts')
      .select('id, status, project_id, proposal_id')
      .eq('id', id)
      .maybeSingle();
    if (!current) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    const row = current as {
      id: string;
      status: string;
      project_id: string | null;
      proposal_id: string | null;
    };
    if (row.status === 'void') {
      return Response.json({ ok: true, already_void: true });
    }

    const { error } = await sb
      .from('contracts')
      .update({ status: 'void' })
      .eq('id', id);
    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    await writeAudit({
      actor_id: session.userId,
      action: 'update',
      entity_type: 'proposal',
      entity_id: id,
      diff: { contract_void: true, from_status: row.status, proposal_id: row.proposal_id },
    });

    if (row.project_id) revalidateProject(row.project_id);

    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
