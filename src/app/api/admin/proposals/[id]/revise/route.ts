import { requireCapability } from '@/lib/auth/guards';
import { revalidateProject } from '@/lib/cache/revalidate-project';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { safeError } from '@/lib/safe-error';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';
import { withdrawUnsigned } from '@/lib/contracts/after-sign';

export const runtime = 'nodejs';

/**
 * Pull a sent (or expired) agreement back to draft so it can be edited and
 * re-sent. Snapshots the prior content into the audit log, and voids the
 * unsigned contract that went out with it — the client's link stops
 * working, and they're told an updated version is coming. Re-sending signs
 * and issues a fresh contract.
 *
 * Allowed transitions:
 *   sent    → draft (revision counter bumps)
 *   expired → draft (same — reopen a lapsed offer with fresh terms)
 *
 * Accepted (signed) agreements stay locked; declined ones too.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireCapability('manage_proposals');
    const limit = limitByKey(`admin/proposals/[id]/revise:${session.userId}`, { capacity: 60, refillPerSec: 60 / 60 });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);
    const { id } = await params;
    const sb = supabaseAdmin();

    const { data: before } = await sb
      .from('proposals')
      .select('id, status, title, content_json, revision, sent_at, project_id')
      .eq('id', id)
      .single();

    if (!before) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    const fromStatus = before.status as string;
    if (fromStatus !== 'sent' && fromStatus !== 'expired') {
      return Response.json(
        {
          error: `Agreement is ${fromStatus}; only sent or expired agreements can be revised.`,
        },
        { status: 409 },
      );
    }

    const prevRevision = (before.revision as number | null) ?? 1;
    const nextRevision = prevRevision + 1;

    // Snapshot the content the client saw under that revision so we can
    // always reconstruct what was on the table at any prior send.
    await writeAudit({
      actor_id: session.userId,
      action: 'snapshot',
      entity_type: 'proposal',
      entity_id: id,
      diff: {
        revision: prevRevision,
        title: before.title,
        content: before.content_json,
        previously_sent_at: before.sent_at,
      },
    });

    const { data: revisedRows, error } = await sb
      .from('proposals')
      .update({
        status: 'draft',
        revision: nextRevision,
        // Cleared so the next Send writes fresh ones.
        sent_at: null,
        expires_at: null,
      })
      .eq('id', id)
      .eq('status', fromStatus)
      .select('id');

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }
    if ((revisedRows ?? []).length === 0) {
      return Response.json(
        { error: 'The agreement changed while you were revising — reload and try again.' },
        { status: 409 },
      );
    }

    // The contract that went out with it can no longer be signed. A client
    // holding a link to a still-open offer is told; an expired one already
    // lapsed, so there's nothing new to tell them.
    await withdrawUnsigned({
      proposalId: id,
      reason: 'Withdrawn so we can send you an updated version.',
      actorId: session.userId,
      notifyClient: fromStatus === 'sent',
    });

    await writeAudit({
      actor_id: session.userId,
      action: 'revise',
      entity_type: 'proposal',
      entity_id: id,
      diff: {
        status: { from: fromStatus, to: 'draft' },
        revision: { from: prevRevision, to: nextRevision },
      },
    });

    const projectId = before.project_id as string | null;
    if (projectId) revalidateProject(projectId);

    return Response.json({ ok: true, revision: nextRevision });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('admin/proposals/[id]/revise', err);
  }
}
