import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { notify } from '@/lib/notifications';

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
    const session = await requireAdmin();
    const { id } = await params;
    const raw = await req.json().catch(() => ({}));
    const parsed = Schema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid payload', issues: parsed.error.issues },
        { status: 400 },
      );
    }

    // Verify revision exists; pull project + recipient for notify().
    const { data: rev } = await supabaseAdmin()
      .from('revision_requests')
      .select(
        'id, project_id, title, projects!inner(name, contacts!inner(user_id))',
      )
      .eq('id', id)
      .single();
    if (!rev) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    type RevRow = {
      project_id: string;
      title: string;
      projects:
        | {
            name: string;
            contacts:
              | { user_id: string | null }
              | { user_id: string | null }[];
          }
        | {
            name: string;
            contacts:
              | { user_id: string | null }
              | { user_id: string | null }[];
          }[];
    };
    const r = rev as unknown as RevRow;
    const project = Array.isArray(r.projects) ? r.projects[0] : r.projects;
    const contact = Array.isArray(project.contacts)
      ? project.contacts[0]
      : project.contacts;

    const { data: profile } = await supabaseAdmin()
      .from('users')
      .select('full_name, email')
      .eq('id', session.userId)
      .single();
    type Profile = { full_name: string | null; email: string };
    const p = profile as Profile | null;
    const name = p?.full_name?.trim() || p?.email || 'Admin';

    const { error } = await supabaseAdmin()
      .from('revision_comments')
      .insert({
        revision_id: id,
        author_id: session.userId,
        author_name: name,
        author_role: 'admin',
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
      diff: { revision_id: id, by: 'admin' },
    });

    if (contact?.user_id) {
      await notify({
        type: 'revision_updated',
        userId: contact.user_id,
        revisionId: id,
        title: r.title,
        projectId: r.project_id,
        projectName: project.name,
        kind: 'comment',
        snippet: snippet(parsed.data.body),
        revisionPath: `/portal/project/${r.project_id}/revisions/${id}`,
      });
    }

    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : 'Unexpected error';
    return Response.json({ error: msg }, { status: 500 });
  }
}
