import { requireClient } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { notify, getAdminUserId } from '@/lib/notifications';

export const runtime = 'nodejs';

/**
 * Client approves a milestone review request.
 *
 *   - Flips revision_request status to 'approved'
 *   - Marks the linked milestone as 'done' (with completed_at)
 *   - Unlocks the next inactive milestone (sort_order + 1) → 'pending'
 *   - Notifies admin
 *
 * Only valid against pending_review revisions tied to a milestone the
 * client owns (verified via contacts.user_id join).
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireClient();
    const { id } = await params;
    const sb = supabaseAdmin();

    const { data: row } = await sb
      .from('revision_requests')
      .select(
        `id, status, project_id, milestone_id, contact_id, title,
         contacts!inner(user_id, full_name),
         projects!inner(name)`,
      )
      .eq('id', id)
      .maybeSingle();
    if (!row) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    type Shape = {
      status: string;
      project_id: string;
      milestone_id: string | null;
      contact_id: string;
      title: string;
      contacts:
        | { user_id: string | null; full_name: string }
        | { user_id: string | null; full_name: string }[];
      projects: { name: string } | { name: string }[];
    };
    const r = row as unknown as Shape;
    const contact = Array.isArray(r.contacts) ? r.contacts[0] : r.contacts;
    const project = Array.isArray(r.projects) ? r.projects[0] : r.projects;

    if (!contact || contact.user_id !== session.userId) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    if (r.status !== 'pending_review') {
      return Response.json(
        { error: `Review is ${r.status}; only pending reviews can be approved.` },
        { status: 409 },
      );
    }
    if (!r.milestone_id) {
      return Response.json(
        { error: 'Review is not linked to a milestone.' },
        { status: 400 },
      );
    }

    const approvedAt = new Date().toISOString();

    // Flip review → approved.
    const { error: revErr } = await sb
      .from('revision_requests')
      .update({
        status: 'approved',
        resolved_at: approvedAt,
        resolved_by: session.userId,
      })
      .eq('id', id);
    if (revErr) {
      return Response.json({ error: revErr.message }, { status: 500 });
    }

    // Mark the linked milestone done.
    const { data: ms } = await sb
      .from('milestones')
      .select('id, sort_order, source')
      .eq('id', r.milestone_id)
      .maybeSingle();
    type MR = { sort_order: number; source: string };
    const m = ms as unknown as MR | null;

    await sb
      .from('milestones')
      .update({ status: 'done', completed_at: approvedAt })
      .eq('id', r.milestone_id);

    // Unlock the next inactive milestone in sort_order, if any. Only does
    // anything for proposal-source chains; manual milestones don't have
    // a "next" relationship.
    if (m) {
      const { data: nextRows } = await sb
        .from('milestones')
        .select('id, status, sort_order')
        .eq('project_id', r.project_id)
        .gt('sort_order', m.sort_order)
        .order('sort_order', { ascending: true })
        .limit(1);
      type Next = { id: string; status: string };
      const next = ((nextRows ?? []) as Next[])[0];
      if (next && next.status === 'inactive') {
        await sb
          .from('milestones')
          .update({ status: 'pending' })
          .eq('id', next.id);
      }
    }

    await writeAudit({
      actor_id: session.userId,
      action: 'approve',
      entity_type: 'revision_request',
      entity_id: id,
      diff: { milestone_id: r.milestone_id, by: 'client' },
    });

    // Notify admin.
    const adminId = await getAdminUserId();
    if (adminId) {
      await notify({
        type: 'revision_updated',
        userId: adminId,
        revisionId: id,
        title: r.title,
        projectId: r.project_id,
        projectName: project?.name ?? '—',
        kind: 'status',
        statusLabel: 'Approved',
        revisionPath: `/admin/projects/${r.project_id}/revisions/${id}`,
      });
    }

    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : 'Unexpected error';
    return Response.json({ error: msg }, { status: 500 });
  }
}
