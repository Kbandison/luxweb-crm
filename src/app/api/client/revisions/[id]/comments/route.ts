import { z } from 'zod';
import { requireClient } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { getAdminUserIds, notify } from '@/lib/notifications';
import { safeError } from '@/lib/safe-error';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';

function snippet(text: string, max = 240): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max).trimEnd()}…`;
}

const Schema = z.object({
  body: z.string().min(1).max(10000),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireClient();
    const limit = limitByKey(`client/revisions/[id]/comments:${session.userId}`, { capacity: 60, refillPerSec: 60 / 60 });
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

    // Verify the revision belongs to a contact this user owns.
    const { data: rev } = await supabaseAdmin()
      .from('revision_requests')
      .select(
        'id, project_id, title, contacts!inner(user_id, full_name), projects!inner(name)',
      )
      .eq('id', id)
      .single();
    if (!rev) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    type RevRow = {
      project_id: string;
      title: string;
      contacts:
        | { user_id: string | null; full_name: string }
        | { user_id: string | null; full_name: string }[];
      projects: { name: string } | { name: string }[];
    };
    const r = rev as unknown as RevRow;
    const contact = Array.isArray(r.contacts) ? r.contacts[0] : r.contacts;
    const project = Array.isArray(r.projects) ? r.projects[0] : r.projects;
    if (!contact || contact.user_id !== session.userId) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    const name = contact.full_name?.trim() || session.email;

    const { error } = await supabaseAdmin()
      .from('revision_comments')
      .insert({
        revision_id: id,
        author_id: session.userId,
        author_name: name,
        author_role: 'client',
        body: parsed.data.body,
      });

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    await writeAudit({
      actor_id: session.userId,
      action: 'create',
      entity_type: 'revision_comment',
      entity_id: id,
      diff: { revision_id: id, by: 'client' },
    });

    const adminUserIds = await getAdminUserIds();
    if (adminUserIds.length > 0) {
      await Promise.all(
        adminUserIds.map((userId) =>
          notify({
            type: 'revision_requested',
            userId,
            revisionId: id,
            title: r.title,
            bodySnippet: snippet(parsed.data.body),
            projectId: r.project_id,
            projectName: project.name,
            clientName: name,
            kind: 'comment',
            revisionPath: `/admin/projects/${r.project_id}/revisions/${id}`,
          }),
        ),
      );
    }

    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('client/revisions/[id]/comments', err);
  }
}
