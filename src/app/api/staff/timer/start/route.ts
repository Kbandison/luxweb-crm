import { z } from 'zod';
import { requireContractor } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { isContractorAssigned } from '@/lib/staff/access';
import { safeError } from '@/lib/safe-error';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';

export const runtime = 'nodejs';

const Schema = z.object({
  project_id: z.string().uuid(),
  note: z.string().max(500).optional().nullable(),
});

/**
 * POST /api/staff/timer/start — start a stopwatch on an assigned project.
 * One running timer per user (enforced by the unique user_id on
 * crm.time_timers); a second start returns 409 until the current one is
 * stopped.
 */
export async function POST(req: Request) {
  try {
    const session = await requireContractor();
    const limit = limitByKey(`staff/timer:${session.userId}`, {
      capacity: 30,
      refillPerSec: 30 / 60,
    });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);

    const raw = await req.json().catch(() => ({}));
    const parsed = Schema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid payload', issues: parsed.error.issues },
        { status: 400 },
      );
    }

    if (!(await isContractorAssigned(session.userId, parsed.data.project_id))) {
      return Response.json({ error: 'Not found' }, { status: 404 });
    }

    const sb = supabaseAdmin();
    // Already running? (unique user_id would reject the insert anyway.)
    const { data: existing } = await sb
      .from('time_timers')
      .select('id')
      .eq('user_id', session.userId)
      .maybeSingle();
    if (existing) {
      return Response.json(
        { error: 'You already have a running timer. Stop it first.' },
        { status: 409 },
      );
    }

    const { data, error } = await sb
      .from('time_timers')
      .insert({
        user_id: session.userId,
        project_id: parsed.data.project_id,
        note: parsed.data.note ?? null,
      })
      .select('id, started_at')
      .single();
    if (error || !data) {
      return Response.json(
        { error: error?.message ?? 'Could not start timer' },
        { status: 500 },
      );
    }

    return Response.json({ ok: true, id: data.id, started_at: data.started_at });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('staff/timer/start', err);
  }
}
