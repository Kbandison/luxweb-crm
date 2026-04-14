import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { notify, getContactUserId } from '@/lib/notifications';

export const runtime = 'nodejs';

const STATUSES = ['pending', 'in_progress', 'done', 'blocked'] as const;

const UpdateSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).nullable().optional(),
  due_date: z.string().nullable().optional(),
  status: z.enum(STATUSES).optional(),
  is_client_visible: z.boolean().optional(),
  sort_order: z.number().int().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAdmin();
    const { id } = await params;
    const raw = await req.json().catch(() => ({}));
    const parsed = UpdateSchema.safeParse(raw);
    if (!parsed.success || Object.keys(parsed.data).length === 0) {
      return Response.json({ error: 'Invalid payload' }, { status: 400 });
    }

    // Auto-stamp completed_at when transitioning to done.
    const update: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.status === 'done') {
      update.completed_at = new Date().toISOString();
    } else if (parsed.data.status) {
      // Any non-done transition clears the completion timestamp.
      update.completed_at = null;
    }

    const { data: before } = await supabaseAdmin()
      .from('milestones')
      .select()
      .eq('id', id)
      .single();
    const { error } = await supabaseAdmin()
      .from('milestones')
      .update(update)
      .eq('id', id);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    await writeAudit({
      actor_id: session.userId,
      action: 'update',
      entity_type: 'milestone',
      entity_id: id,
      diff: { before, after: update },
    });

    // Notify the client when a client-visible milestone's status changes.
    if (
      parsed.data.status &&
      before &&
      before.status !== parsed.data.status &&
      (update.is_client_visible ?? before.is_client_visible) === true &&
      before.project_id
    ) {
      const { data: project } = await supabaseAdmin()
        .from('projects')
        .select('id, name, contact_id')
        .eq('id', before.project_id as string)
        .single();
      if (project?.contact_id) {
        const clientUserId = await getContactUserId(
          project.contact_id as string,
        );
        if (clientUserId) {
          await notify({
            type: 'milestone_updated',
            userId: clientUserId,
            milestoneId: id,
            milestoneTitle: (before.title as string) ?? 'Milestone',
            projectId: project.id as string,
            projectName: (project.name as string) ?? 'Project',
            status: parsed.data.status,
            projectPath: `/portal/project/${project.id}`,
          });
        }
      }
    }

    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: 'Unexpected error' }, { status: 500 });
  }
}

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAdmin();
    const { id } = await params;
    const { error } = await supabaseAdmin()
      .from('milestones')
      .delete()
      .eq('id', id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    await writeAudit({
      actor_id: session.userId,
      action: 'delete',
      entity_type: 'milestone',
      entity_id: id,
    });
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
