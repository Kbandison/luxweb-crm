import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';

export const runtime = 'nodejs';

const STATUSES = ['pending', 'in_progress', 'done', 'blocked'] as const;

const CreateSchema = z.object({
  project_id: z.string().uuid(),
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional().nullable(),
  due_date: z.string().optional().nullable(),
  status: z.enum(STATUSES).default('pending'),
  is_client_visible: z.boolean().default(true),
});

export async function POST(req: Request) {
  try {
    const session = await requireAdmin();
    const raw = await req.json().catch(() => ({}));
    const parsed = CreateSchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid payload', issues: parsed.error.issues },
        { status: 400 },
      );
    }

    // Append at end (max sort_order + 1).
    const { data: existing } = await supabaseAdmin()
      .from('milestones')
      .select('sort_order')
      .eq('project_id', parsed.data.project_id)
      .order('sort_order', { ascending: false })
      .limit(1);
    const nextOrder = ((existing?.[0]?.sort_order as number | undefined) ?? -1) + 1;

    const { data, error } = await supabaseAdmin()
      .from('milestones')
      .insert({
        project_id: parsed.data.project_id,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        due_date: parsed.data.due_date ?? null,
        status: parsed.data.status,
        is_client_visible: parsed.data.is_client_visible,
        sort_order: nextOrder,
      })
      .select()
      .single();

    if (error || !data) {
      return Response.json(
        { error: error?.message ?? 'Insert failed' },
        { status: 500 },
      );
    }

    await writeAudit({
      actor_id: session.userId,
      action: 'create',
      entity_type: 'milestone',
      entity_id: data.id as string,
    });

    return Response.json({ id: data.id });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
