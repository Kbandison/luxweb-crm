import { z } from 'zod';
import { requireCapability } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { notify } from '@/lib/notifications';
import { REVISION_STATUSES, REVISION_STATUS_LABEL } from '@/lib/types/revision';
import { safeError } from '@/lib/safe-error';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const PatchSchema = z.object({
  status: z.enum(REVISION_STATUSES),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireCapability('manage_revisions');
    const limit = limitByKey(`admin/revisions/[id]:${session.userId}`, { capacity: 60, refillPerSec: 60 / 60 });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);
    const { id } = await params;
    const raw = await req.json().catch(() => ({}));
    const parsed = PatchSchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid payload', issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const update: Record<string, unknown> = { status: parsed.data.status };
    const isTerminal =
      parsed.data.status === 'resolved' || parsed.data.status === 'wont_do';
    update.resolved_at = isTerminal ? new Date().toISOString() : null;
    update.resolved_by = isTerminal ? session.userId : null;

    const { error } = await supabaseAdmin()
      .from('revision_requests')
      .update(update)
      .eq('id', id);

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    await writeAudit({
      actor_id: session.userId,
      action: 'update',
      entity_type: 'revision',
      entity_id: id,
      diff: { status: parsed.data.status },
    });

    // Notify the client (in-app + email-pref-respecting).
    const { data: rev } = await supabaseAdmin()
      .from('revision_requests')
      .select(
        'id, project_id, title, projects!inner(name, contacts!inner(user_id))',
      )
      .eq('id', id)
      .single();
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
    const r = (rev ?? null) as RevRow | null;
    const project = r
      ? Array.isArray(r.projects)
        ? r.projects[0]
        : r.projects
      : null;
    const contact = project
      ? Array.isArray(project.contacts)
        ? project.contacts[0]
        : project.contacts
      : null;
    if (r && project && contact?.user_id) {
      await notify({
        type: 'revision_updated',
        userId: contact.user_id,
        revisionId: id,
        title: r.title,
        projectId: r.project_id,
        projectName: project.name,
        kind: 'status',
        statusLabel: REVISION_STATUS_LABEL[parsed.data.status],
        revisionPath: `/portal/project/${r.project_id}/revisions/${id}`,
      });
    }

    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('admin/revisions/[id]', err);
  }
}
