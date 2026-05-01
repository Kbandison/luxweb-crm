import { z } from 'zod';
import { requireAdmin } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';

export const runtime = 'nodejs';

const Schema = z.object({
  // Optional override — UI lets you tweak the note at stop time without
  // having had to set it at start.
  note: z.string().max(2000).nullable().optional(),
});

const MIN_HOURS = 0.01; // ~36 seconds — anything shorter is a misclick.

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

    const sb = supabaseAdmin();
    const { data: timer } = await sb
      .from('time_timers')
      .select('id, project_id, note, started_at')
      .eq('user_id', session.userId)
      .maybeSingle();
    if (!timer) {
      return Response.json({ error: 'No timer running.' }, { status: 404 });
    }

    type Row = {
      id: string;
      project_id: string;
      note: string | null;
      started_at: string;
    };
    const t = timer as Row;

    const elapsedMs = Date.now() - new Date(t.started_at).getTime();
    const hoursRaw = elapsedMs / (1000 * 60 * 60);
    const hours = Math.max(MIN_HOURS, Math.round(hoursRaw * 100) / 100);

    const note =
      parsed.data.note !== undefined ? (parsed.data.note ?? null) : t.note;
    const logDate = new Date().toISOString().slice(0, 10);

    const { data: inserted, error: insertErr } = await sb
      .from('time_logs')
      .insert({
        project_id: t.project_id,
        hours,
        log_date: logDate,
        note,
        created_by: session.userId,
      })
      .select('id')
      .single();

    if (insertErr || !inserted) {
      return Response.json(
        { error: insertErr?.message ?? 'Failed to record time' },
        { status: 500 },
      );
    }

    await sb.from('time_timers').delete().eq('id', t.id);

    await writeAudit({
      actor_id: session.userId,
      action: 'create',
      entity_type: 'time_log',
      entity_id: (inserted as { id: string }).id,
      diff: { project_id: t.project_id, hours, source: 'timer' },
    });

    return Response.json({ ok: true, hours, time_log_id: (inserted as { id: string }).id });
  } catch (err) {
    if (err instanceof Response) return err;
    const msg = err instanceof Error ? err.message : 'Unexpected error';
    return Response.json({ error: msg }, { status: 500 });
  }
}
