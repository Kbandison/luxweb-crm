import { requireAdmin } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { notify, getContactUserId } from '@/lib/notifications';
import { revalidateProject } from '@/lib/cache/revalidate-project';

export const runtime = 'nodejs';

/**
 * Submit a milestone to the client for approval.
 *
 *   - Flips milestone status pending → in_progress
 *   - Creates a revision_request (status='pending_review') tied to the
 *     milestone via milestone_id, so the client sees an approval card
 *     in their portal
 *   - Notifies the client (in-app + email)
 *
 * Idempotent against re-submits: if a pending_review revision already
 * exists for this milestone, returns its id without creating a duplicate.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string; milestoneId: string }> },
) {
  try {
    const session = await requireAdmin();
    const { id: projectId, milestoneId } = await params;
    const sb = supabaseAdmin();

    const { data: m } = await sb
      .from('milestones')
      .select('id, project_id, title, status')
      .eq('id', milestoneId)
      .maybeSingle();
    if (!m) {
      return Response.json({ error: 'Milestone not found' }, { status: 404 });
    }
    type MRow = {
      project_id: string;
      title: string;
      status: string;
    };
    const mr = m as unknown as MRow;
    if (mr.project_id !== projectId) {
      return Response.json(
        { error: 'Milestone does not belong to this project.' },
        { status: 400 },
      );
    }
    if (mr.status === 'in_progress') {
      // Already submitted — return the existing pending_review row.
      const { data: existing } = await sb
        .from('revision_requests')
        .select('id')
        .eq('milestone_id', milestoneId)
        .eq('status', 'pending_review')
        .limit(1)
        .maybeSingle();
      return Response.json({
        ok: true,
        revision_id: (existing as { id: string } | null)?.id ?? null,
        already_submitted: true,
      });
    }
    if (mr.status === 'done') {
      return Response.json(
        { error: 'Milestone is already done.' },
        { status: 409 },
      );
    }

    // Project context — needed for notify + ownership.
    const { data: project } = await sb
      .from('projects')
      .select('id, name, contact_id')
      .eq('id', projectId)
      .maybeSingle();
    type ProjRow = { name: string; contact_id: string };
    const p = project as unknown as ProjRow | null;
    if (!p) {
      return Response.json({ error: 'Project not found' }, { status: 404 });
    }

    // Flip milestone status.
    const { error: updErr } = await sb
      .from('milestones')
      .update({ status: 'in_progress' })
      .eq('id', milestoneId);
    if (updErr) {
      return Response.json({ error: updErr.message }, { status: 500 });
    }

    // Open the approval request.
    const { data: rev, error: revErr } = await sb
      .from('revision_requests')
      .insert({
        project_id: projectId,
        milestone_id: milestoneId,
        contact_id: p.contact_id,
        title: `Review: ${mr.title}`,
        body: `The team has marked "${mr.title}" ready for your review. Approve to advance the project, or request changes with feedback.`,
        status: 'pending_review',
      })
      .select('id')
      .single();
    if (revErr || !rev) {
      // Roll back the milestone status flip so we don't leave it in a
      // half-submitted state with no review row to act on.
      await sb
        .from('milestones')
        .update({ status: 'pending' })
        .eq('id', milestoneId);
      return Response.json(
        { error: revErr?.message ?? 'Failed to open review.' },
        { status: 500 },
      );
    }

    const revisionId = (rev as { id: string }).id;

    await writeAudit({
      actor_id: session.userId,
      action: 'submit_for_review',
      entity_type: 'milestone',
      entity_id: milestoneId,
      diff: { revision_id: revisionId, title: mr.title },
    });

    // Notify the client.
    const clientUserId = await getContactUserId(p.contact_id);
    if (clientUserId) {
      await notify({
        type: 'revision_requested',
        userId: clientUserId,
        revisionId,
        title: mr.title,
        bodySnippet: `"${mr.title}" is ready for your review.`,
        projectId,
        projectName: p.name,
        clientName: '',
        kind: 'created',
        revisionPath: `/portal/project/${projectId}/revisions/${revisionId}`,
      });
    }

    revalidateProject(projectId);

    return Response.json({ ok: true, revision_id: revisionId });
  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : 'Unexpected error';
    return Response.json({ error: msg }, { status: 500 });
  }
}
