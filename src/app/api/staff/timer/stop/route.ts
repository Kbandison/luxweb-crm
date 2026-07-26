import { requireContractor } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { contractorTeamMemberId } from '@/lib/staff/access';
import { safeError } from '@/lib/safe-error';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';

/**
 * POST /api/staff/timer/stop — stop the caller's running timer: compute the
 * elapsed hours, write a crm.time_logs row attributed to the contractor
 * (created_by + team_member_id), and delete the timer. Mirrors the admin
 * stop semantics from crm_time_timers.sql.
 */
export async function POST() {
  try {
    const session = await requireContractor();
    const limit = limitByKey(`staff/timer:${session.userId}`, {
      capacity: 30,
      refillPerSec: 30 / 60,
    });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);

    const sb = supabaseAdmin();
    const { data: timer } = await sb
      .from('time_timers')
      .select('id, project_id, note, started_at')
      .eq('user_id', session.userId)
      .maybeSingle();
    if (!timer) {
      return Response.json({ error: 'No running timer.' }, { status: 400 });
    }

    const startedAt = new Date(timer.started_at as string).getTime();
    const elapsedHours = (Date.now() - startedAt) / 3_600_000;
    // time_logs.hours has a `hours > 0` check; floor tiny durations to 0.01.
    const hours = Math.max(0.01, Math.round(elapsedHours * 100) / 100);
    const logDate = new Date().toISOString().slice(0, 10);
    const teamMemberId = await contractorTeamMemberId(session.userId);

    const { data: log, error } = await sb
      .from('time_logs')
      .insert({
        project_id: timer.project_id,
        hours,
        log_date: logDate,
        note: timer.note ?? null,
        created_by: session.userId,
        team_member_id: teamMemberId,
      })
      .select('id, hours')
      .single();
    if (error || !log) {
      return Response.json(
        { error: error?.message ?? 'Could not save time log' },
        { status: 500 },
      );
    }

    await sb.from('time_timers').delete().eq('id', timer.id as string);

    return Response.json({ ok: true, id: log.id, hours: log.hours });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('staff/timer/stop', err);
  }
}
