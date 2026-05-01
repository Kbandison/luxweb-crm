import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';

export const runtime = 'nodejs';

const Schema = z.object({
  rating: z.number().int().min(1).max(5),
  notes: z.string().min(1).max(5000),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await requireAdmin();
    const { id: projectId } = await params;
    const raw = await req.json().catch(() => ({}));
    const parsed = Schema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid payload', issues: parsed.error.issues },
        { status: 400 },
      );
    }

    const submittedAt = new Date().toISOString();

    const { error } = await supabaseAdmin()
      .from('project_reviews')
      .upsert(
        {
          project_id: projectId,
          admin_rating: parsed.data.rating,
          admin_notes: parsed.data.notes,
          admin_submitted_at: submittedAt,
          admin_submitted_by: session.userId,
        },
        { onConflict: 'project_id' },
      );

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    await writeAudit({
      actor_id: session.userId,
      action: 'create',
      entity_type: 'project_review',
      entity_id: projectId,
      diff: { rating: parsed.data.rating, by: 'admin', private: true },
    });

    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : 'Unexpected error';
    return Response.json({ error: msg }, { status: 500 });
  }
}
