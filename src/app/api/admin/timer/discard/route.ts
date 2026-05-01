import { requireAdmin } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';

export const runtime = 'nodejs';

export async function POST(_req: Request) {
  try {
    const session = await requireAdmin();
    const sb = supabaseAdmin();

    const { data: timer } = await sb
      .from('time_timers')
      .select('id, project_id, started_at')
      .eq('user_id', session.userId)
      .maybeSingle();
    if (!timer) {
      return Response.json({ ok: true });
    }

    const t = timer as {
      id: string;
      project_id: string;
      started_at: string;
    };

    await sb.from('time_timers').delete().eq('id', t.id);

    const elapsedMs = Date.now() - new Date(t.started_at).getTime();
    await writeAudit({
      actor_id: session.userId,
      action: 'delete',
      entity_type: 'time_timer',
      entity_id: t.id,
      diff: {
        project_id: t.project_id,
        elapsed_seconds: Math.round(elapsedMs / 1000),
      },
    });

    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : 'Unexpected error';
    return Response.json({ error: msg }, { status: 500 });
  }
}
