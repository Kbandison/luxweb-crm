import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';

export const runtime = 'nodejs';

const CreateSchema = z.object({
  project_id: z.string().uuid(),
  hours: z.number().positive().max(99.99),
  log_date: z.string(),
  note: z.string().max(500).optional().nullable(),
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

    const { data, error } = await supabaseAdmin()
      .from('time_logs')
      .insert({
        project_id: parsed.data.project_id,
        hours: parsed.data.hours,
        log_date: parsed.data.log_date,
        note: parsed.data.note ?? null,
        created_by: session.userId,
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
      entity_type: 'time_log',
      entity_id: data.id as string,
    });

    return Response.json({ id: data.id });
  } catch (err) {
    if (err instanceof Response) return err;
    return Response.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
