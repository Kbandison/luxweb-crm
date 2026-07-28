import { requireCapability } from '@/lib/auth/guards';
import { supabaseAdmin } from '@/lib/supabase/admin';
import { writeAudit } from '@/lib/audit';
import { safeError } from '@/lib/safe-error';
import { limitByKey, rateLimitResponse } from '@/lib/rate-limit';
import { BookAppointmentSchema } from '@/lib/validation/outreach';
import { getOwnerUserId } from '@/lib/queries/outreach';
import { createCalendarEvent } from '@/lib/google/calendar';

export const runtime = 'nodejs';

/**
 * POST /api/outreach/appointments — book a meeting. The appointment is
 * assigned to the studio owner (whose calendar it lands on) and the prospect
 * is invited via Google Calendar (if the owner has connected it). The local
 * row is the source of truth — a missing/failed calendar sync doesn't block
 * the booking.
 */
export async function POST(req: Request) {
  try {
    const session = await requireCapability('manage_outreach');
    const limit = limitByKey(`outreach/appts:${session.userId}`, {
      capacity: 60,
      refillPerSec: 60 / 60,
    });
    if (!limit.ok) return rateLimitResponse(limit.retryAfterSec);

    const raw = await req.json().catch(() => ({}));
    const parsed = BookAppointmentSchema.safeParse(raw);
    if (!parsed.success) {
      return Response.json(
        { error: 'Invalid payload', issues: parsed.error.issues },
        { status: 400 },
      );
    }
    const d = parsed.data;

    // A setter may only book from their own prospects.
    if (d.prospect_id && session.role === 'setter') {
      const { data: p } = await supabaseAdmin()
        .from('prospects')
        .select('owner_id')
        .eq('id', d.prospect_id)
        .maybeSingle();
      if ((p as { owner_id: string | null } | null)?.owner_id !== session.userId) {
        return Response.json({ error: 'Not found' }, { status: 404 });
      }
    }

    const durationMin = d.duration_min ?? 30;
    const startMs = new Date(d.scheduled_at).getTime();
    if (!Number.isFinite(startMs)) {
      return Response.json({ error: 'Invalid date/time' }, { status: 400 });
    }
    const startIso = new Date(startMs).toISOString();
    const endIso = new Date(startMs + durationMin * 60_000).toISOString();

    const ownerId = await getOwnerUserId();
    let googleEventId: string | null = null;
    if (ownerId) {
      googleEventId = await createCalendarEvent(ownerId, {
        summary: `Discovery call — ${d.business_name ?? d.contact_name}`,
        description: [
          d.notes,
          d.phone ? `Phone: ${d.phone}` : null,
          `Booked by the outreach team.`,
        ]
          .filter(Boolean)
          .join('\n'),
        startIso,
        endIso,
        attendeeEmail: d.email ?? null,
      });
    }

    const { data, error } = await supabaseAdmin()
      .from('appointments')
      .insert({
        prospect_id: d.prospect_id ?? null,
        setter_id: session.userId,
        assigned_to: ownerId,
        business_name: d.business_name ?? null,
        contact_name: d.contact_name,
        phone: d.phone ?? null,
        email: d.email ?? null,
        scheduled_at: startIso,
        duration_min: durationMin,
        google_event_id: googleEventId,
        notes: d.notes ?? null,
      })
      .select('id')
      .single();
    if (error || !data) {
      return Response.json(
        { error: error?.message ?? 'Could not book' },
        { status: 500 },
      );
    }

    await writeAudit({
      actor_id: session.userId,
      action: 'create',
      entity_type: 'appointment',
      entity_id: (data as { id: string }).id,
      diff: { synced: Boolean(googleEventId) },
    });

    return Response.json({ id: (data as { id: string }).id, synced: Boolean(googleEventId) });
  } catch (err) {
    if (err instanceof Response) return err;
    return safeError('outreach/appointments POST', err);
  }
}
