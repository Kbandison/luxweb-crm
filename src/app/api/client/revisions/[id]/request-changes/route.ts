import { z } from 'zod';
import { requireClient } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { notify, getAdminUserIds } from '@/lib/notifications';
import { revalidateProject } from '@/lib/cache/revalidate-project';
import { safeError } from '@/lib/safe-error';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';
import { flattenJoin } from '@/lib/array-join';

export const runtime = 'nodejs';

const Schema = z.object({
  body: z.string().min(1).max(10000),
});

function snippet(text: string, max = 240): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max).trimEnd()}…`;
}

/**
 * Client requests changes on a milestone review.
 *
 *   - Posts the feedback as a revision_comment (author_role='client')
 *   - Flips revision_request status to 'changes_requested'
 *   - Reverts the linked milestone back to 'pending' so admin can
 *     iterate, re-submit when ready
 *   - Notifies admin
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireClient();
    const limit = limitByKey(`client/revisions/[id]/request-changes:${session.userId}`, { capacity: 60, refillPerSec: 60 / 60 });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);
    const { id } = await params;
    const raw = await req.json().catch(() => ({}));
    const parsed = Schema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid payload', issues: parsed.error.issues },
        { status: 400 },
      );
    }

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
    const contact = flattenJoin(r.contacts);
    const project = flattenJoin(r.projects);

    if (!contact || contact.user_id !== session.userId) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    if (r.status !== 'pending_review') {
      return Response.json(
        {
          error: `Review is ${r.status}; can only request changes on a pending review.`,
        },
        { status: 409 },
      );
    }

    // Capture client name for the comment author label.
    const name = contact.full_name?.trim() || session.email;

    // 1) Post the feedback as a comment.
    await sb.from('revision_comments').insert({
      revision_id: id,
      author_id: session.userId,
      author_name: name,
      author_role: 'client',
      body: parsed.data.body,
    });

    // 2) Flip review → changes_requested.
    // Milestone status STAYS in_progress so the same thread remains the
    // active review surface — admin replies via comments, then calls
    // /reopen to ping the client for re-review without spawning a new
    // revision_request.
    await sb
      .from('revision_requests')
      .update({ status: 'changes_requested' })
      .eq('id', id);

    await writeAudit({
      actor_id: session.userId,
      action: 'request_changes',
      entity_type: 'revision_request',
      entity_id: id,
      diff: { milestone_id: r.milestone_id, by: 'client' },
    });

    // Notify admin(s).
    const adminIds = await getAdminUserIds();
    if (adminIds.length > 0) {
      await Promise.all(
        adminIds.map((userId) =>
          notify({
            type: 'revision_requested',
            userId,
            revisionId: id,
            title: r.title,
            bodySnippet: snippet(parsed.data.body),
            projectId: r.project_id,
            projectName: project?.name ?? '—',
            clientName: contact.full_name,
            kind: 'comment',
            revisionPath: `/admin/projects/${r.project_id}/revisions/${id}`,
          }),
        ),
      );
    }

    revalidateProject(r.project_id);

    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('client/revisions/[id]/request-changes', err);
  }
}
