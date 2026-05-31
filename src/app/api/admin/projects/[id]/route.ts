import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { notify, getContactUserId } from '@/lib/notifications';
import { revalidateProject } from '@/lib/cache/revalidate-project';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';
import { isSafeHttpUrl, normalizeHttpUrl } from '@/lib/validation/url';

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
  // archived_at: ISO timestamp to archive, or null to unarchive.
  // Admin-only; clients never see archived flag transitions.
  archived_at: z.string().nullable().optional(),
  // Temporary staging/preview URL. Accepts a bare domain or http(s) URL;
  // anything else (javascript:, data:, …) is rejected. Null/'' clears it.
  preview_url: z
    .string()
    .nullable()
    .optional()
    .refine(isSafeHttpUrl, 'Enter a valid http(s) link'),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAdmin();
    const limit = limitByKey(`admin/projects/[id]:${session.userId}`, { capacity: 60, refillPerSec: 60 / 60 });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);
    const { id } = await params;
    const raw = await req.json().catch(() => ({}));
    const parsed = UpdateSchema.safeParse(raw);
    if (!parsed.success || Object.keys(parsed.data).length === 0) {
      return Response.json({ error: 'Invalid payload' }, { status: 400 });
    }

    // Canonicalize the preview URL (prepend https:// to bare domains, '' → null)
    // so the stored value is always a working absolute link or cleared.
    if (parsed.data.preview_url !== undefined) {
      parsed.data.preview_url = normalizeHttpUrl(parsed.data.preview_url);
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
    const limit = limitByKey(`admin/projects/[id]:${session.userId}`, { capacity: 60, refillPerSec: 60 / 60 });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);
    const { id } = await params;
    const sb = supabaseAdmin();

    // Polymorphic notes have no FK — clean up before the project row goes
    // so we don't leave orphans. Best-effort: failure here doesn't block
    // the main delete.
    try {
      await sb
        .from('notes')
        .delete()
        .eq('entity_type', 'project')
        .eq('entity_id', id);
    } catch (err) {
      console.warn('[projects.delete] notes cleanup failed:', err);
    }

    const { error } = await sb.from('projects').delete().eq('id', id);
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
