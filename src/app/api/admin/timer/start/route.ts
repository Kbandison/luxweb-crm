import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';

export const runtime = 'nodejs';

const Schema = z.object({
  project_id: z.string().uuid(),
  note: z.string().max(2000).nullable().optional(),
});

export async function POST(req: Request) {
  try {
    const session = await requireAdmin();
    const raw = await req.json().catch(() => ({}));
    const parsed = Schema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid payload', issues: parsed.error.issues },
        { status: 400 },
      );
    }

    // upsert keeps "one running timer per user" — restarting on a different
    // project just replaces the existing row.
    const { error } = await supabaseAdmin()
      .from('time_timers')
      .upsert(
        {
          user_id: session.userId,
          project_id: parsed.data.project_id,
          note: parsed.data.note ?? null,
          started_at: new Date().toISOString(),
        },
        { onConflict: 'user_id' },
      );

    if (error) {
      return Response.json({ error: error.message }, { status: 500 });
    }

    await writeAudit({
      actor_id: session.userId,
      action: 'create',
      entity_type: 'time_timer',
      entity_id: parsed.data.project_id,
      diff: { project_id: parsed.data.project_id },
    });

    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : 'Unexpected error';
    return Response.json({ error: msg }, { status: 500 });
  }
}
