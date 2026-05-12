import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { notify, getContactUserId } from '@/lib/notifications';
import { revalidateProject } from '@/lib/cache/revalidate-project';

export const runtime = 'nodejs';

const STATUSES = [
  'planning',
  'in_progress',
  'on_hold',
  'completed',
  'cancelled',
] as const;

const UpdateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  status: z.enum(STATUSES).optional(),
  start_date: z.string().nullable().optional(),
  end_date: z.string().nullable().optional(),
  budget_cents: z.number().int().min(0).nullable().optional(),
  profitability_cents: z.number().int().nullable().optional(),
  hourly_rate_cents: z.number().int().min(0).nullable().optional(),
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

    const { data: before } = await supabaseAdmin()
      .from('projects')
      .select()
      .eq('id', id)
      .single();
    const { error } = await supabaseAdmin()
      .from('projects')
      .update(parsed.data)
      .eq('id', id);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    await writeAudit({
      actor_id: session.userId,
      action: 'update',
      entity_type: 'project',
      entity_id: id,
      diff: { before, after: parsed.data },
    });

    // If admin manually flipped status → 'completed', mirror what the
    // milestone-driven completion path does: notify the client (review
    // prompt) and revalidate cached client pages so the dashboard
    // demotes the project out of the focus slot immediately.
    const beforeStatus = (before as { status?: string } | null)?.status;
    if (
      parsed.data.status === 'completed' &&
      beforeStatus &&
      beforeStatus !== 'completed'
    ) {
      const projRow = before as
        | { name?: string; contact_id?: string }
        | null;
      if (projRow?.contact_id) {
        try {
          const clientUserId = await getContactUserId(projRow.contact_id);
          if (clientUserId) {
            await notify({
              type: 'project_completed',
              userId: clientUserId,
              projectId: id,
              projectName: projRow.name ?? 'Project',
              projectPath: `/portal/project/${id}`,
            });
          }
        } catch (err) {
          console.warn('[project PATCH] project_completed notify failed:', err);
        }
      }
    }

    // Always revalidate cached project pages on any admin update so the
    // client portal picks up status changes without a hard reload.
    revalidateProject(id);

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
      .from('projects')
      .delete()
      .eq('id', id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    await writeAudit({
      actor_id: session.userId,
      action: 'delete',
      entity_type: 'project',
      entity_id: id,
    });
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
