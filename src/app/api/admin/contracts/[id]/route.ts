import { z } from 'zod';
import { requireCapability } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { revalidateProject } from '@/lib/cache/revalidate-project';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const Schema = z.object({
  /** Why it was voided — required, it's the only explanation the record has. */
  reason: z.string().trim().min(3).max(500),
});

/**
 * Void a contract.
 *
 * - Signed contracts can be voided (e.g. mutual termination) but the
 *   record is preserved for legal trail — including who voided it, when,
 *   and why.
 * - Voiding does NOT free the proposal for deletion: a contract keeps its
 *   proposal (FK is ON DELETE RESTRICT).
 * - We use DELETE semantics in the URL but set status = 'void' instead of
 *   hard-deleting; the row remains queryable by audit/compliance.
 */
export async function DELETE(
  req: Request,
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

    const raw = await req.json().catch(() => ({}));
    const parsed = Schema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: 'Give a reason for voiding this contract.' },
        { status: 400 },
      );
    }
    const { reason } = parsed.data;

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

    const voidedAt = new Date().toISOString();
    const { error } = await sb
      .from('contracts')
      .update({
        status: 'void',
        voided_at: voidedAt,
        voided_by: session.userId,
        void_reason: reason,
      })
      .eq('id', id)
      .neq('status', 'void');
    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    // Filed under the contract — it used to be logged as a 'proposal'
    // entity carrying the contract's id, so it never showed up in the
    // contract's history.
    await writeAudit({
      actor_id: session.userId,
      action: 'void',
      entity_type: 'contract',
      entity_id: id,
      diff: {
        from_status: row.status,
        proposal_id: row.proposal_id,
        reason,
        voided_at: voidedAt,
      },
    });

    if (row.project_id) revalidateProject(row.project_id);

    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
