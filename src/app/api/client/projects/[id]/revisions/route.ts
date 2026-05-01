import { z } from 'zod';
import { requireClient } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { getAdminUserId, notify } from '@/lib/notifications';

export const runtime = 'nodejs';

function snippet(text: string, max = 240): string {
  const t = text.trim();
  return t.length <= max ? t : `${t.slice(0, max).trimEnd()}…`;
}

const Schema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(10000),
  milestone_id: z.string().uuid().nullable().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireClient();
    const { id: projectId } = await params;
    const raw = await req.json().catch(() => ({}));
    const parsed = Schema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid payload', issues: parsed.error.issues },
        { status: 400 },
      );
    }

    // Verify the project belongs to a contact this user owns.
    const { data: project } = await supabaseAdmin()
      .from('projects')
      .select('id, name, contact_id, contacts!inner(user_id, full_name)')
      .eq('id', projectId)
      .single();
    if (!project) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }
    type ProjectRow = {
      name: string;
      contact_id: string;
      contacts:
        | { user_id: string | null; full_name: string }
        | { user_id: string | null; full_name: string }[];
    };
    const p = project as unknown as ProjectRow;
    const contact = Array.isArray(p.contacts) ? p.contacts[0] : p.contacts;
    if (!contact || contact.user_id !== session.userId) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    // If a milestone_id is given, verify it belongs to this project.
    if (parsed.data.milestone_id) {
      const { data: m } = await supabaseAdmin()
        .from('milestones')
        .select('id, project_id')
        .eq('id', parsed.data.milestone_id)
        .single();
      const mr = m as { project_id: string } | null;
      if (!mr || mr.project_id !== projectId) {
        return Response.json(
          { error: 'Milestone does not belong to this project.' },
          { status: 400 },
        );
      }
    }

    const { data, error } = await supabaseAdmin()
      .from('revision_requests')
      .insert({
        project_id: projectId,
        milestone_id: parsed.data.milestone_id ?? null,
        contact_id: p.contact_id,
        title: parsed.data.title,
        body: parsed.data.body,
      })
      .select('id')
      .single();

    if (error || !data) {
      return Response.json(
        { error: error?.message ?? 'Failed to create' },
        { status: 500 },
      );
    }

    const revisionId = (data as { id: string }).id;

    await writeAudit({
      actor_id: session.userId,
      action: 'create',
      entity_type: 'revision',
      entity_id: revisionId,
      diff: { project_id: projectId, by: 'client' },
    });

    // Fan out to admin (in-app + email-pref-respecting).
    const adminUserId = await getAdminUserId();
    if (adminUserId) {
      await notify({
        type: 'revision_requested',
        userId: adminUserId,
        revisionId,
        title: parsed.data.title,
        bodySnippet: snippet(parsed.data.body),
        projectId,
        projectName: p.name,
        clientName: contact.full_name,
        kind: 'created',
        revisionPath: `/admin/projects/${projectId}/revisions/${revisionId}`,
      });
    }

    return Response.json({ ok: true, id: revisionId });
  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : 'Unexpected error';
    return Response.json({ error: msg }, { status: 500 });
  }
}
