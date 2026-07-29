import { requireCapability } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { safeError } from '@/lib/safe-error';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';
import { UpdateOutreachSettingsSchema } from '@/lib/validation/outreach';

export const runtime = 'nodejs';

function validTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * PATCH /api/admin/outreach-settings — targets, commission rate, and booking
 * availability (timezone / days / hours). Requires `manage_outreach`. There's
 * a single settings row (id = true).
 */
export async function PATCH(req: Request) {
  try {
    const session = await requireCapability('manage_outreach');
    const limit = limitByKey(`outreach/settings:${session.userId}`, {
      capacity: 30,
      refillPerSec: 30 / 60,
    });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);

    const raw = await req.json().catch(() => ({}));
    const parsed = UpdateOutreachSettingsSchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid payload', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const d = parsed.data;

    if (d.slot_timezone && !validTimeZone(d.slot_timezone)) {
      return Response.json({ error: 'Unknown time zone.' }, { status: 400 });
    }
    if (d.slot_hours) {
      for (const [day, hrs] of Object.entries(d.slot_hours)) {
        if (hrs.end <= hrs.start) {
          return Response.json(
            { error: `End must be after start (day ${day}).` },
            { status: 400 },
          );
        }
      }
    }

    const patch: Record<string, unknown> = {};
    for (const key of [
      'daily_dial_target',
      'weekly_booked_target',
      'commission_rate',
      'slot_timezone',
      'slot_hours',
    ] as const) {
      if (key in d) patch[key] = d[key];
    }
    if (Object.keys(patch).length === 0) return Response.json({ ok: true });
    patch.updated_at = new Date().toISOString();

    const { error } = await supabaseAdmin()
      .from('outreach_settings')
      .update(patch)
      .eq('id', true);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    await writeAudit({
      actor_id: session.userId,
      action: 'update',
      entity_type: 'outreach_settings',
      diff: patch,
    });
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('admin/outreach-settings PATCH', err);
  }
}
