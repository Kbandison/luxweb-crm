import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { notify } from '@/lib/notifications';
import { revalidateProject } from '@/lib/cache/revalidate-project';

export const runtime = 'nodejs';

const Schema = z.object({
  body: z.string().min(1).max(10000).optional(),
});

function snippet(text: string, max = 240): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max).trimEnd()}…`;
}

/**
 * Admin re-opens a revision for client review after iterating on the
 * client's feedback. Used instead of creating a brand-new revision per
 * round-trip — the same thread keeps growing.
 *
 *   - Flips revision_requests.status changes_requested → pending_review
 *   - Optional `body` is posted as an admin comment in the same call,
 *     so the admin can pair the ping with a "here's what changed" note
 *   - Notifies the client (in-app + email) that the review is back in
 *     their court
 *
 * Idempotent: if the revision is already pending_review (e.g. admin
 * double-tapped the button), returns ok without doing anything.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAdmin();
    const { id } = await params;
    const raw = await req.json().catch(() => ({}));
    const parsed = Schema.safeParse(raw);
    if (!parsed.success) {
      return Response.json({ error: 'Invalid payload' }, { status: 400 });
    }

    const sb = supabaseAdmin();
    const { data: row } = await sb
      .from('revision_requests')
      .select(
        `id, status, project_id, milestone_id, title,
         projects!inner(name, contacts!inner(user_id, full_name))`,
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
      title: string;
      projects:
        | {
            name: string;
            contacts:
              | { user_id: string | null; full_name: string }
              | { user_id: string | null; full_name: string }[];
          }
        | {
            name: string;
            contacts:
              | { user_id: string | null; full_name: string }
              | { user_id: string | null; full_name: string }[];
          }[];
    };
    const r = row as unknown as Shape;
    const project = Array.isArray(r.projects) ? r.projects[0] : r.projects;
    const contact = Array.isArray(project.contacts)
      ? project.contacts[0]
      : project.contacts;

    if (r.status === 'approved') {
      return Response.json(
        { error: 'Already approved — cannot reopen.' },
        { status: 409 },
      );
    }
    if (r.status === 'pending_review') {
      return Response.json({ ok: true, already_open: true });
    }
    if (r.status !== 'changes_requested') {
      return Response.json(
        { error: `Cannot reopen a "${r.status}" review.` },
        { status: 409 },
      );
    }

    // 1) Post the admin's note (if any) as a comment in the same thread.
    if (parsed.data.body) {
      const { data: profile } = await sb
        .from('users')
        .select('full_name, email')
        .eq('id', session.userId)
        .single();
      type Profile = { full_name: string | null; email: string };
      const p = profile as Profile | null;
      const name = p?.full_name?.trim() || p?.email || 'Admin';
      await sb.from('revision_comments').insert({
        revision_id: id,
        author_id: session.userId,
        author_name: name,
        author_role: 'admin',
        body: parsed.data.body,
      });
    }

    // 2) Flip review back to pending_review.
    await sb
      .from('revision_requests')
      .update({ status: 'pending_review' })
      .eq('id', id);

    // 3) Make sure the milestone is still in_progress (it should be, but
    //    guard against legacy rows that reverted on the prior code path).
    if (r.milestone_id) {
      await sb
        .from('milestones')
        .update({ status: 'in_progress' })
        .eq('id', r.milestone_id);
    }

    await writeAudit({
      actor_id: session.userId,
      action: 'reopen',
      entity_type: 'revision_request',
      entity_id: id,
      diff: { milestone_id: r.milestone_id, posted_comment: !!parsed.data.body },
    });

    if (contact?.user_id) {
      await notify({
        type: 'revision_requested',
        userId: contact.user_id,
        revisionId: id,
        title: r.title,
        bodySnippet: parsed.data.body
          ? snippet(parsed.data.body)
          : `"${r.title}" is ready for another look.`,
        projectId: r.project_id,
        projectName: project.name,
        clientName: contact.full_name,
        kind: 'created',
        revisionPath: `/portal/project/${r.project_id}/revisions/${id}`,
      });
    }

    revalidateProject(r.project_id);

    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : 'Unexpected error';
    return Response.json({ error: msg }, { status: 500 });
  }
}
